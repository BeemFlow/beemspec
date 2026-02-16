import { NextResponse } from 'next/server';
import { loadStoryBuildContext } from '@/build-runs/processor';
import { createBuildRunWithStoryJob, enqueueBuildRunStoriesAtomically } from '@/build-runs/queue';
import { DbErrorCode, notFoundResponse, serverErrorResponse } from '@/lib/errors';
import { createClient } from '@/lib/supabase/server';
import { invalidIdResponse, isValidUuid } from '@/lib/validations';

import { runtime } from '@/runtime';

type Supabase = Awaited<ReturnType<typeof createClient>>;

async function loadBuildRunById(supabase: Supabase, buildRunId: string) {
  return supabase
    .from('build_runs')
    .select('id, release_id, story_map_id, status, total_items')
    .eq('id', buildRunId)
    .single();
}

function responseForStoryContextFailure(
  loaded: Extract<Awaited<ReturnType<typeof loadStoryBuildContext>>, { ok: false }>,
) {
  if (loaded.reason === 'story_not_found') return NextResponse.json({ error: 'Story not found' }, { status: 404 });
  if (loaded.reason === 'story_task_not_found') {
    return serverErrorResponse('Failed to resolve story task', loaded.error ?? new Error('Task not found'));
  }
  return serverErrorResponse('Failed to resolve story map for story', loaded.error ?? new Error('Activity not found'));
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: route handles create-or-append build run flow
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
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
  const targetBuildRunId = new URL(request.url).searchParams.get('build_run_id');

  if (targetBuildRunId) {
    if (!isValidUuid(targetBuildRunId)) return invalidIdResponse();

    const { data: targetRun, error: targetRunError } = await loadBuildRunById(supabase, targetBuildRunId);
    if (targetRunError) {
      if (targetRunError.code === DbErrorCode.NOT_FOUND) return notFoundResponse('Build run');
      return serverErrorResponse('Failed to load target build run', targetRunError);
    }

    if (targetRun.story_map_id !== storyMapId) {
      return NextResponse.json({ error: 'Story does not belong to the target build run story map' }, { status: 400 });
    }

    if (targetRun.release_id && story.release_id !== targetRun.release_id) {
      return NextResponse.json({ error: 'Story release does not match target build run release' }, { status: 400 });
    }

    const { data: enqueueResult, error: enqueueError } = await enqueueBuildRunStoriesAtomically(supabase, {
      releaseId: (targetRun.release_id as string | null) ?? null,
      buildRunId: targetBuildRunId,
      storyMapId,
      storyIds: [storyId],
      queueExisting: true,
    });
    if (enqueueError || !enqueueResult || !enqueueResult.job_id) {
      return serverErrorResponse(
        'Failed to append story to target build run',
        enqueueError ?? new Error('Job not created'),
      );
    }

    return NextResponse.json(
      {
        run_id: targetBuildRunId,
        build_run_id: targetBuildRunId,
        job_id: enqueueResult.job_id,
        story_id: storyId,
        status: 'queued',
        appended_item: enqueueResult.appended_items > 0,
      },
      { status: 202 },
    );
  }

  const { data: runResult, error: runCreateError } = await createBuildRunWithStoryJob(supabase, {
    releaseId: story.release_id,
    storyMapId,
    userId: auth.user.id,
    storyIds: [storyId],
  });
  if (runCreateError || !runResult || !runResult.job_id) {
    return serverErrorResponse(
      'Failed to create story build run',
      runCreateError ?? new Error('Run or job not created'),
    );
  }

  return NextResponse.json(
    {
      run_id: runResult.run_id,
      build_run_id: runResult.run_id,
      job_id: runResult.job_id,
      story_id: storyId,
      status: 'queued',
    },
    { status: 202 },
  );
}
