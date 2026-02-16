import { resolveLinearSyncContextForStoryMap } from '@/integrations/linear/auth';
import { getStoryLinearLink, upsertStoryLinearLink } from '@/integrations/linear/story-links';
import { syncStoryToLinear } from '@/integrations/linear/story-sync';
import type { LinearIssueSync } from '@/integrations/linear/types';
import type { createClient } from '@/lib/supabase/server';
import type { Story } from '@/types';

type Supabase = Awaited<ReturnType<typeof createClient>>;

async function loadStoryWithStoryMap(
  supabase: Supabase,
  storyId: string,
): Promise<{ story: Story; storyMapId: string }> {
  const { data: story, error: storyError } = await supabase.from('stories').select('*').eq('id', storyId).single();
  if (storyError || !story) throw new Error('Story not found');

  const { data: task, error: taskError } = await supabase
    .from('tasks')
    .select('activity_id')
    .eq('id', story.task_id)
    .single();
  if (taskError || !task) throw new Error('Task not found for story');

  const { data: activity, error: activityError } = await supabase
    .from('activities')
    .select('story_map_id')
    .eq('id', task.activity_id)
    .single();
  if (activityError || !activity) throw new Error('Activity not found for story');

  return {
    story: story as Story,
    storyMapId: activity.story_map_id as string,
  };
}

export async function processStoryLinearSyncById(
  supabase: Supabase,
  input: {
    storyId: string;
    linearIssueSync: LinearIssueSync | null;
  },
) {
  const context = await loadStoryWithStoryMap(supabase, input.storyId);

  const linearSyncContext = await resolveLinearSyncContextForStoryMap(supabase, {
    storyMapId: context.storyMapId,
    fallbackLinearIssueSync: input.linearIssueSync,
  });

  if (!linearSyncContext.target || !linearSyncContext.targetConfigured) {
    throw new Error('No linear target configured for story map team');
  }

  if (!linearSyncContext.linearIssueSync) {
    throw new Error('Linear integration is not enabled');
  }

  const existingLink = await getStoryLinearLink(supabase, input.storyId);
  const linearIssue = await syncStoryToLinear(
    context.story,
    linearSyncContext.linearIssueSync,
    existingLink?.linearIssueId ?? null,
    linearSyncContext.target,
  );
  if (!linearIssue) throw new Error('Linear sync returned no issue snapshot');

  await upsertStoryLinearLink(supabase, {
    storyId: input.storyId,
    linearIssueId: linearIssue.id,
    linearIssueIdentifier: linearIssue.identifier,
    lastLocalUpdatedAt: context.story.updated_at ?? null,
    lastLinearUpdatedAt: linearIssue.updatedAt,
  });

  return linearIssue;
}
