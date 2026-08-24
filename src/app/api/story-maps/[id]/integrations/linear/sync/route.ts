import { NextResponse } from 'next/server';
import { listLinearProjectIssuesForImport, manualLinearSyncResponseSchema } from '@/integrations/linear/adapter';
import { resolveLinearAuthTokenForTeam } from '@/integrations/linear/auth';
import { findStoryMapImportCandidate, importLinearIssueIntoStoryMap } from '@/integrations/linear/import';
import { type LinearStorySyncResult, reconcileStoriesForStoryMap } from '@/integrations/linear/reconcile';
import { getTeamIdForStoryMap } from '@/integrations/linear/settings';
import { getStoryLinearLinkByLinearIssueId } from '@/integrations/linear/story-links';
import { requireAuth } from '@/lib/auth';
import { serverErrorResponse } from '@/lib/errors';
import { normalize } from '@/lib/strings';
import type { Supabase } from '@/lib/supabase/types';
import { invalidIdResponse, isValidUuid } from '@/lib/validations';

interface ManualSyncStoryResult {
  story_id: string;
  title: string | null;
  outcome: 'created_in_linear' | 'synced_to_linear' | 'synced_from_linear' | 'ignored' | 'failed';
  reason: string | null;
  linear_issue_id: string | null;
}

interface ManualImportIssueResult {
  issue_id: string;
  identifier: string | null;
  title: string | null;
  outcome: 'imported' | 'skipped_already_linked' | 'skipped_no_candidate';
  reason: string | null;
  story_id: string | null;
}

async function runManualImportForStoryMap(
  supabase: Supabase,
  storyMapId: string,
): Promise<{
  considered: number;
  imported: number;
  skipped: number;
  skippedAlreadyLinked: number;
  skippedNoCandidate: number;
  results: ManualImportIssueResult[];
}> {
  const { data: settings } = await supabase
    .from('story_map_integration_settings')
    .select('linear_project_id')
    .eq('story_map_id', storyMapId)
    .maybeSingle<{ linear_project_id: string | null }>();

  const linearProjectId = normalize(settings?.linear_project_id);
  if (!linearProjectId) {
    return { considered: 0, imported: 0, skipped: 0, skippedAlreadyLinked: 0, skippedNoCandidate: 0, results: [] };
  }

  const mapTeamId = await getTeamIdForStoryMap(supabase, storyMapId);
  if (!mapTeamId) {
    return { considered: 0, imported: 0, skipped: 0, skippedAlreadyLinked: 0, skippedNoCandidate: 0, results: [] };
  }

  const accessToken = await resolveLinearAuthTokenForTeam(mapTeamId);
  if (!accessToken) {
    return { considered: 0, imported: 0, skipped: 0, skippedAlreadyLinked: 0, skippedNoCandidate: 0, results: [] };
  }

  const issues = await listLinearProjectIssuesForImport(accessToken, linearProjectId);

  let imported = 0;
  let skipped = 0;
  let skippedAlreadyLinked = 0;
  let skippedNoCandidate = 0;
  const results: ManualImportIssueResult[] = [];
  for (const issue of issues) {
    const existing = await getStoryLinearLinkByLinearIssueId(supabase, issue.id);
    if (existing) {
      skipped += 1;
      skippedAlreadyLinked += 1;
      results.push({
        issue_id: issue.id,
        identifier: issue.identifier,
        title: issue.title,
        outcome: 'skipped_already_linked',
        reason: 'issue already linked to a BeemSpec story',
        story_id: existing.storyId,
      });
      continue;
    }

    const candidate = await findStoryMapImportCandidate(supabase, {
      teamId: issue.teamId,
      linearProjectId: issue.projectId,
      labelNames: issue.labelNames,
    });

    if (!candidate || candidate.storyMapId !== storyMapId) {
      skipped += 1;
      skippedNoCandidate += 1;
      results.push({
        issue_id: issue.id,
        identifier: issue.identifier,
        title: issue.title,
        outcome: 'skipped_no_candidate',
        reason: 'issue labels/project do not map uniquely to this story map',
        story_id: null,
      });
      continue;
    }

    const importedStory = await importLinearIssueIntoStoryMap({
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
    results.push({
      issue_id: issue.id,
      identifier: issue.identifier,
      title: issue.title,
      outcome: 'imported',
      reason: null,
      story_id: importedStory.storyId,
    });
  }

  return { considered: issues.length, imported, skipped, skippedAlreadyLinked, skippedNoCandidate, results };
}

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth();
  if (!auth.success) return auth.response;

  const { id: storyMapId } = await params;
  if (!isValidUuid(storyMapId)) return invalidIdResponse();

  const supabase = auth.supabase;

  const { data: mapSettings, error: mapSettingsError } = await supabase
    .from('story_map_integration_settings')
    .select('linear_project_id')
    .eq('story_map_id', storyMapId)
    .maybeSingle<{ linear_project_id: string | null }>();

  if (mapSettingsError) {
    return serverErrorResponse('Failed to load story map Linear settings', mapSettingsError);
  }

  if (!normalize(mapSettings?.linear_project_id)) {
    return NextResponse.json(
      { error: 'Manual sync requires a saved Linear project for this story map' },
      { status: 422 },
    );
  }

  const { data: tasks, error: tasksError } = await supabase
    .from('tasks')
    .select('id, activities!inner(story_map_id)')
    .eq('activities.story_map_id', storyMapId);

  if (tasksError) return serverErrorResponse('Failed to load tasks for story map sync', tasksError);

  const taskIds = (tasks ?? []).map((row) => row.id as string).filter(Boolean);

  let summary = {
    considered: 0,
    succeeded: 0,
    failed: 0,
    ignored: 0,
    createdRemote: 0,
    localToRemote: 0,
    remoteToLocal: 0,
    results: [] as LinearStorySyncResult[],
  };

  const storyTitles = new Map<string, string | null>();

  if (taskIds.length > 0) {
    const { data: stories, error: storiesError } = await supabase
      .from('stories')
      .select('id, title')
      .in('task_id', taskIds);
    if (storiesError) return serverErrorResponse('Failed to load stories for story map sync', storiesError);

    const storyIds = [...new Set((stories ?? []).map((row) => row.id as string).filter(Boolean))];
    for (const row of stories ?? []) {
      storyTitles.set(row.id as string, (row.title as string | null) ?? null);
    }
    if (storyIds.length > 0) {
      summary = await reconcileStoriesForStoryMap({
        supabase,
        storyMapId,
        storyIds,
      });
    }
  }

  let importSummary: {
    considered: number;
    imported: number;
    skipped: number;
    skippedAlreadyLinked: number;
    skippedNoCandidate: number;
    results: ManualImportIssueResult[];
  };
  try {
    importSummary = await runManualImportForStoryMap(supabase, storyMapId);
  } catch (error) {
    return serverErrorResponse('Failed to import labeled Linear issues during manual sync', error);
  }

  const storyResults: ManualSyncStoryResult[] = [];
  for (const result of summary.results) {
    const outcome: ManualSyncStoryResult['outcome'] =
      result.action === 'created_remote'
        ? 'created_in_linear'
        : result.action === 'local_to_remote'
          ? 'synced_to_linear'
          : result.action === 'remote_to_local'
            ? 'synced_from_linear'
            : result.action;

    storyResults.push({
      story_id: result.storyId,
      title: storyTitles.get(result.storyId) ?? null,
      outcome,
      reason: result.reason ?? (!result.success ? 'sync failed' : null),
      linear_issue_id: result.linearIssueId ?? null,
    });
  }

  return NextResponse.json(
    manualLinearSyncResponseSchema.parse({
      success: true,
      stories: {
        considered: summary.considered,
        processed: summary.succeeded + summary.failed,
        succeeded: summary.succeeded,
        failed: summary.failed,
        ignored: summary.ignored,
        created_in_linear: summary.createdRemote,
        synced_to_linear: summary.localToRemote,
        synced_from_linear: summary.remoteToLocal,
      },
      imports: {
        considered: importSummary.considered,
        imported: importSummary.imported,
        skipped: importSummary.skipped,
        skipped_already_linked: importSummary.skippedAlreadyLinked,
        skipped_no_candidate: importSummary.skippedNoCandidate,
      },
      story_results: storyResults,
      import_results: importSummary.results,
    }),
  );
}
