import {
  WORKER_JOB_KIND,
  WORKER_JOB_STATUS,
  WORKER_JOBS_TABLE,
  type WorkerJobKind,
  type WorkerJobStatus,
} from '@/build-runs/constants';
import { processBuildRunById, processStoryLinearSyncById } from '@/build-runs/processor';
import type { LinearIssueSync } from '@/integrations/linear/types';
import type { OpenCodeSessions } from '@/integrations/opencode/session';
import type { createClient } from '@/lib/supabase/server';

type Supabase = Awaited<ReturnType<typeof createClient>>;
const BASE_RETRY_DELAY_MS = 5000;

interface StoryBuildJobPayload {
  release_id: string | null;
  build_run_id: string;
  story_map_id: string;
  story_ids: string[];
}

interface StoryLinearSyncJobPayload {
  story_id: string;
}

interface WorkerJobRow {
  id: string;
  kind: WorkerJobKind;
  status: WorkerJobStatus;
  attempts: number;
  max_attempts: number;
  payload: StoryBuildJobPayload | StoryLinearSyncJobPayload;
}

interface WorkerJobProcessResult {
  completed?: boolean;
  requeued?: boolean;
  error?: string;
}

export interface WorkerJobSummary {
  considered: number;
  claimed: number;
  completed: number;
  requeued: number;
  failed: number;
}

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

export async function enqueueStoryLinearSyncJob(
  supabase: Supabase,
  input: {
    storyMapId: string;
    storyId: string;
  },
) {
  return supabase
    .from(WORKER_JOBS_TABLE)
    .insert({
      story_map_id: input.storyMapId,
      kind: WORKER_JOB_KIND.storyLinearSync,
      status: WORKER_JOB_STATUS.queued,
      payload: {
        story_id: input.storyId,
      },
      available_at: new Date().toISOString(),
    })
    .select('id, status')
    .single();
}

async function claimNextWorkerJob(supabase: Supabase): Promise<WorkerJobRow | null> {
  const { data, error } = await supabase.rpc('claim_next_worker_job').maybeSingle<WorkerJobRow>();
  if (error) throw error;
  return data ?? null;
}

async function markJobResult(
  supabase: Supabase,
  input: {
    jobId: string;
    status: typeof WORKER_JOB_STATUS.completed | typeof WORKER_JOB_STATUS.failed;
    lastError?: string | null;
  },
) {
  return supabase
    .from(WORKER_JOBS_TABLE)
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
      status: WORKER_JOB_STATUS.failed,
      lastError: input.lastError,
    });
    return 'failed';
  }

  const availableAt = new Date(Date.now() + getRetryDelayMs(input.attempts)).toISOString();
  await supabase
    .from(WORKER_JOBS_TABLE)
    .update({
      status: WORKER_JOB_STATUS.queued,
      available_at: availableAt,
      started_at: null,
      finished_at: null,
      last_error: input.lastError,
    })
    .eq('id', input.jobId);

  return 'requeued';
}

async function processClaimedWorkerJob(
  supabase: Supabase,
  input: {
    job: WorkerJobRow;
    linearIssueSync: LinearIssueSync | null;
    openCodeSessions: OpenCodeSessions | null;
  },
): Promise<WorkerJobProcessResult> {
  try {
    if (input.job.kind === WORKER_JOB_KIND.storyBuild) {
      const payload = input.job.payload as StoryBuildJobPayload;
      await processBuildRunById(supabase, {
        runId: payload.build_run_id,
        releaseId: payload.release_id,
        storyIds: payload.story_ids,
        openCodeSessions: input.openCodeSessions,
      });
    } else {
      const payload = input.job.payload as StoryLinearSyncJobPayload;
      await processStoryLinearSyncById(supabase, {
        storyId: payload.story_id,
        linearIssueSync: input.linearIssueSync,
      });
    }

    await markJobResult(supabase, { jobId: input.job.id, status: WORKER_JOB_STATUS.completed });
    return { completed: true as const };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Worker job failed';
    const outcome = await markJobFailureOrRequeue(supabase, {
      jobId: input.job.id,
      attempts: input.job.attempts,
      maxAttempts: input.job.max_attempts,
      lastError: message,
    });
    return {
      completed: false as const,
      requeued: outcome === 'requeued',
      error: message,
    };
  }
}

export async function dispatchQueuedWorkerJobs(
  supabase: Supabase,
  input: {
    limit: number;
    linearIssueSync: LinearIssueSync | null;
    openCodeSessions: OpenCodeSessions | null;
  },
): Promise<WorkerJobSummary> {
  let claimed = 0;
  let completed = 0;
  let requeued = 0;
  let failed = 0;
  let considered = 0;

  while (considered < input.limit) {
    const job = await claimNextWorkerJob(supabase);
    if (!job) break;

    considered += 1;
    claimed += 1;
    const result = await processClaimedWorkerJob(supabase, {
      job,
      linearIssueSync: input.linearIssueSync,
      openCodeSessions: input.openCodeSessions,
    });

    if (result.completed) completed += 1;
    else if (result.requeued) requeued += 1;
    else failed += 1;
  }

  return { considered, claimed, completed, requeued, failed };
}
