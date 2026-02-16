import { NextResponse } from 'next/server';
import { createBuildRunWithStoryJob, enqueueBuildRunStoriesAtomically } from '@/build-runs';
import { DbErrorCode, notFoundResponse, serverErrorResponse } from '@/lib/errors';
import { createClient } from '@/lib/supabase/server';
import { invalidIdResponse, isValidUuid } from '@/lib/validations';
import { runtime } from '@/runtime';

type Supabase = Awaited<ReturnType<typeof createClient>>;

async function loadRelease(supabase: Supabase, releaseId: string) {
  const { data, error } = await supabase.from('releases').select('id, story_map_id').eq('id', releaseId).single();
  return { data, error };
}

async function loadStoryIdsInRelease(supabase: Supabase, releaseId: string) {
  return supabase.from('stories').select('id').eq('release_id', releaseId).order('sort_order', { ascending: true });
}

async function loadActiveRunForRelease(supabase: Supabase, releaseId: string) {
  return supabase
    .from('build_runs')
    .select('id, story_map_id, status')
    .eq('release_id', releaseId)
    .in('status', ['queued', 'running'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: route handles create-or-append run flow
export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await runtime.storyMap.auth.requireAuth();
  if (!auth.success) return auth.response;

  const openCodeSessions = runtime.storyMap.openCodeSessions;
  if (!openCodeSessions) return NextResponse.json({ error: 'OpenCode integration is not enabled' }, { status: 503 });

  const { id: releaseId } = await params;
  if (!isValidUuid(releaseId)) return invalidIdResponse();

  const supabase = await createClient();
  const { data: release, error: releaseError } = await loadRelease(supabase, releaseId);
  if (releaseError) {
    if (releaseError.code === DbErrorCode.NOT_FOUND) return notFoundResponse('Release');
    return serverErrorResponse('Failed to load release', releaseError);
  }
  if (!release) return notFoundResponse('Release');

  const { data: stories, error: storiesError } = await loadStoryIdsInRelease(supabase, releaseId);
  if (storiesError) return serverErrorResponse('Failed to load release stories', storiesError);
  const storyIds = (stories ?? []).map((story) => story.id as string);

  const { data: activeRun, error: activeRunError } = await loadActiveRunForRelease(supabase, releaseId);
  if (activeRunError) return serverErrorResponse('Failed to load active build run', activeRunError);

  if (activeRun) {
    const { data: enqueueResult, error: enqueueError } = await enqueueBuildRunStoriesAtomically(supabase, {
      releaseId,
      buildRunId: activeRun.id as string,
      storyMapId: activeRun.story_map_id as string,
      storyIds,
      queueExisting: false,
    });
    if (enqueueError || !enqueueResult) {
      return serverErrorResponse('Failed to append release stories to active build run', enqueueError);
    }

    if (enqueueResult.queued_items === 0) {
      return NextResponse.json(
        {
          run_id: activeRun.id,
          build_run_id: activeRun.id,
          status: activeRun.status,
          appended_items: enqueueResult.appended_items,
        },
        { status: 202 },
      );
    }

    if (!enqueueResult.job_id) {
      return serverErrorResponse('Failed to enqueue build run job', new Error('Job not created'));
    }

    return NextResponse.json(
      {
        run_id: activeRun.id,
        build_run_id: activeRun.id,
        job_id: enqueueResult.job_id,
        status: 'queued',
        appended_items: enqueueResult.appended_items,
      },
      { status: 202 },
    );
  }

  const { data: runResult, error: runCreateError } = await createBuildRunWithStoryJob(supabase, {
    releaseId,
    storyMapId: release.story_map_id,
    userId: auth.user.id,
    storyIds,
  });
  if (runCreateError || !runResult) {
    return serverErrorResponse('Failed to create build run', runCreateError ?? new Error('Run not created'));
  }

  if (runResult.queued_items === 0) {
    return NextResponse.json(
      {
        run_id: runResult.run_id,
        build_run_id: runResult.run_id,
        status: 'completed',
      },
      { status: 202 },
    );
  }

  if (!runResult.job_id) {
    return serverErrorResponse('Failed to enqueue build run job', new Error('Job not created'));
  }

  return NextResponse.json(
    {
      run_id: runResult.run_id,
      build_run_id: runResult.run_id,
      job_id: runResult.job_id,
      status: 'queued',
    },
    { status: 202 },
  );
}
