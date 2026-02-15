import { getLinearStorySyncTargetForStoryMap } from '@/integrations/linear/settings';
import { getStoryLinearLink, upsertStoryLinearLink } from '@/integrations/linear/story-links';
import { syncStoryToLinear } from '@/integrations/linear/story-sync';
import type { LinearIssueSync } from '@/integrations/linear/types';
import type { createClient } from '@/lib/supabase/server';
import { loadStoryWithStoryMap } from '@/orchestration/release-build/story-context';

type Supabase = Awaited<ReturnType<typeof createClient>>;

export async function processStoryLinearSyncById(
  supabase: Supabase,
  input: {
    storyId: string;
    linearIssueSync: LinearIssueSync;
  },
) {
  const context = await loadStoryWithStoryMap(supabase, input.storyId);
  if (!context.ok) {
    if (context.reason === 'story_not_found') throw new Error('Story not found');
    if (context.reason === 'story_task_not_found') throw new Error('Task not found for story');
    throw new Error('Activity not found for story');
  }

  const { story, storyMapId } = context.data;
  const target = await getLinearStorySyncTargetForStoryMap(supabase, storyMapId);
  if (!target) throw new Error('No linear target configured for story map team');

  const existingLink = await getStoryLinearLink(supabase, input.storyId);
  const linearIssue = await syncStoryToLinear(
    story,
    input.linearIssueSync,
    existingLink?.linearIssueId ?? null,
    target,
  );
  if (!linearIssue) throw new Error('Linear sync returned no issue snapshot');

  await upsertStoryLinearLink(supabase, {
    storyId: input.storyId,
    linearIssueId: linearIssue.id,
    linearIssueIdentifier: linearIssue.identifier,
    lastLocalUpdatedAt: story.updated_at ?? null,
    lastLinearUpdatedAt: linearIssue.updatedAt,
  });

  return linearIssue;
}
