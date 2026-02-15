import type { createClient } from '@/lib/supabase/server';
import type { BuildRunStatus } from '@/orchestration/release-build/types';

type Supabase = Awaited<ReturnType<typeof createClient>>;

export function toErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

export async function createBuildRun(
  supabase: Supabase,
  input: {
    releaseId: string | null;
    storyMapId: string;
    userId: string;
    totalItems: number;
    status: BuildRunStatus;
  },
) {
  return supabase
    .from('build_runs')
    .insert({
      release_id: input.releaseId,
      story_map_id: input.storyMapId,
      triggered_by: input.userId,
      status: input.status,
      total_items: input.totalItems,
      completed_items: 0,
      failed_items: 0,
      started_at: new Date().toISOString(),
    })
    .select('id')
    .single();
}

export async function finishBuildRun(
  supabase: Supabase,
  input: {
    runId: string;
    status: 'completed' | 'failed';
    completedItems: number;
    failedItems: number;
    error: string | null;
  },
) {
  return supabase
    .from('build_runs')
    .update({
      status: input.status,
      completed_items: input.completedItems,
      failed_items: input.failedItems,
      finished_at: new Date().toISOString(),
      error: input.error,
    })
    .eq('id', input.runId);
}

export async function markBuildRunRunning(supabase: Supabase, runId: string) {
  return supabase.from('build_runs').update({ status: 'running', error: null }).eq('id', runId);
}

export async function summarizeAndFinishBuildRun(supabase: Supabase, runId: string) {
  const { data: items, error: itemsError } = await supabase
    .from('build_run_items')
    .select('status')
    .eq('build_run_id', runId);
  if (itemsError || !items) throw itemsError ?? new Error('Failed to load build run items');

  const { completed, failed } = summarizeBuildRunItemStatuses(items as Array<{ status: string }>);
  const status = failed > 0 ? 'failed' : 'completed';
  await finishBuildRun(supabase, {
    runId,
    status,
    completedItems: completed,
    failedItems: failed,
    error: failed > 0 ? `${failed} item(s) failed` : null,
  });

  return { status, completed, failed };
}

export function summarizeBuildRunItemStatuses(items: Array<{ status: string }>) {
  const completed = items.filter((item) => item.status === 'synced').length;
  const failed = items.filter((item) => item.status === 'failed').length;
  return { completed, failed };
}
