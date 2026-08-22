import { createLinearClient } from '@beemspec/linear';
import { resolveLinearAuthTokenForTeamResult } from '@/integrations/linear/auth';
import { pushStoryToLinearById } from '@/integrations/linear/story-sync';
import { createAdminClient } from '@/lib/supabase/admin';

const MAX_ATTEMPTS = 8;
const VISIBILITY_TIMEOUT_SECONDS = 900;

type AdminSupabase = ReturnType<typeof createAdminClient>;

interface ClaimedLinearSyncJob {
  message_id: number;
  read_count: number;
  enqueued_at: string;
  payload: unknown;
}

interface LinearSyncJobPayload {
  provider: 'linear';
  entity_type: 'story';
  entity_id: string;
  operation: 'upsert' | 'delete';
  desired_version: string;
  remote_id?: string;
  team_id?: string;
}

interface LinearSyncState {
  provider: 'linear';
  entity_type: 'story';
  entity_id: string;
  team_id: string;
  operation: 'upsert' | 'delete';
  desired_version: string;
  remote_id: string | null;
  status: 'pending' | 'processing' | 'synced' | 'error';
}

export interface LinearSyncBatchSummary {
  claimed: number;
  succeeded: number;
  retried: number;
  failed: number;
  stale: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object');
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function parseJobPayload(value: unknown): LinearSyncJobPayload | null {
  if (!isRecord(value)) return null;

  const entityId = nonEmptyString(value.entity_id);
  const desiredVersion = nonEmptyString(value.desired_version);
  const operation = value.operation;
  if (
    value.provider !== 'linear' ||
    value.entity_type !== 'story' ||
    !entityId ||
    !desiredVersion ||
    (operation !== 'upsert' && operation !== 'delete') ||
    Number.isNaN(Date.parse(desiredVersion))
  ) {
    return null;
  }

  return {
    provider: 'linear',
    entity_type: 'story',
    entity_id: entityId,
    operation,
    desired_version: desiredVersion,
    remote_id: nonEmptyString(value.remote_id) ?? undefined,
    team_id: nonEmptyString(value.team_id) ?? undefined,
  };
}

function sameVersion(left: string, right: string): boolean {
  return Date.parse(left) === Date.parse(right);
}

function errorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.slice(0, 1_000);
}

function isNotFoundError(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && 'status' in error && Number(error.status) === 404);
}

function retryDelaySeconds(readCount: number): number {
  return Math.min(3_600, 15 * 2 ** Math.max(0, readCount - 1));
}

async function archiveJob(supabase: AdminSupabase, messageId: number): Promise<void> {
  const { error } = await supabase.rpc('archive_linear_sync_job', { p_message_id: messageId });
  if (error) throw error;
}

async function loadCurrentState(
  supabase: AdminSupabase,
  payload: LinearSyncJobPayload,
): Promise<LinearSyncState | null> {
  const { data, error } = await supabase
    .from('integration_sync_state')
    .select('provider, entity_type, entity_id, team_id, operation, desired_version, remote_id, status')
    .eq('provider', payload.provider)
    .eq('entity_type', payload.entity_type)
    .eq('entity_id', payload.entity_id)
    .maybeSingle<LinearSyncState>();
  if (error) throw error;
  return data;
}

async function updateCurrentState(
  supabase: AdminSupabase,
  payload: LinearSyncJobPayload,
  changes: Record<string, unknown>,
): Promise<boolean> {
  const { data, error } = await supabase
    .from('integration_sync_state')
    .update({ ...changes, updated_at: new Date().toISOString() })
    .eq('provider', payload.provider)
    .eq('entity_type', payload.entity_type)
    .eq('entity_id', payload.entity_id)
    .eq('operation', payload.operation)
    .eq('desired_version', payload.desired_version)
    .select('entity_id')
    .maybeSingle<{ entity_id: string }>();
  if (error) throw error;
  return Boolean(data);
}

async function processDeleteJob(state: LinearSyncState): Promise<string> {
  if (!state.remote_id) throw new Error('Linear delete job is missing its remote issue id');

  const auth = await resolveLinearAuthTokenForTeamResult(state.team_id);
  if (auth.status !== 'ready') {
    throw new Error(
      auth.status === 'auth_unavailable'
        ? 'Linear authorization is unavailable or expired'
        : auth.status === 'not_connected'
          ? 'Linear integration is not connected'
          : 'Failed to resolve Linear authorization',
      auth.status === 'error' ? { cause: auth.error } : undefined,
    );
  }

  const issueSync = createLinearClient(true, { accessToken: auth.accessToken });
  if (!issueSync) throw new Error('Linear integration is not connected');

  try {
    await issueSync.deleteIssue(state.remote_id);
  } catch (error) {
    if (!isNotFoundError(error)) throw error;
  }
  return state.remote_id;
}

async function processClaimedJob(
  supabase: AdminSupabase,
  job: ClaimedLinearSyncJob,
  summary: LinearSyncBatchSummary,
): Promise<void> {
  const payload = parseJobPayload(job.payload);
  if (!payload) {
    await archiveJob(supabase, job.message_id);
    summary.failed += 1;
    return;
  }

  const state = await loadCurrentState(supabase, payload);
  if (!state || state.operation !== payload.operation || !sameVersion(state.desired_version, payload.desired_version)) {
    await archiveJob(supabase, job.message_id);
    summary.stale += 1;
    return;
  }

  const claimedCurrentState = await updateCurrentState(supabase, payload, {
    status: 'processing',
    attempt_count: job.read_count,
    last_error: null,
    last_attempted_at: new Date().toISOString(),
  });
  if (!claimedCurrentState) {
    await archiveJob(supabase, job.message_id);
    summary.stale += 1;
    return;
  }

  try {
    const remoteId =
      payload.operation === 'delete'
        ? await processDeleteJob(state)
        : (
            await pushStoryToLinearById(supabase as never, {
              storyId: payload.entity_id,
              recoverDeterministicCreate: job.read_count > 1,
            })
          ).id;

    await updateCurrentState(supabase, payload, {
      status: 'synced',
      remote_id: remoteId,
      attempt_count: job.read_count,
      last_error: null,
      last_synced_at: new Date().toISOString(),
    });
    await archiveJob(supabase, job.message_id);
    summary.succeeded += 1;
  } catch (error) {
    const message = errorMessage(error);
    if (job.read_count >= MAX_ATTEMPTS) {
      await updateCurrentState(supabase, payload, {
        status: 'error',
        attempt_count: job.read_count,
        last_error: message,
      });
      await archiveJob(supabase, job.message_id);
      summary.failed += 1;
      return;
    }

    await updateCurrentState(supabase, payload, {
      status: 'pending',
      attempt_count: job.read_count,
      last_error: message,
    });
    const { error: retryError } = await supabase.rpc('retry_linear_sync_job', {
      p_message_id: job.message_id,
      p_delay_seconds: retryDelaySeconds(job.read_count),
    });
    if (retryError) throw retryError;
    summary.retried += 1;
  }
}

export async function processLinearSyncBatch(
  input: { limit?: number; supabase?: AdminSupabase } = {},
): Promise<LinearSyncBatchSummary> {
  const supabase = input.supabase ?? createAdminClient();
  const limit = Math.min(100, Math.max(1, input.limit ?? 10));
  const { data, error } = await supabase.rpc('claim_linear_sync_jobs', {
    p_limit: limit,
    p_visibility_timeout: VISIBILITY_TIMEOUT_SECONDS,
  });
  if (error) throw error;

  const jobs = (data ?? []) as ClaimedLinearSyncJob[];
  const summary: LinearSyncBatchSummary = {
    claimed: jobs.length,
    succeeded: 0,
    retried: 0,
    failed: 0,
    stale: 0,
  };

  for (const job of jobs) {
    await processClaimedJob(supabase, job, summary);
  }

  return summary;
}
