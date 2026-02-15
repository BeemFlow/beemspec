import type { createClient } from '@/lib/supabase/server';
import type { Story } from '@/types';

type Supabase = Awaited<ReturnType<typeof createClient>>;

type StoryBuildContextFailureReason = 'story_not_found' | 'story_task_not_found' | 'story_activity_not_found';

export type StoryBuildContextResult =
  | {
      ok: true;
      data: {
        story: Story;
        storyMapId: string;
      };
    }
  | {
      ok: false;
      reason: StoryBuildContextFailureReason;
      error?: unknown;
    };

export type StoryWithMapResult =
  | {
      ok: true;
      data: {
        story: Story;
        storyMapId: string;
      };
    }
  | {
      ok: false;
      reason: 'story_not_found' | 'story_task_not_found' | 'story_activity_not_found';
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
      story: story as Story,
      storyMapId: activity.story_map_id as string,
    },
  };
}

export async function loadStoryBuildContext(supabase: Supabase, storyId: string): Promise<StoryBuildContextResult> {
  const context = await loadStoryWithStoryMap(supabase, storyId);
  if (!context.ok) return context;

  return {
    ok: true,
    data: context.data,
  };
}
