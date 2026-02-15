import type { LinearIssueSyncPort } from '@/integrations/linear/contracts';
import type { OpenCodeSessionPort } from '@/integrations/opencode/contracts';
import type { createClient } from '@/lib/supabase/server';
import { processReleaseRunById } from '@/orchestration/release-runner/processor';

type Supabase = Awaited<ReturnType<typeof createClient>>;

interface ReleaseBuildJobPayload {
  release_id: string;
  release_run_id: string;
  story_map_id: string;
}

interface OrchestrationJobRow {
  id: string;
  kind: 'release_build';
  status: 'queued' | 'running' | 'completed' | 'failed';
  attempts: number;
  max_attempts: number;
  payload: ReleaseBuildJobPayload;
}

export async function enqueueReleaseBuildJob(
  supabase: Supabase,
  input: {
    storyMapId: string;
    releaseRunId: string;
    releaseId: string;
  },
) {
  return supabase
    .from('orchestration_jobs')
    .insert({
      story_map_id: input.storyMapId,
      release_run_id: input.releaseRunId,
      kind: 'release_build',
      status: 'queued',
      payload: {
        release_id: input.releaseId,
        release_run_id: input.releaseRunId,
        story_map_id: input.storyMapId,
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

export async function dispatchReleaseBuildJobById(
  supabase: Supabase,
  input: {
    jobId: string;
    linearIssueSync: LinearIssueSyncPort;
    openCodeSessions: OpenCodeSessionPort | null;
  },
) {
  const job = await claimJobById(supabase, input.jobId);
  if (!job) return { claimed: false as const };

  try {
    const payload = job.payload;
    await processReleaseRunById(supabase, {
      runId: payload.release_run_id,
      releaseId: payload.release_id,
      storyMapId: payload.story_map_id,
      linearIssueSync: input.linearIssueSync,
      openCodeSessions: input.openCodeSessions,
    });

    await markJobResult(supabase, { jobId: job.id, status: 'completed' });
    return { claimed: true as const, completed: true as const };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Orchestration job failed';
    await markJobResult(supabase, { jobId: job.id, status: 'failed', lastError: message });
    return { claimed: true as const, completed: false as const, error: message };
  }
}

export async function dispatchQueuedReleaseBuildJobs(
  supabase: Supabase,
  input: {
    limit: number;
    linearIssueSync: LinearIssueSyncPort;
    openCodeSessions: OpenCodeSessionPort | null;
  },
) {
  const { data: jobs, error } = await supabase
    .from('orchestration_jobs')
    .select('id')
    .eq('kind', 'release_build')
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
    const result = await dispatchReleaseBuildJobById(supabase, {
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
