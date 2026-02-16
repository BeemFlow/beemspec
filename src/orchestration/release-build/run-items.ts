import { getStoryLinearLink } from '@/integrations/linear/story-links';
import type { OpenCodeSessions } from '@/integrations/opencode/types';
import type { createClient } from '@/lib/supabase/server';
import type { Story } from '@/types';

type Supabase = Awaited<ReturnType<typeof createClient>>;

interface ExistingBuildRunItemRow {
  status: 'pending' | 'synced' | 'failed';
  linear_issue_id: string | null;
  retry_count: number;
  last_retry_at: string | null;
}

async function loadExistingBuildRunItem(
  supabase: Supabase,
  input: { runId: string; storyId: string },
): Promise<ExistingBuildRunItemRow | null> {
  const { data, error } = await supabase
    .from('build_run_items')
    .select('status, linear_issue_id, retry_count, last_retry_at')
    .eq('build_run_id', input.runId)
    .eq('story_id', input.storyId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;
  return {
    status: data.status as ExistingBuildRunItemRow['status'],
    linear_issue_id: (data.linear_issue_id as string | null) ?? null,
    retry_count: data.retry_count as number,
    last_retry_at: (data.last_retry_at as string | null) ?? null,
  };
}

function retryMetadata(existing: ExistingBuildRunItemRow | null): { retryCount: number; lastRetryAt: string | null } {
  if (!existing) return { retryCount: 0, lastRetryAt: null };
  if (existing.status !== 'failed') {
    return {
      retryCount: existing.retry_count,
      lastRetryAt: existing.last_retry_at,
    };
  }
  return {
    retryCount: existing.retry_count + 1,
    lastRetryAt: new Date().toISOString(),
  };
}

async function insertSyncedRunItem(
  supabase: Supabase,
  input: {
    runId: string;
    storyId: string;
    linearIssueId: string;
    sessionId: string | null;
    sessionUrl: string | null;
    retryCount: number;
    lastRetryAt: string | null;
  },
) {
  return supabase
    .from('build_run_items')
    .upsert(
      {
        build_run_id: input.runId,
        story_id: input.storyId,
        linear_issue_id: input.linearIssueId,
        opencode_session_id: input.sessionId,
        opencode_session_url: input.sessionUrl,
        status: 'synced',
        error: null,
        retry_count: input.retryCount,
        last_retry_at: input.lastRetryAt,
      },
      { onConflict: 'build_run_id,story_id' },
    )
    .select('id')
    .single();
}

export async function insertFailedBuildRunItem(
  supabase: Supabase,
  input: {
    runId: string;
    storyId: string;
    error: string;
  },
) {
  const existing = await loadExistingBuildRunItem(supabase, input);
  const retry = retryMetadata(existing);

  return supabase
    .from('build_run_items')
    .upsert(
      {
        build_run_id: input.runId,
        story_id: input.storyId,
        status: 'failed',
        error: input.error,
        retry_count: retry.retryCount,
        last_retry_at: retry.lastRetryAt,
      },
      { onConflict: 'build_run_id,story_id' },
    )
    .select('id')
    .single();
}

export async function syncAndInsertRunItem(
  supabase: Supabase,
  input: {
    runId: string;
    storyId: string;
    story: Story;
    runSession: { id: string; url: string } | null;
    openCodeSessions: OpenCodeSessions | null;
  },
) {
  const link = await getStoryLinearLink(supabase, input.story.id);
  if (!link) throw new Error('Story is not synced to Linear. Use sync to Linear before building.');

  const linearIssueId = link.linearIssueId;
  const linearIssueIdentifier = link.linearIssueIdentifier ?? link.linearIssueId;
  const existing = await loadExistingBuildRunItem(supabase, input);

  if (existing?.status === 'synced' && existing.linear_issue_id === linearIssueId) {
    return {
      linearIssue: { id: linearIssueId, identifier: linearIssueIdentifier },
      session: input.runSession,
    };
  }

  const retry = retryMetadata(existing);

  if (input.runSession && input.openCodeSessions) {
    await input.openCodeSessions.appendStoryAssignment({
      sessionId: input.runSession.id,
      runId: input.runId,
      storyId: input.story.id,
      storyTitle: input.story.title,
      linearIssueIdentifier,
      requirements: input.story.requirements,
      acceptanceCriteria: input.story.acceptance_criteria,
      technicalGuidelines: input.story.technical_guidelines,
    });
  }

  await insertSyncedRunItem(supabase, {
    runId: input.runId,
    storyId: input.storyId,
    linearIssueId,
    sessionId: input.runSession?.id ?? null,
    sessionUrl: input.runSession?.url ?? null,
    retryCount: retry.retryCount,
    lastRetryAt: retry.lastRetryAt,
  });

  return {
    linearIssue: { id: linearIssueId, identifier: linearIssueIdentifier },
    session: input.runSession,
  };
}
