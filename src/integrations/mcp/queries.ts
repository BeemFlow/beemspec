import type { OpenCodeSessionContext, StoryContextRow } from '@beemspec/opencode';
import { mapStoryToSessionContext } from '@beemspec/opencode';
import type { SupabaseLike } from '@/lib/supabase/types';

interface StoriesTable {
  select(columns: string): {
    eq(column: string, value: string): { single(): Promise<{ data: StoryContextRow | null; error: unknown }> };
  };
}

export async function getStoryContext(supabase: SupabaseLike, storyId: string): Promise<OpenCodeSessionContext | null> {
  const table = supabase.from('stories') as StoriesTable;
  const { data: story, error } = await table.select('id, release_id, title, content').eq('id', storyId).single();

  if (error || !story) return null;
  if (!story.release_id) return null;

  return mapStoryToSessionContext(story);
}
