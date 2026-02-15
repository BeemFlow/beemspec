import { NextResponse } from 'next/server';
import { serverErrorResponse } from '@/lib/errors';
import { createClient } from '@/lib/supabase/server';
import { invalidIdResponse, isValidUuid } from '@/lib/validations';
import { createBuildRun, enqueueStoryBuildJob, loadStoryBuildContext } from '@/orchestration/release-build';
import { runtime } from '@/runtime';

function responseForStoryContextFailure(
  loaded: Extract<Awaited<ReturnType<typeof loadStoryBuildContext>>, { ok: false }>,
) {
  if (loaded.reason === 'story_not_found') return NextResponse.json({ error: 'Story not found' }, { status: 404 });
  if (loaded.reason === 'story_task_not_found') {
    return serverErrorResponse('Failed to resolve story task', loaded.error ?? new Error('Task not found'));
  }
  return serverErrorResponse('Failed to resolve story map for story', loaded.error ?? new Error('Activity not found'));
}

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await runtime.storyMap.auth.requireAuth();
  if (!auth.success) return auth.response;

  const openCodeSessions = runtime.storyMap.openCodeSessions;
  if (!openCodeSessions) return NextResponse.json({ error: 'OpenCode integration is not enabled' }, { status: 503 });

  const { id: storyId } = await params;
  if (!isValidUuid(storyId)) return invalidIdResponse();

  const supabase = await createClient();
  const loaded = await loadStoryBuildContext(supabase, storyId);
  if (!loaded.ok) return responseForStoryContextFailure(loaded);

  const { story, storyMapId } = loaded.data;

  const { data: run, error: runCreateError } = await createBuildRun(supabase, {
    releaseId: story.release_id,
    storyMapId,
    userId: auth.user.id,
    totalItems: 1,
    status: 'queued',
  });
  if (runCreateError || !run) {
    return serverErrorResponse('Failed to create story build run', runCreateError ?? new Error('Run not created'));
  }

  const { data: job, error: jobError } = await enqueueStoryBuildJob(supabase, {
    releaseId: story.release_id,
    buildRunId: run.id,
    storyMapId,
    storyIds: [storyId],
  });
  if (jobError || !job) {
    return serverErrorResponse('Failed to enqueue story build job', jobError ?? new Error('Job not created'));
  }

  return NextResponse.json(
    {
      run_id: run.id,
      build_run_id: run.id,
      job_id: job.id,
      story_id: storyId,
      status: 'queued',
    },
    { status: 202 },
  );
}
