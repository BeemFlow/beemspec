import type { Supabase } from '@/lib/supabase/types';
import type { Story } from '@/types';

type StoryBuildContextFailureReason = 'story_not_found' | 'story_task_not_found' | 'story_activity_not_found';

export type StoryWithMapResult =
  | {
      ok: true;
      data: {
        story: Story & { updated_at: string };
        storyMapId: string;
      };
    }
  | {
      ok: false;
      reason: StoryBuildContextFailureReason;
      error?: unknown;
    };

export async function loadStoryWithStoryMap(supabase: Supabase, storyId: string): Promise<StoryWithMapResult> {
  const { data: story, error: storyError } = await supabase.from('stories').select('*').eq('id', storyId).single();
  if (storyError || !story) return { ok: false, reason: 'story_not_found', error: storyError };

  const { data: task, error: taskError } = await supabase
    .from('tasks')
    .select('activity_id')
    .eq('id', story.task_id)
    .single();
  if (taskError || !task) return { ok: false, reason: 'story_task_not_found', error: taskError };

  const { data: activity, error: activityError } = await supabase
    .from('activities')
    .select('story_map_id')
    .eq('id', task.activity_id)
    .single();
  if (activityError || !activity) return { ok: false, reason: 'story_activity_not_found', error: activityError };

  return {
    ok: true,
    data: {
      story: story as Story & { updated_at: string },
      storyMapId: activity.story_map_id as string,
    },
  };
}
