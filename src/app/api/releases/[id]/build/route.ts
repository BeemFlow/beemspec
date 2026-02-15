import { NextResponse } from 'next/server';
import { DbErrorCode, notFoundResponse, serverErrorResponse } from '@/lib/errors';
import { createClient } from '@/lib/supabase/server';
import { invalidIdResponse, isValidUuid } from '@/lib/validations';
import { createBuildRun, enqueueStoryBuildJob } from '@/orchestration/release-build';
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
    .select('id, story_map_id, total_items, status')
    .eq('release_id', releaseId)
    .in('status', ['queued', 'running'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
}

async function loadRunItemStoryIds(supabase: Supabase, runId: string) {
  return supabase.from('build_run_items').select('story_id').eq('build_run_id', runId);
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: route handles create-or-append run orchestration flow
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
    const { data: existingItems, error: existingItemsError } = await loadRunItemStoryIds(
      supabase,
      activeRun.id as string,
    );
    if (existingItemsError) return serverErrorResponse('Failed to load existing build run items', existingItemsError);

    const existingStoryIds = new Set((existingItems ?? []).map((item) => item.story_id as string));
    const appendedStoryIds = storyIds.filter((storyId) => !existingStoryIds.has(storyId));

    if (appendedStoryIds.length === 0) {
      return NextResponse.json(
        {
          run_id: activeRun.id,
          build_run_id: activeRun.id,
          status: activeRun.status,
          appended_items: 0,
        },
        { status: 202 },
      );
    }

    const nextTotalItems = Number(activeRun.total_items ?? 0) + appendedStoryIds.length;
    const { error: updateRunError } = await supabase
      .from('build_runs')
      .update({ total_items: nextTotalItems, status: 'queued', error: null })
      .eq('id', activeRun.id as string);
    if (updateRunError) return serverErrorResponse('Failed to update active build run', updateRunError);

    const { data: job, error: jobError } = await enqueueStoryBuildJob(supabase, {
      releaseId,
      buildRunId: activeRun.id as string,
      storyMapId: activeRun.story_map_id as string,
      storyIds: appendedStoryIds,
    });
    if (jobError || !job) {
      return serverErrorResponse('Failed to enqueue release build job', jobError ?? new Error('Job not created'));
    }

    return NextResponse.json(
      {
        run_id: activeRun.id,
        build_run_id: activeRun.id,
        job_id: job.id,
        status: 'queued',
        appended_items: appendedStoryIds.length,
      },
      { status: 202 },
    );
  }

  const { data: run, error: runCreateError } = await createBuildRun(supabase, {
    releaseId,
    storyMapId: release.story_map_id,
    userId: auth.user.id,
    totalItems: storyIds.length,
    status: 'queued',
  });
  if (runCreateError || !run) {
    return serverErrorResponse('Failed to create build run', runCreateError ?? new Error('Run not created'));
  }

  const { data: job, error: jobError } = await enqueueStoryBuildJob(supabase, {
    releaseId,
    buildRunId: run.id,
    storyMapId: release.story_map_id,
    storyIds,
  });
  if (jobError || !job) {
    return serverErrorResponse('Failed to enqueue release build job', jobError ?? new Error('Job not created'));
  }

  return NextResponse.json(
    {
      run_id: run.id,
      build_run_id: run.id,
      job_id: job.id,
      status: 'queued',
    },
    { status: 202 },
  );
}
