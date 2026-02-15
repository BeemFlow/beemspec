import type { LinearIssueSnapshot, LinearIssueSyncPort } from '@/integrations/linear/contracts';
import { getStoryLinearLink, upsertStoryLinearLink } from '@/integrations/linear/story-links';
import {
  type LinearStorySyncTarget,
  type StoryForLinearSync,
  syncStoryToLinear,
} from '@/integrations/linear/story-sync';
import type { OpenCodeSessionPort, OpenCodeSessionSnapshot } from '@/integrations/opencode/contracts';

type SupabaseLike = {
  from: (table: string) => unknown;
};

export interface StoryRunItemInput {
  supabase: SupabaseLike;
  story: StoryForLinearSync & { updated_at: string | null; release_id?: string | null };
  releaseId: string;
  linearIssueSync: LinearIssueSyncPort;
  openCodeSessions: OpenCodeSessionPort | null;
  target: LinearStorySyncTarget;
}

export interface StoryRunItemResult {
  linearIssue: LinearIssueSnapshot;
  session: OpenCodeSessionSnapshot | null;
}

export async function syncStoryRunItem(input: StoryRunItemInput): Promise<StoryRunItemResult> {
  const existingLink = await getStoryLinearLink(input.supabase, input.story.id);
  const linearIssue = await syncStoryToLinear(
    input.story,
    input.linearIssueSync,
    existingLink?.linearIssueId ?? null,
    input.target,
  );

  if (!linearIssue) throw new Error('Linear sync returned no issue snapshot');

  await upsertStoryLinearLink(input.supabase, {
    storyId: input.story.id,
    linearIssueId: linearIssue.id,
    linearIssueIdentifier: linearIssue.identifier,
    lastLocalUpdatedAt: input.story.updated_at,
    lastLinearUpdatedAt: linearIssue.updatedAt,
  });

  const session = input.openCodeSessions
    ? await input.openCodeSessions.createSession({
        releaseId: input.releaseId,
        storyId: input.story.id,
        storyTitle: input.story.title,
        linearIssueId: linearIssue.id,
        linearIssueIdentifier: linearIssue.identifier,
        requirements: input.story.requirements,
        acceptanceCriteria: input.story.acceptance_criteria,
        technicalGuidelines: input.story.technical_guidelines,
      })
    : null;

  return { linearIssue, session };
}
