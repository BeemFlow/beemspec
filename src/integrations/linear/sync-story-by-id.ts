import { loadStoryWithStoryMap } from '@/build-runs/processor';
import { resolveLinearSyncContextForStoryMap } from '@/integrations/linear/auth';
import { getStoryLinearLink, upsertStoryLinearLink } from '@/integrations/linear/story-links';
import { syncStoryToLinear } from '@/integrations/linear/story-sync';
import type { LinearIssueSync } from '@/integrations/linear/types';
import type { createClient } from '@/lib/supabase/server';

type Supabase = Awaited<ReturnType<typeof createClient>>;

export async function processStoryLinearSyncById(
  supabase: Supabase,
  input: {
    storyId: string;
    linearIssueSync: LinearIssueSync | null;
  },
) {
  const context = await loadStoryWithStoryMap(supabase, input.storyId);
  if (!context.ok) throw new Error(`Failed to load story: ${context.reason}`);

  const linearSyncContext = await resolveLinearSyncContextForStoryMap(supabase, {
    storyMapId: context.data.storyMapId,
    fallbackLinearIssueSync: input.linearIssueSync,
  });

  if (!linearSyncContext.target || !linearSyncContext.targetConfigured) {
    throw new Error('No linear target configured for story map team');
  }

  if (!linearSyncContext.linearIssueSync) {
    throw new Error('Linear integration is not enabled');
  }

  const { story } = context.data;
  const existingLink = await getStoryLinearLink(supabase, input.storyId);
  const linearIssue = await syncStoryToLinear(
    story,
    linearSyncContext.linearIssueSync,
    existingLink?.linearIssueId ?? null,
    linearSyncContext.target,
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
