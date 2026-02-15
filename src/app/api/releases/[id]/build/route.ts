import { NextResponse } from 'next/server';
import { domainRuntime } from '@/domains/runtime';
import { getLinearStorySyncTargetForStoryMap } from '@/integrations/linear/settings';
import type { OpenCodeSessionPort } from '@/integrations/opencode/contracts';
import { DbErrorCode, notFoundResponse, serverErrorResponse } from '@/lib/errors';
import { createClient } from '@/lib/supabase/server';
import { invalidIdResponse, isValidUuid } from '@/lib/validations';
import { syncStoryRunItem } from '@/orchestration/release-runner/story-item';
import type { Story } from '@/types';

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
  return { data: (data ?? []) as Story[], error };
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
  releaseId: string,
  stories: Story[],
  linearIssueSync: NonNullable<typeof domainRuntime.storyMap.linearIssueSync>,
  openCodeSessions: OpenCodeSessionPort | null,
  target: { teamId: string; projectId?: string; stateId?: string },
) {
  let completedItems = 0;
  let failedItems = 0;

  for (const story of stories) {
    try {
      const { linearIssue, session } = await syncStoryRunItem({
        supabase,
        story,
        releaseId,
        linearIssueSync,
        openCodeSessions,
        target,
      });

      await supabase.from('release_run_items').insert({
        release_run_id: runId,
        story_id: story.id,
        linear_issue_id: linearIssue.id,
        opencode_session_id: session?.id ?? null,
        opencode_session_url: session?.url ?? null,
        status: 'synced',
      });

      completedItems += 1;
    } catch (error) {
      failedItems += 1;
      await supabase.from('release_run_items').insert({
        release_run_id: runId,
        story_id: story.id,
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
  const openCodeSessions = domainRuntime.storyMap.openCodeSessions;

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

  const { completedItems, failedItems } = await processRunItems(
    supabase,
    run.id,
    releaseId,
    stories,
    linearIssueSync,
    openCodeSessions,
    target,
  );
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
