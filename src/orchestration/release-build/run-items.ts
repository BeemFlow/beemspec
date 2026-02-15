import { getStoryLinearLink } from '@/integrations/linear/story-links';
import type { OpenCodeSessions } from '@/integrations/opencode/types';
import type { createClient } from '@/lib/supabase/server';
import type { Story } from '@/types';

type Supabase = Awaited<ReturnType<typeof createClient>>;

async function insertSyncedRunItem(
  supabase: Supabase,
  input: {
    runId: string;
    storyId: string;
    linearIssueId: string;
    sessionId: string | null;
    sessionUrl: string | null;
  },
) {
  return supabase
    .from('release_run_items')
    .upsert(
      {
        release_run_id: input.runId,
        story_id: input.storyId,
        linear_issue_id: input.linearIssueId,
        opencode_session_id: input.sessionId,
        opencode_session_url: input.sessionUrl,
        status: 'synced',
        error: null,
      },
      { onConflict: 'release_run_id,story_id' },
    )
    .select('id')
    .single();
}

export async function insertFailedRunItem(
  supabase: Supabase,
  input: {
    runId: string;
    storyId: string;
    error: string;
  },
) {
  return supabase
    .from('release_run_items')
    .upsert(
      {
        release_run_id: input.runId,
        story_id: input.storyId,
        status: 'failed',
        error: input.error,
      },
      { onConflict: 'release_run_id,story_id' },
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
    releaseId: string;
    openCodeSessions: OpenCodeSessions | null;
    requireSession?: boolean;
  },
) {
  const link = await getStoryLinearLink(supabase, input.story.id);
  if (!link) throw new Error('Story is not synced to Linear. Use sync to Linear before building.');

  const linearIssueId = link.linearIssueId;
  const linearIssueIdentifier = link.linearIssueIdentifier ?? link.linearIssueId;

  const session = input.openCodeSessions
    ? await input.openCodeSessions.createSession({
        releaseId: input.releaseId,
        storyId: input.story.id,
        storyTitle: input.story.title,
        linearIssueId,
        linearIssueIdentifier,
        requirements: input.story.requirements,
        acceptanceCriteria: input.story.acceptance_criteria,
        technicalGuidelines: input.story.technical_guidelines,
      })
    : null;

  if (input.requireSession && !session) {
    throw new Error('OpenCode session not created');
  }

  await insertSyncedRunItem(supabase, {
    runId: input.runId,
    storyId: input.storyId,
    linearIssueId,
    sessionId: session?.id ?? null,
    sessionUrl: session?.url ?? null,
  });

  return { linearIssue: { id: linearIssueId, identifier: linearIssueIdentifier }, session };
}
