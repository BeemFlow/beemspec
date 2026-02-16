import { NextResponse } from 'next/server';
import { BUILD_RUN_ITEM_STATUS, BUILD_RUN_ITEMS_TABLE, BUILD_RUN_TABLE } from '@/build-runs/constants';
import { requeueBuildRunRetryJob } from '@/build-runs/queue';
import { getOpenCodeSessions } from '@/integrations/opencode/session';
import { requireAuth } from '@/lib/auth';
import { DbErrorCode, notFoundResponse, serverErrorResponse } from '@/lib/errors';
import { createClient } from '@/lib/supabase/server';
import { invalidIdResponse, isValidUuid } from '@/lib/validations';

type Supabase = Awaited<ReturnType<typeof createClient>>;

async function loadRun(supabase: Supabase, runId: string) {
  return supabase.from(BUILD_RUN_TABLE).select('id, release_id, story_map_id, total_items').eq('id', runId).single();
}

async function loadFailedItemStoryIds(supabase: Supabase, runId: string) {
  const { data, error } = await supabase
    .from(BUILD_RUN_ITEMS_TABLE)
    .select('story_id')
    .eq('build_run_id', runId)
    .eq('status', BUILD_RUN_ITEM_STATUS.failed);
  return {
    storyIds: (data ?? []).map((item) => item.story_id as string),
    error,
  };
}

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth();
  if (!auth.success) return auth.response;

  const openCodeSessions = getOpenCodeSessions();
  if (!openCodeSessions) return NextResponse.json({ error: 'OpenCode integration is not enabled' }, { status: 503 });

  const { id: runId } = await params;
  if (!isValidUuid(runId)) return invalidIdResponse();

  const supabase = await createClient();
  const { data: run, error: runError } = await loadRun(supabase, runId);
  if (runError) {
    if (runError.code === DbErrorCode.NOT_FOUND) return notFoundResponse('Build run');
    return serverErrorResponse('Failed to load build run', runError);
  }

  const { storyIds, error: failedItemsError } = await loadFailedItemStoryIds(supabase, runId);
  if (failedItemsError) return serverErrorResponse('Failed to load failed build run items', failedItemsError);

  if (storyIds.length === 0) {
    return NextResponse.json({
      run_id: runId,
      build_run_id: runId,
      retried_items: 0,
      status: 'completed',
    });
  }

  const { data: requeueResult, error: requeueError } = await requeueBuildRunRetryJob(supabase, {
    buildRunId: runId,
    releaseId: run.release_id,
    storyMapId: run.story_map_id,
    storyIds,
  });
  if (requeueError || !requeueResult || !requeueResult.job_id) {
    return serverErrorResponse('Failed to enqueue build run retry job', requeueError ?? new Error('Job not created'));
  }

  return NextResponse.json(
    {
      run_id: runId,
      build_run_id: runId,
      job_id: requeueResult.job_id,
      retried_items: requeueResult.queued_items,
      status: 'queued',
    },
    { status: 202 },
  );
}
