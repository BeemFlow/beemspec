import type { LinearIssueSyncPort } from '@/integrations/linear/contracts';
import { getLinearStorySyncTargetForStoryMap } from '@/integrations/linear/settings';
import type { OpenCodeSessionPort } from '@/integrations/opencode/contracts';
import type { createClient } from '@/lib/supabase/server';
import { syncStoryRunItem } from '@/orchestration/release-runner/story-item';
import type { Story } from '@/types';

type Supabase = Awaited<ReturnType<typeof createClient>>;

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return 'Release run item failed';
}

async function finishRun(
  supabase: Supabase,
  runId: string,
  result: {
    status: 'completed' | 'failed';
    completedItems: number;
    failedItems: number;
    error: string | null;
  },
) {
  return supabase
    .from('release_runs')
    .update({
      status: result.status,
      completed_items: result.completedItems,
      failed_items: result.failedItems,
      finished_at: new Date().toISOString(),
      error: result.error,
    })
    .eq('id', runId);
}

async function processRunItems(
  supabase: Supabase,
  input: {
    runId: string;
    releaseId: string;
    stories: Story[];
    linearIssueSync: LinearIssueSyncPort;
    openCodeSessions: OpenCodeSessionPort | null;
    target: { teamId: string; projectId?: string; stateId?: string };
  },
) {
  let completedItems = 0;
  let failedItems = 0;

  for (const story of input.stories) {
    try {
      const { linearIssue, session } = await syncStoryRunItem({
        supabase,
        story,
        releaseId: input.releaseId,
        linearIssueSync: input.linearIssueSync,
        openCodeSessions: input.openCodeSessions,
        target: input.target,
      });

      await supabase.from('release_run_items').insert({
        release_run_id: input.runId,
        story_id: story.id,
        linear_issue_id: linearIssue.id,
        opencode_session_id: session?.id ?? null,
        opencode_session_url: session?.url ?? null,
        status: 'synced',
      });

      completedItems += 1;
    } catch (error) {
      failedItems += 1;
      await supabase.from('release_run_items').insert({
        release_run_id: input.runId,
        story_id: story.id,
        status: 'failed',
        error: toErrorMessage(error),
      });
    }
  }

  return { completedItems, failedItems };
}

export async function processReleaseRunById(
  supabase: Supabase,
  input: {
    runId: string;
    releaseId: string;
    storyMapId: string;
    linearIssueSync: LinearIssueSyncPort;
    openCodeSessions: OpenCodeSessionPort | null;
  },
) {
  const { data: stories, error: storiesError } = await supabase
    .from('stories')
    .select('*')
    .eq('release_id', input.releaseId)
    .order('sort_order', { ascending: true });
  if (storiesError) throw storiesError;

  const target = await getLinearStorySyncTargetForStoryMap(supabase, input.storyMapId);
  if (!target) {
    await finishRun(supabase, input.runId, {
      status: 'failed',
      completedItems: 0,
      failedItems: (stories ?? []).length,
      error: 'No linear target configured for release team',
    });
    return {
      status: 'failed' as const,
      totalItems: (stories ?? []).length,
      completedItems: 0,
      failedItems: (stories ?? []).length,
    };
  }

  const { completedItems, failedItems } = await processRunItems(supabase, {
    runId: input.runId,
    releaseId: input.releaseId,
    stories: (stories ?? []) as Story[],
    linearIssueSync: input.linearIssueSync,
    openCodeSessions: input.openCodeSessions,
    target,
  });

  const status = failedItems > 0 ? 'failed' : 'completed';
  await finishRun(supabase, input.runId, {
    status,
    completedItems,
    failedItems,
    error: failedItems > 0 ? `${failedItems} item(s) failed` : null,
  });

  return { status, totalItems: (stories ?? []).length, completedItems, failedItems };
}
