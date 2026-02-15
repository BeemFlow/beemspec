import { NextResponse } from 'next/server';
import { DbErrorCode, notFoundResponse, serverErrorResponse } from '@/lib/errors';
import { createClient } from '@/lib/supabase/server';
import { invalidIdResponse, isValidUuid } from '@/lib/validations';
import { enqueueStoryBuildJob } from '@/orchestration/release-build';
import { runtime } from '@/runtime';

type Supabase = Awaited<ReturnType<typeof createClient>>;

async function loadRun(supabase: Supabase, runId: string) {
  return supabase.from('release_runs').select('id, release_id, story_map_id, total_items').eq('id', runId).single();
}

async function loadFailedItemStoryIds(supabase: Supabase, runId: string) {
  const { data, error } = await supabase
    .from('release_run_items')
    .select('story_id')
    .eq('release_run_id', runId)
    .eq('status', 'failed');
  return {
    storyIds: (data ?? []).map((item) => item.story_id as string),
    error,
  };
}

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await runtime.storyMap.auth.requireAuth();
  if (!auth.success) return auth.response;

  const openCodeSessions = runtime.storyMap.openCodeSessions;
  if (!openCodeSessions) return NextResponse.json({ error: 'OpenCode integration is not enabled' }, { status: 503 });

  const { id: runId } = await params;
  if (!isValidUuid(runId)) return invalidIdResponse();

  const supabase = await createClient();
  const { data: run, error: runError } = await loadRun(supabase, runId);
  if (runError) {
    if (runError.code === DbErrorCode.NOT_FOUND) return notFoundResponse('Release run');
    return serverErrorResponse('Failed to load release run', runError);
  }

  const { storyIds, error: failedItemsError } = await loadFailedItemStoryIds(supabase, runId);
  if (failedItemsError) return serverErrorResponse('Failed to load failed release run items', failedItemsError);

  if (storyIds.length === 0) {
    return NextResponse.json({
      run_id: runId,
      retried_items: 0,
      status: 'completed',
    });
  }

  await supabase.from('release_runs').update({ status: 'queued', error: null }).eq('id', runId);

  const { data: job, error: jobError } = await enqueueStoryBuildJob(supabase, {
    releaseId: run.release_id,
    releaseRunId: runId,
    storyMapId: run.story_map_id,
    storyIds,
  });
  if (jobError || !job) {
    return serverErrorResponse('Failed to enqueue release run retry job', jobError ?? new Error('Job not created'));
  }

  return NextResponse.json(
    {
      run_id: runId,
      job_id: job.id,
      retried_items: storyIds.length,
      status: 'queued',
    },
    { status: 202 },
  );
}
