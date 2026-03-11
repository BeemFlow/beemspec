import { isLinearSyncAvailableForStoryMap } from '@/integrations/linear/auth';
import { processStoryLinearSyncById } from '@/integrations/linear/sync-story-by-id';
import type { Supabase } from '@/lib/supabase/types';
import { loadStoryWithStoryMap } from '@/storymap/story-context';

export async function maybeSyncStoryToLinear(supabase: Supabase, storyId: string) {
  const context = await loadStoryWithStoryMap(supabase, storyId);
  if (!context.ok) return null;

  const linearSyncEnabled = await isLinearSyncAvailableForStoryMap(supabase, {
    storyMapId: context.data.storyMapId,
  });
  if (!linearSyncEnabled) return null;

  return processStoryLinearSyncById(supabase, {
    storyId,
  });
}
