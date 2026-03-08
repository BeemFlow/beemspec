import { NextResponse } from 'next/server';
import { syncStoriesByIdList } from '@/app/api/integrations/linear/sync/route';
import { resolveLinearAuthTokenForTeam } from '@/integrations/linear/auth';
import { getLinearIssueSync } from '@/integrations/linear/helpers';
import { importLinearIssueIntoStoryMap } from '@/integrations/linear/import';
import {
  DEFAULT_AUTO_IMPORT_LABELED_ISSUES,
  DEFAULT_LINEAR_IMPORT_LABEL,
  getTeamIdForStoryMap,
} from '@/integrations/linear/settings';
import { getStoryLinearLinkByLinearIssueId } from '@/integrations/linear/story-links';
import { requireAuth } from '@/lib/auth';
import { serverErrorResponse } from '@/lib/errors';
import { normalize } from '@/lib/strings';
import { createClient } from '@/lib/supabase/server';
import { invalidIdResponse, isValidUuid } from '@/lib/validations';

interface LinearIssueImportCandidate {
  id: string;
  identifier: string | null;
  title: string | null;
  description: string | null;
  stateName: string | null;
  updatedAt: string;
}

async function listLinearProjectIssuesByLabel(input: {
  accessToken: string;
  projectId: string;
  labelName: string;
}): Promise<LinearIssueImportCandidate[]> {
  const issues: LinearIssueImportCandidate[] = [];
  let cursor: string | null = null;

  const query = `
    query ManualStoryMapImport($projectId: String!, $labelName: String!, $cursor: String) {
      issues(
        first: 100
        after: $cursor
        filter: {
          project: { id: { eq: $projectId } }
          labels: { name: { eq: $labelName } }
          archivedAt: { null: true }
        }
      ) {
        nodes {
          id
          identifier
          title
          description
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
          labelName: input.labelName,
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
            identifier?: string | null;
            title?: string | null;
            description?: string | null;
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
      const updatedAt = typeof node?.updatedAt === 'string' ? node.updatedAt : null;
      if (!id || !updatedAt) continue;

      issues.push({
        id,
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
  try {
    const { data: settings } = await supabase
      .from('story_map_integration_settings')
      .select('linear_project_id, auto_import_labeled_issues, import_label_name')
      .eq('story_map_id', storyMapId)
      .maybeSingle<{
        linear_project_id: string | null;
        auto_import_labeled_issues: boolean | null;
        import_label_name: string | null;
      }>();

    const linearProjectId = normalize(settings?.linear_project_id);
    if (!linearProjectId) {
      return { considered: 0, imported: 0, skipped: 0 };
    }

    const autoImportLabeledIssues =
      typeof settings?.auto_import_labeled_issues === 'boolean'
        ? settings.auto_import_labeled_issues
        : DEFAULT_AUTO_IMPORT_LABELED_ISSUES;
    if (!autoImportLabeledIssues) {
      return { considered: 0, imported: 0, skipped: 0 };
    }

    const labelName = normalize(settings?.import_label_name) ?? DEFAULT_LINEAR_IMPORT_LABEL;
    const teamId = await getTeamIdForStoryMap(supabase, storyMapId);
    if (!teamId) {
      return { considered: 0, imported: 0, skipped: 0 };
    }

    const accessToken = await resolveLinearAuthTokenForTeam(teamId);
    if (!accessToken) {
      return { considered: 0, imported: 0, skipped: 0 };
    }

    const issues = await listLinearProjectIssuesByLabel({ accessToken, projectId: linearProjectId, labelName });

    let imported = 0;
    let skipped = 0;
    for (const issue of issues) {
      const existing = await getStoryLinearLinkByLinearIssueId(supabase, issue.id);
      if (existing) {
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
  } catch {
    return { considered: 0, imported: 0, skipped: 0 };
  }
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
  if (taskIds.length === 0) {
    return NextResponse.json({ success: true, considered: 0, succeeded: 0, failed: 0 });
  }

  const { data: stories, error: storiesError } = await supabase.from('stories').select('id').in('task_id', taskIds);

  if (storiesError) return serverErrorResponse('Failed to load stories for story map sync', storiesError);

  const storyIds = [...new Set((stories ?? []).map((row) => row.id as string).filter(Boolean))];
  if (storyIds.length === 0) {
    return NextResponse.json({ success: true, considered: 0, succeeded: 0, failed: 0 });
  }

  const summary = await syncStoriesByIdList({
    supabase,
    fallbackIssueSync: getLinearIssueSync(),
    storyIds,
  });

  const importSummary = await runManualImportForStoryMap(supabase, storyMapId);

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
