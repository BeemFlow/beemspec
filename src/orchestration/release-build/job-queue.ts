import type { LinearIssueSync } from '@/integrations/linear/types';
import type { OpenCodeSessions } from '@/integrations/opencode/types';
import type { createClient } from '@/lib/supabase/server';
import { processStoryLinearSyncById } from '@/orchestration/release-build/linear-sync-processor';
import { processReleaseRunById } from '@/orchestration/release-build/run-processor';
import type {
  OrchestrationJobDispatchResult,
  OrchestrationJobRow,
  OrchestrationJobSummary,
  StoryBuildJobPayload,
  StoryLinearSyncJobPayload,
} from '@/orchestration/release-build/types';

type Supabase = Awaited<ReturnType<typeof createClient>>;

export async function enqueueStoryBuildJob(
  supabase: Supabase,
  input: {
    storyMapId: string;
    releaseRunId: string;
    releaseId: string;
    storyIds: string[];
  },
) {
  return supabase
    .from('orchestration_jobs')
    .insert({
      story_map_id: input.storyMapId,
      release_run_id: input.releaseRunId,
      kind: 'story_build',
      status: 'queued',
      payload: {
        release_id: input.releaseId,
        release_run_id: input.releaseRunId,
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
  const { data, error } = await supabase
    .from('orchestration_jobs')
    .update({ status: 'running', started_at: new Date().toISOString(), attempts: 1 })
    .eq('id', jobId)
    .eq('status', 'queued')
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
      await processReleaseRunById(supabase, {
        runId: payload.release_run_id,
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
    await markJobResult(supabase, { jobId: job.id, status: 'failed', lastError: message });
    return { claimed: true as const, completed: false as const, error: message };
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
  const { data: jobs, error } = await supabase
    .from('orchestration_jobs')
    .select('id')
    .eq('status', 'queued')
    .lte('available_at', new Date().toISOString())
    .order('created_at', { ascending: true })
    .limit(input.limit);

  if (error) throw error;

  const jobIds = (jobs ?? []).map((j) => j.id as string).filter(Boolean);
  let claimed = 0;
  let completed = 0;
  let failed = 0;

  for (const jobId of jobIds) {
    const result = await dispatchOrchestrationJobById(supabase, {
      jobId,
      linearIssueSync: input.linearIssueSync,
      openCodeSessions: input.openCodeSessions,
    });
    if (!result.claimed) continue;
    claimed += 1;
    if (result.completed) completed += 1;
    else failed += 1;
  }

  return { considered: jobIds.length, claimed, completed, failed };
}
