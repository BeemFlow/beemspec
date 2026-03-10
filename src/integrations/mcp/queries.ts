import type { SupabaseLike } from '@/lib/supabase/types';

interface StoryContext {
  releaseId: string;
  storyId: string;
  storyTitle: string;
  requirements: string;
  acceptanceCriteria: string;
  technicalGuidelines: string | null;
}

interface StoryContextRow {
  id: string;
  title: string;
  release_id?: string | null;
  content: {
    requirements?: string;
    acceptance_criteria?: string;
    technical_guidelines?: string | null;
  };
}

function mapStoryToContext(story: StoryContextRow): StoryContext {
  const content = story.content ?? {};
  return {
    releaseId: story.release_id ?? '',
    storyId: story.id,
    storyTitle: story.title,
    requirements: content.requirements ?? '',
    acceptanceCriteria: content.acceptance_criteria ?? '',
    technicalGuidelines: content.technical_guidelines ?? null,
  };
}

interface StoriesTable {
  select(columns: string): {
    eq(column: string, value: string): { single(): Promise<{ data: StoryContextRow | null; error: unknown }> };
  };
}

export async function getStoryContext(supabase: SupabaseLike, storyId: string): Promise<StoryContext | null> {
  const table = supabase.from('stories') as StoriesTable;
  const { data: story, error } = await table.select('id, release_id, title, content').eq('id', storyId).single();

  if (error || !story) return null;
  if (!story.release_id) return null;

  return mapStoryToContext(story);
}
