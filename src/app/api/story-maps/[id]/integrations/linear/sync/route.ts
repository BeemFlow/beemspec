import { NextResponse } from 'next/server';
import { syncStoriesByIdList } from '@/app/api/integrations/linear/sync/route';
import { resolveLinearAuthTokenForTeam } from '@/integrations/linear/auth';
import { getLinearIssueSync } from '@/integrations/linear/helpers';
import { findStoryMapImportCandidate, importLinearIssueIntoStoryMap } from '@/integrations/linear/import';
import { getTeamIdForStoryMap } from '@/integrations/linear/settings';
import { getStoryLinearLinkByLinearIssueId } from '@/integrations/linear/story-links';
import { requireAuth } from '@/lib/auth';
import { serverErrorResponse } from '@/lib/errors';
import { normalize } from '@/lib/strings';
import { createClient } from '@/lib/supabase/server';
import { invalidIdResponse, isValidUuid } from '@/lib/validations';

interface LinearIssueImportCandidate {
  id: string;
  teamId: string;
  projectId: string | null;
  labelNames: string[];
  identifier: string | null;
  title: string | null;
  description: string | null;
  stateName: string | null;
  updatedAt: string;
}

async function listLinearProjectIssuesByLabel(input: {
  accessToken: string;
  projectId: string;
}): Promise<LinearIssueImportCandidate[]> {
  const issues: LinearIssueImportCandidate[] = [];
  let cursor: string | null = null;

  const query = `
    query ManualStoryMapImport($projectId: String!, $cursor: String) {
      issues(
        first: 100
        after: $cursor
        filter: { project: { id: { eq: $projectId } } }
      ) {
        nodes {
          id
          team { id }
          project { id }
          identifier
          title
          description
          archivedAt
          labels { nodes { name } }
          updatedAt
          state { name }
        }
        pageInfo {
          hasNextPage
          endCursor
        }
      }
    }
  `;

  do {
    const response = await fetch('https://api.linear.app/graphql', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${input.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query,
        variables: {
          projectId: input.projectId,
          cursor,
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`Linear query failed with status ${response.status}`);
    }

    const payload = (await response.json()) as {
      data?: {
        issues?: {
          nodes?: Array<{
            id?: string | null;
            team?: { id?: string | null } | null;
            project?: { id?: string | null } | null;
            identifier?: string | null;
            title?: string | null;
            description?: string | null;
            archivedAt?: string | null;
            labels?: { nodes?: Array<{ name?: string | null } | null> | null } | null;
            updatedAt?: string | null;
            state?: { name?: string | null } | null;
          } | null>;
          pageInfo?: { hasNextPage?: boolean | null; endCursor?: string | null } | null;
        };
      };
      errors?: Array<{ message?: string }>;
    };

    if (Array.isArray(payload.errors) && payload.errors.length > 0) {
      throw new Error(payload.errors[0]?.message ?? 'Linear query returned errors');
    }

    const nodes = payload.data?.issues?.nodes ?? [];
    for (const node of nodes) {
      const id = typeof node?.id === 'string' ? node.id : null;
      const teamId = typeof node?.team?.id === 'string' ? node.team.id : null;
      const updatedAt = typeof node?.updatedAt === 'string' ? node.updatedAt : null;
      if (!id || !teamId || !updatedAt) continue;

      if (typeof node?.archivedAt === 'string' && node.archivedAt.length > 0) continue;

      const labelNames = (node?.labels?.nodes ?? [])
        .map((entry) => (typeof entry?.name === 'string' ? entry.name.trim() : ''))
        .filter((name) => name.length > 0);

      issues.push({
        id,
        teamId,
        projectId: typeof node?.project?.id === 'string' ? node.project.id : null,
        labelNames,
        identifier: typeof node?.identifier === 'string' ? node.identifier : null,
        title: typeof node?.title === 'string' ? node.title : null,
        description: typeof node?.description === 'string' ? node.description : null,
        stateName: typeof node?.state?.name === 'string' ? node.state.name : null,
        updatedAt,
      });
    }

    const pageInfo = payload.data?.issues?.pageInfo;
    const hasNextPage = Boolean(pageInfo?.hasNextPage);
    cursor = hasNextPage ? (pageInfo?.endCursor ?? null) : null;
  } while (cursor);

  return issues;
}

async function runManualImportForStoryMap(
  supabase: Awaited<ReturnType<typeof createClient>>,
  storyMapId: string,
): Promise<{ considered: number; imported: number; skipped: number }> {
  const { data: settings } = await supabase
    .from('story_map_integration_settings')
    .select('linear_project_id')
    .eq('story_map_id', storyMapId)
    .maybeSingle<{ linear_project_id: string | null }>();

  const linearProjectId = normalize(settings?.linear_project_id);
  if (!linearProjectId) {
    return { considered: 0, imported: 0, skipped: 0 };
  }

  const teamId = await getTeamIdForStoryMap(supabase, storyMapId);
  if (!teamId) {
    return { considered: 0, imported: 0, skipped: 0 };
  }

  const accessToken = await resolveLinearAuthTokenForTeam(teamId);
  if (!accessToken) {
    return { considered: 0, imported: 0, skipped: 0 };
  }

  const issues = await listLinearProjectIssuesByLabel({ accessToken, projectId: linearProjectId });

  let imported = 0;
  let skipped = 0;
  for (const issue of issues) {
    const existing = await getStoryLinearLinkByLinearIssueId(supabase, issue.id);
    if (existing) {
      skipped += 1;
      continue;
    }

    const candidate = await findStoryMapImportCandidate(supabase, {
      teamId: issue.teamId,
      linearProjectId: issue.projectId,
      labelNames: issue.labelNames,
    });

    if (!candidate || candidate.storyMapId !== storyMapId) {
      skipped += 1;
      continue;
    }

    await importLinearIssueIntoStoryMap({
      supabase,
      storyMapId,
      linearIssueId: issue.id,
      linearIssueIdentifier: issue.identifier,
      title: issue.title,
      description: issue.description,
      stateName: issue.stateName,
      updatedAt: issue.updatedAt,
    });
    imported += 1;
  }

  return { considered: issues.length, imported, skipped };
}

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth();
  if (!auth.success) return auth.response;

  const { id: storyMapId } = await params;
  if (!isValidUuid(storyMapId)) return invalidIdResponse();

  const supabase = await createClient();

  const { data: tasks, error: tasksError } = await supabase
    .from('tasks')
    .select('id, activities!inner(story_map_id)')
    .eq('activities.story_map_id', storyMapId);

  if (tasksError) return serverErrorResponse('Failed to load tasks for story map sync', tasksError);

  const taskIds = (tasks ?? []).map((row) => row.id as string).filter(Boolean);
  let summary: { considered: number; succeeded: number; failed: number } = { considered: 0, succeeded: 0, failed: 0 };

  if (taskIds.length > 0) {
    const { data: stories, error: storiesError } = await supabase.from('stories').select('id').in('task_id', taskIds);

    if (storiesError) return serverErrorResponse('Failed to load stories for story map sync', storiesError);

    const storyIds = [...new Set((stories ?? []).map((row) => row.id as string).filter(Boolean))];
    if (storyIds.length > 0) {
      summary = await syncStoriesByIdList({
        supabase,
        fallbackIssueSync: getLinearIssueSync(),
        storyIds,
      });
    }
  }

  let importSummary: { considered: number; imported: number; skipped: number };
  try {
    importSummary = await runManualImportForStoryMap(supabase, storyMapId);
  } catch (error) {
    return serverErrorResponse('Failed to import labeled Linear issues during manual sync', error);
  }

  return NextResponse.json({
    success: true,
    considered: summary.considered,
    succeeded: summary.succeeded,
    failed: summary.failed,
    import_considered: importSummary.considered,
    imported: importSummary.imported,
    import_skipped: importSummary.skipped,
  });
}
