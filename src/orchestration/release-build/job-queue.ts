import type { LinearIssueSync } from '@/integrations/linear/types';
import type { OpenCodeSessions } from '@/integrations/opencode/types';
import type { createClient } from '@/lib/supabase/server';
import { processStoryLinearSyncById } from '@/orchestration/release-build/linear-sync-processor';
import { processBuildRunById } from '@/orchestration/release-build/run-processor';
import type {
  OrchestrationJobDispatchResult,
  OrchestrationJobRow,
  OrchestrationJobSummary,
  StoryBuildJobPayload,
  StoryLinearSyncJobPayload,
} from '@/orchestration/release-build/types';

type Supabase = Awaited<ReturnType<typeof createClient>>;
const BASE_RETRY_DELAY_MS = 5000;

export interface EnqueueBuildRunStoriesResult {
  build_run_id: string;
  job_id: string | null;
  queued_story_ids: string[];
  queued_items: number;
  appended_items: number;
}

export interface CreateBuildRunWithStoryJobResult {
  run_id: string;
  job_id: string | null;
  queued_story_ids: string[];
  queued_items: number;
}

export interface RequeueBuildRunRetryJobResult {
  job_id: string | null;
  queued_items: number;
}

export async function enqueueBuildRunStoriesAtomically(
  supabase: Supabase,
  input: {
    storyMapId: string;
    buildRunId: string;
    releaseId: string | null;
    storyIds: string[];
    queueExisting?: boolean;
  },
) {
  return supabase
    .rpc('enqueue_build_run_story_job', {
      p_build_run_id: input.buildRunId,
      p_release_id: input.releaseId,
      p_story_map_id: input.storyMapId,
      p_story_ids: input.storyIds,
      p_queue_existing: input.queueExisting ?? false,
    })
    .single<EnqueueBuildRunStoriesResult>();
}

export async function createBuildRunWithStoryJob(
  supabase: Supabase,
  input: {
    releaseId: string | null;
    storyMapId: string;
    userId: string;
    storyIds: string[];
  },
) {
  return supabase
    .rpc('create_build_run_with_story_job', {
      p_release_id: input.releaseId,
      p_story_map_id: input.storyMapId,
      p_triggered_by: input.userId,
      p_story_ids: input.storyIds,
    })
    .single<CreateBuildRunWithStoryJobResult>();
}

export async function requeueBuildRunRetryJob(
  supabase: Supabase,
  input: {
    buildRunId: string;
    releaseId: string | null;
    storyMapId: string;
    storyIds: string[];
  },
) {
  return supabase
    .rpc('requeue_build_run_retry_job', {
      p_build_run_id: input.buildRunId,
      p_release_id: input.releaseId,
      p_story_map_id: input.storyMapId,
      p_story_ids: input.storyIds,
    })
    .single<RequeueBuildRunRetryJobResult>();
}

export async function enqueueStoryBuildJob(
  supabase: Supabase,
  input: {
    storyMapId: string;
    buildRunId: string;
    releaseId: string | null;
    storyIds: string[];
  },
) {
  return supabase
    .from('orchestration_jobs')
    .insert({
      story_map_id: input.storyMapId,
      build_run_id: input.buildRunId,
      kind: 'story_build',
      status: 'queued',
      payload: {
        release_id: input.releaseId,
        build_run_id: input.buildRunId,
        story_map_id: input.storyMapId,
        story_ids: input.storyIds,
      },
      available_at: new Date().toISOString(),
    })
    .select('id, status')
    .single();
}

export async function enqueueStoryLinearSyncJob(
  supabase: Supabase,
  input: {
    storyMapId: string;
    storyId: string;
  },
) {
  return supabase
    .from('orchestration_jobs')
    .insert({
      story_map_id: input.storyMapId,
      kind: 'story_linear_sync',
      status: 'queued',
      payload: {
        story_id: input.storyId,
      },
      available_at: new Date().toISOString(),
    })
    .select('id, status')
    .single();
}

async function claimJobById(supabase: Supabase, jobId: string): Promise<OrchestrationJobRow | null> {
  const { data: queuedJob, error: queuedJobError } = await supabase
    .from('orchestration_jobs')
    .select('id, kind, status, attempts, max_attempts, payload')
    .eq('id', jobId)
    .eq('status', 'queued')
    .maybeSingle();

  if (queuedJobError || !queuedJob) return null;

  const nextAttempts = (queuedJob.attempts as number) + 1;
  const { data, error } = await supabase
    .from('orchestration_jobs')
    .update({
      status: 'running',
      started_at: new Date().toISOString(),
      attempts: nextAttempts,
      last_error: null,
    })
    .eq('id', jobId)
    .eq('status', 'queued')
    .eq('attempts', queuedJob.attempts as number)
    .select('id, kind, status, attempts, max_attempts, payload')
    .maybeSingle();

  if (error || !data) return null;
  return data as OrchestrationJobRow;
}

async function markJobResult(
  supabase: Supabase,
  input: { jobId: string; status: 'completed' | 'failed'; lastError?: string | null },
) {
  return supabase
    .from('orchestration_jobs')
    .update({
      status: input.status,
      finished_at: new Date().toISOString(),
      last_error: input.lastError ?? null,
    })
    .eq('id', input.jobId);
}

function getRetryDelayMs(attempts: number): number {
  return BASE_RETRY_DELAY_MS * 2 ** Math.max(0, attempts - 1);
}

async function markJobFailureOrRequeue(
  supabase: Supabase,
  input: { jobId: string; attempts: number; maxAttempts: number; lastError: string },
): Promise<'failed' | 'requeued'> {
  if (input.attempts >= input.maxAttempts) {
    await markJobResult(supabase, {
      jobId: input.jobId,
      status: 'failed',
      lastError: input.lastError,
    });
    return 'failed';
  }

  const availableAt = new Date(Date.now() + getRetryDelayMs(input.attempts)).toISOString();
  await supabase
    .from('orchestration_jobs')
    .update({
      status: 'queued',
      available_at: availableAt,
      started_at: null,
      finished_at: null,
      last_error: input.lastError,
    })
    .eq('id', input.jobId);

  return 'requeued';
}

export async function dispatchOrchestrationJobById(
  supabase: Supabase,
  input: {
    jobId: string;
    linearIssueSync: LinearIssueSync | null;
    openCodeSessions: OpenCodeSessions | null;
  },
): Promise<OrchestrationJobDispatchResult> {
  const job = await claimJobById(supabase, input.jobId);
  if (!job) return { claimed: false as const };

  try {
    if (job.kind === 'story_build') {
      const payload = job.payload as StoryBuildJobPayload;
      await processBuildRunById(supabase, {
        runId: payload.build_run_id,
        releaseId: payload.release_id,
        storyIds: payload.story_ids,
        openCodeSessions: input.openCodeSessions,
      });
    } else {
      if (!input.linearIssueSync) throw new Error('Linear integration is not enabled');
      const payload = job.payload as StoryLinearSyncJobPayload;
      await processStoryLinearSyncById(supabase, {
        storyId: payload.story_id,
        linearIssueSync: input.linearIssueSync,
      });
    }

    await markJobResult(supabase, { jobId: job.id, status: 'completed' });
    return { claimed: true as const, completed: true as const };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Orchestration job failed';
    const outcome = await markJobFailureOrRequeue(supabase, {
      jobId: job.id,
      attempts: job.attempts,
      maxAttempts: job.max_attempts,
      lastError: message,
    });
    return {
      claimed: true as const,
      completed: false as const,
      requeued: outcome === 'requeued',
      error: message,
    };
  }
}

export async function dispatchQueuedOrchestrationJobs(
  supabase: Supabase,
  input: {
    limit: number;
    linearIssueSync: LinearIssueSync | null;
    openCodeSessions: OpenCodeSessions | null;
  },
): Promise<OrchestrationJobSummary> {
  let claimed = 0;
  let completed = 0;
  let requeued = 0;
  let failed = 0;
  let considered = 0;

  while (considered < input.limit) {
    const { data: nextJob, error } = await supabase
      .from('orchestration_jobs')
      .select('id')
      .eq('status', 'queued')
      .lte('available_at', new Date().toISOString())
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (error) throw error;
    if (!nextJob?.id) break;

    considered += 1;
    const result = await dispatchOrchestrationJobById(supabase, {
      jobId: nextJob.id as string,
      linearIssueSync: input.linearIssueSync,
      openCodeSessions: input.openCodeSessions,
    });

    if (!result.claimed) continue;
    claimed += 1;
    if (result.completed) completed += 1;
    else if (result.requeued) requeued += 1;
    else failed += 1;
  }

  return { considered, claimed, completed, requeued, failed };
}
