/**
 * Creates a new order array by moving one item into a target position.
 * If targetId is omitted or missing, the moved item is placed at the end.
 */
export function moveIdInOrder(ids: string[], movedId: string, targetId?: string): string[] {
  const next = ids.filter((id) => id !== movedId);

  if (!targetId) {
    next.push(movedId);
    return next;
  }

  const targetIndex = next.indexOf(targetId);
  if (targetIndex === -1) {
    next.push(movedId);
    return next;
  }

  next.splice(targetIndex, 0, movedId);
  return next;
}
