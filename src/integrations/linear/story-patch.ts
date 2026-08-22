import { emptyContent, type StoryContent } from '@/domain/story-map';
import type { LinearStoryPatch } from './adapter';

export function hasMutableStoryFields(patch: LinearStoryPatch): boolean {
  return Boolean(patch.title || patch.content || patch.status);
}

export function buildDbUpdateFromPatch(
  patch: LinearStoryPatch,
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
