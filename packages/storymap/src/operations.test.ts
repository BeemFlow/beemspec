import { describe, expect, it } from 'vitest';

import { reorderItems } from './operations';

describe('reorderItems', () => {
  it('reorders within the same lane before a target item', () => {
    const result = reorderItems(['story-a', 'story-b', 'story-c'], 'story-c', 'story-a');

    expect(result).toEqual(['story-c', 'story-a', 'story-b']);
  });

  it('inserts a cross-lane item before the target item', () => {
    const result = reorderItems(['task-a', 'task-b'], 'task-x', 'task-b');

    expect(result).toEqual(['task-a', 'task-x', 'task-b']);
  });

  it('appends to the end when dropping into an end zone', () => {
    const result = reorderItems(['task-a', 'task-b'], 'task-x');

    expect(result).toEqual(['task-a', 'task-b', 'task-x']);
  });
});
