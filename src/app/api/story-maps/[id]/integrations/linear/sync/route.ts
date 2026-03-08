import { listLinearProjectIssuesForImport } from '@beemspec/linear';
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
  if (!linearProjectId) return { considered: 0, imported: 0, skipped: 0 };

  const mapTeamId = await getTeamIdForStoryMap(supabase, storyMapId);
  if (!mapTeamId) return { considered: 0, imported: 0, skipped: 0 };

  const accessToken = await resolveLinearAuthTokenForTeam(mapTeamId);
  if (!accessToken) return { considered: 0, imported: 0, skipped: 0 };

  const issues = await listLinearProjectIssuesForImport(accessToken, linearProjectId);

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

  let summary: { considered: number; succeeded: number; failed: number } = {
    considered: 0,
    succeeded: 0,
    failed: 0,
  };

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
