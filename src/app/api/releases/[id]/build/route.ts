import { NextResponse } from 'next/server';
import { domainRuntime } from '@/domains/runtime';
import { DbErrorCode, notFoundResponse, serverErrorResponse } from '@/lib/errors';
import { createClient } from '@/lib/supabase/server';
import { invalidIdResponse, isValidUuid } from '@/lib/validations';
import { dispatchReleaseBuildJobById, enqueueReleaseBuildJob } from '@/orchestration/release-runner/jobs';

type Supabase = Awaited<ReturnType<typeof createClient>>;

async function loadRelease(supabase: Supabase, releaseId: string) {
  const { data, error } = await supabase.from('releases').select('id, story_map_id').eq('id', releaseId).single();
  return { data, error };
}

async function countStoriesInRelease(supabase: Supabase, releaseId: string) {
  return supabase.from('stories').select('id', { count: 'exact', head: true }).eq('release_id', releaseId);
}

async function createQueuedRun(
  supabase: Supabase,
  input: {
    releaseId: string;
    storyMapId: string;
    userId: string;
    totalItems: number;
  },
) {
  return supabase
    .from('release_runs')
    .insert({
      release_id: input.releaseId,
      story_map_id: input.storyMapId,
      triggered_by: input.userId,
      status: 'queued',
      total_items: input.totalItems,
      completed_items: 0,
      failed_items: 0,
      started_at: new Date().toISOString(),
    })
    .select('id')
    .single();
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

  const { count, error: countError } = await countStoriesInRelease(supabase, releaseId);
  if (countError) return serverErrorResponse('Failed to count release stories', countError);

  const { data: run, error: runCreateError } = await createQueuedRun(supabase, {
    releaseId,
    storyMapId: release.story_map_id,
    userId: auth.user.id,
    totalItems: count ?? 0,
  });
  if (runCreateError || !run) {
    return serverErrorResponse('Failed to create release run', runCreateError ?? new Error('Run not created'));
  }

  const { data: job, error: jobError } = await enqueueReleaseBuildJob(supabase, {
    releaseId,
    releaseRunId: run.id,
    storyMapId: release.story_map_id,
  });
  if (jobError || !job) {
    return serverErrorResponse('Failed to enqueue release build job', jobError ?? new Error('Job not created'));
  }

  await dispatchReleaseBuildJobById(supabase, {
    jobId: job.id,
    linearIssueSync,
    openCodeSessions,
  });

  return NextResponse.json({
    run_id: run.id,
    job_id: job.id,
    status: 'queued',
  });
}
