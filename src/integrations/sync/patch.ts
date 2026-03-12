import { emptyContent, type StoryContent } from '@beemspec/storymap';
import type { StoryPatchFromRemote } from './types';

/**
 * Returns true if the patch contains at least one field that would
 * mutate the story (title, content, or status). The `updated_at`
 * timestamp alone does not count as a mutable change.
 */
export function hasMutableStoryFields(patch: StoryPatchFromRemote): boolean {
  return Boolean(patch.title || patch.content || patch.status);
}

/**
 * Build a flat DB update object from a remote patch.
 *
 * Scalar fields (title, status, updated_at) are set directly.
 * Content fields are shallow-merged into `currentContent` so that
 * only the changed fields are overwritten.
 *
 * This is the single place that converts a `StoryPatchFromRemote` into
 * a shape suitable for `supabase.from('stories').update(...)`.
 */
export function buildDbUpdateFromPatch(
  patch: StoryPatchFromRemote,
  currentContent: StoryContent | null,
): Record<string, unknown> {
  const dbUpdate: Record<string, unknown> = { updated_at: patch.updated_at };

  if (patch.title) dbUpdate.title = patch.title;
  if (patch.status) dbUpdate.status = patch.status;

  if (patch.content) {
    const base = (currentContent as Record<string, unknown> | null) ?? emptyContent();
    dbUpdate.content = { ...base, ...patch.content };
  }

  return dbUpdate;
}
