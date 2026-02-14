import { NextResponse } from 'next/server';
import { domainRuntime } from '@/domains/runtime';
import { getLinearStorySyncTargetForStoryMap } from '@/integrations/linear/settings';
import { getStoryLinearLink, upsertStoryLinearLink } from '@/integrations/linear/story-links';
import { syncStoryToLinear } from '@/integrations/linear/story-sync';
import { DbErrorCode, notFoundResponse, serverErrorResponse } from '@/lib/errors';
import { createClient } from '@/lib/supabase/server';
import { invalidIdResponse, isValidUuid } from '@/lib/validations';

type Supabase = Awaited<ReturnType<typeof createClient>>;

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return 'Release run item failed';
}

async function loadRelease(supabase: Supabase, releaseId: string) {
  const { data, error } = await supabase.from('releases').select('id, story_map_id').eq('id', releaseId).single();
  return { data, error };
}

async function loadReleaseStories(supabase: Supabase, releaseId: string) {
  const { data, error } = await supabase
    .from('stories')
    .select('*')
    .eq('release_id', releaseId)
    .order('sort_order', { ascending: true });
  return { data: data ?? [], error };
}

async function createReleaseRun(
  supabase: Supabase,
  input: {
    releaseId: string;
    storyMapId: string;
    userId: string;
    totalItems: number;
  },
) {
  const { data, error } = await supabase
    .from('release_runs')
    .insert({
      release_id: input.releaseId,
      story_map_id: input.storyMapId,
      triggered_by: input.userId,
      status: 'running',
      total_items: input.totalItems,
      completed_items: 0,
      failed_items: 0,
      started_at: new Date().toISOString(),
    })
    .select('id')
    .single();

  return { data, error };
}

async function finishRun(
  supabase: Supabase,
  runId: string,
  result: {
    status: 'completed' | 'failed';
    completedItems: number;
    failedItems: number;
    error: string | null;
  },
) {
  return supabase
    .from('release_runs')
    .update({
      status: result.status,
      completed_items: result.completedItems,
      failed_items: result.failedItems,
      finished_at: new Date().toISOString(),
      error: result.error,
    })
    .eq('id', runId);
}

async function processRunItems(
  supabase: Supabase,
  runId: string,
  stories: Record<string, unknown>[],
  linearIssueSync: NonNullable<typeof domainRuntime.storyMap.linearIssueSync>,
  target: { teamId: string; projectId?: string; stateId?: string },
) {
  let completedItems = 0;
  let failedItems = 0;

  for (const story of stories) {
    try {
      const storyId = story.id as string;
      const existingLink = await getStoryLinearLink(supabase, storyId);
      const linearIssue = await syncStoryToLinear(
        story as never,
        linearIssueSync,
        existingLink?.linearIssueId ?? null,
        target,
      );
      if (!linearIssue) throw new Error('Linear sync returned no issue snapshot');

      await upsertStoryLinearLink(supabase, {
        storyId,
        linearIssueId: linearIssue.id,
        linearIssueIdentifier: linearIssue.identifier,
        lastLocalUpdatedAt: (story.updated_at as string | null) ?? null,
        lastLinearUpdatedAt: linearIssue.updatedAt,
      });

      await supabase.from('release_run_items').insert({
        release_run_id: runId,
        story_id: storyId,
        linear_issue_id: linearIssue.id,
        status: 'synced',
      });

      completedItems += 1;
    } catch (error) {
      failedItems += 1;
      await supabase.from('release_run_items').insert({
        release_run_id: runId,
        story_id: story.id as string,
        status: 'failed',
        error: toErrorMessage(error),
      });
    }
  }

  return { completedItems, failedItems };
}

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await domainRuntime.storyMap.auth.requireAuth();
  if (!auth.success) return auth.response;

  const linearIssueSync = domainRuntime.storyMap.linearIssueSync;
  if (!linearIssueSync) return NextResponse.json({ error: 'Linear integration is not enabled' }, { status: 503 });

  const { id: releaseId } = await params;
  if (!isValidUuid(releaseId)) return invalidIdResponse();

  const supabase = await createClient();
  const { data: release, error: releaseError } = await loadRelease(supabase, releaseId);
  if (releaseError) {
    if (releaseError.code === DbErrorCode.NOT_FOUND) return notFoundResponse('Release');
    return serverErrorResponse('Failed to load release', releaseError);
  }
  if (!release) return notFoundResponse('Release');

  const { data: stories, error: storiesError } = await loadReleaseStories(supabase, releaseId);
  if (storiesError) return serverErrorResponse('Failed to load release stories', storiesError);

  const { data: run, error: runCreateError } = await createReleaseRun(supabase, {
    releaseId,
    storyMapId: release.story_map_id,
    userId: auth.user.id,
    totalItems: stories.length,
  });
  if (runCreateError || !run) {
    return serverErrorResponse('Failed to create release run', runCreateError ?? new Error('Run not created'));
  }

  const target = await getLinearStorySyncTargetForStoryMap(supabase, release.story_map_id);
  if (!target) {
    await finishRun(supabase, run.id, {
      status: 'failed',
      completedItems: 0,
      failedItems: stories.length,
      error: 'No linear target configured for release team',
    });

    return NextResponse.json(
      {
        run_id: run.id,
        status: 'failed',
        total_items: stories.length,
        completed_items: 0,
        failed_items: stories.length,
      },
      { status: 400 },
    );
  }

  const { completedItems, failedItems } = await processRunItems(supabase, run.id, stories, linearIssueSync, target);
  const finalStatus = failedItems > 0 ? 'failed' : 'completed';

  const { error: runUpdateError } = await finishRun(supabase, run.id, {
    status: finalStatus,
    completedItems,
    failedItems,
    error: failedItems > 0 ? `${failedItems} item(s) failed` : null,
  });
  if (runUpdateError) return serverErrorResponse('Failed to finalize release run', runUpdateError);

  return NextResponse.json({
    run_id: run.id,
    status: finalStatus,
    total_items: stories.length,
    completed_items: completedItems,
    failed_items: failedItems,
  });
}
