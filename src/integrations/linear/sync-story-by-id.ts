import { mapStoryToLinearIssueInput } from '@beemspec/linear';
import { loadStoryWithStoryMap } from '@/build-runs/processor';
import { resolveLinearSyncContextForStoryMap } from '@/integrations/linear/auth';
import { getStoryLinearLink, upsertStoryLinearLink } from '@/integrations/linear/story-links';
import type { IssueSync } from '@/integrations/sync';
import { syncStoryToRemote } from '@/integrations/sync';
import type { Supabase } from '@/lib/supabase/types';

export async function processStoryLinearSyncById(
  supabase: Supabase,
  input: {
    storyId: string;
    linearIssueSync: IssueSync | null;
  },
) {
  const context = await loadStoryWithStoryMap(supabase, input.storyId);
  if (!context.ok) throw new Error(`Failed to load story: ${context.reason}`);

  const linearSyncContext = await resolveLinearSyncContextForStoryMap(supabase, {
    storyMapId: context.data.storyMapId,
    fallbackIssueSync: input.linearIssueSync,
  });

  if (!linearSyncContext.target || !linearSyncContext.targetConfigured) {
    throw new Error('No linear target configured for story map team');
  }

  if (!linearSyncContext.linearIssueSync) {
    throw new Error('Linear integration is not enabled');
  }

  const { story } = context.data;
  const existingLink = await getStoryLinearLink(supabase, input.storyId);
  const input_ = mapStoryToLinearIssueInput(story, linearSyncContext.target);
  const linearIssue = await syncStoryToRemote(
    linearSyncContext.linearIssueSync,
    input_,
    existingLink?.linearIssueId ?? null,
  );
  if (!linearIssue) throw new Error('Linear sync returned no issue snapshot');

  await upsertStoryLinearLink(supabase, {
    storyId: input.storyId,
    linearIssueId: linearIssue.id,
    linearIssueIdentifier: linearIssue.identifier,
    lastLocalUpdatedAt: null,
    lastLinearUpdatedAt: linearIssue.updatedAt,
  });

  return linearIssue;
}
