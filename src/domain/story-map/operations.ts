/**
 * Moves `movedId` to the position before `targetId` in the list.
 * If targetId is omitted or not found, appends to end.
 * Returns the new ordering as an array of IDs.
 */
export function reorderItems(ids: string[], movedId: string, targetId?: string): string[] {
  const next = ids.filter((id) => id !== movedId);
  if (!targetId) {
    next.push(movedId);
    return next;
  }

  const idx = next.indexOf(targetId);
  if (idx === -1) {
    next.push(movedId);
    return next;
  }

  next.splice(idx, 0, movedId);
  return next;
}
