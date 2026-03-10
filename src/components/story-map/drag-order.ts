import { reorderItems } from '@beemspec/storymap';

export function moveIdInOrder(ids: string[], movedId: string, targetId?: string): string[] {
  return reorderItems(ids, movedId, targetId);
}
