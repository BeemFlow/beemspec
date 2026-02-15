import { NextResponse } from 'next/server';
import { DbErrorCode, notFoundResponse, serverErrorResponse } from '@/lib/errors';
import { createClient } from '@/lib/supabase/server';
import { invalidIdResponse, isValidUuid } from '@/lib/validations';
import { createReleaseRun, enqueueStoryBuildJob } from '@/orchestration/release-build';
import { runtime } from '@/runtime';

type Supabase = Awaited<ReturnType<typeof createClient>>;

async function loadRelease(supabase: Supabase, releaseId: string) {
  const { data, error } = await supabase.from('releases').select('id, story_map_id').eq('id', releaseId).single();
  return { data, error };
}

async function loadStoryIdsInRelease(supabase: Supabase, releaseId: string) {
  return supabase.from('stories').select('id').eq('release_id', releaseId).order('sort_order', { ascending: true });
}

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

  const { data: run, error: runCreateError } = await createReleaseRun(supabase, {
    releaseId,
    storyMapId: release.story_map_id,
    userId: auth.user.id,
    totalItems: storyIds.length,
    status: 'queued',
  });
  if (runCreateError || !run) {
    return serverErrorResponse('Failed to create release run', runCreateError ?? new Error('Run not created'));
  }

  const { data: job, error: jobError } = await enqueueStoryBuildJob(supabase, {
    releaseId,
    releaseRunId: run.id,
    storyMapId: release.story_map_id,
    storyIds,
  });
  if (jobError || !job) {
    return serverErrorResponse('Failed to enqueue release build job', jobError ?? new Error('Job not created'));
  }

  return NextResponse.json(
    {
      run_id: run.id,
      job_id: job.id,
      status: 'queued',
    },
    { status: 202 },
  );
}
