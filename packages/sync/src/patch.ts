import { emptyContent, type StoryContent } from '@beemspec/storymap';
import type { StoryPatchFromRemote } from './types';

export function hasMutableStoryFields(patch: StoryPatchFromRemote): boolean {
  return Boolean(patch.title || patch.content || patch.status);
}

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
