import type { OpenCodeSessionContext, SessionContextResponse, StoryContextRow } from '@beemspec/opencode';
import { mapStoryToSessionContext } from '@beemspec/opencode';
import type { SupabaseLike } from '@/lib/supabase/types';

interface StoriesTable {
  select(columns: string): {
    eq(column: string, value: string): { single(): Promise<{ data: StoryContextRow | null; error: unknown }> };
    in(column: string, values: string[]): Promise<{ data: StoryContextRow[] | null; error: unknown }>;
  };
}

interface BuildRunsTable {
  select(columns: string): {
    eq(
      column: string,
      value: string,
    ): { maybeSingle(): Promise<{ data: { id: string; release_id: string | null } | null; error: unknown }> };
  };
}

interface BuildRunItemsTable {
  select(columns: string): {
    eq(column: string, value: string): Promise<{ data: Array<{ story_id: string }> | null; error: unknown }>;
  };
}

/**
 * Load a single story and map it to OpenCodeSessionContext.
 * Returns null if the story is not found or has no release.
 */
export async function getStoryContext(supabase: SupabaseLike, storyId: string): Promise<OpenCodeSessionContext | null> {
  const table = supabase.from('stories') as StoriesTable;
  const { data: story, error } = await table.select('id, release_id, title, content').eq('id', storyId).single();

  if (error || !story) return null;
  if (!story.release_id) return null;

  return mapStoryToSessionContext(story);
}

/**
 * Load session context for a build run by OpenCode session ID.
 * Returns the full SessionContextResponse shape.
 */
export async function getSessionContextBySessionId(
  supabase: SupabaseLike,
  sessionId: string,
): Promise<SessionContextResponse> {
  const empty: SessionContextResponse = { sessionId, releaseId: null, runId: null, stories: [] };

  // Find the build run
  const runsTable = supabase.from('build_runs') as BuildRunsTable;
  const { data: run, error: runError } = await runsTable
    .select('id, release_id')
    .eq('opencode_session_id', sessionId)
    .maybeSingle();

  if (runError) throw runError;
  if (!run) return empty;

  // Load items
  const itemsTable = supabase.from('build_run_items') as BuildRunItemsTable;
  const { data: items, error: itemsError } = await itemsTable.select('story_id').eq('build_run_id', run.id);

  if (itemsError) throw itemsError;
  if (!items || items.length === 0) {
    return { sessionId, releaseId: run.release_id ?? null, runId: run.id, stories: [] };
  }

  // Load stories
  const storyIds = items.map((item) => item.story_id);
  const storiesTable = supabase.from('stories') as StoriesTable;
  const { data: stories, error: storiesError } = await storiesTable
    .select('id, release_id, title, content')
    .in('id', storyIds);

  if (storiesError) throw storiesError;

  return {
    sessionId,
    releaseId: run.release_id ?? null,
    runId: run.id,
    stories: (stories ?? []).map(mapStoryToSessionContext),
  };
}
