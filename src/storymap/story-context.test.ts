import { describe, expect, it, vi } from 'vitest';
import { loadStoryWithStoryMap } from './story-context';

function createSingleQuery<T>(result: { data: T | null; error: unknown }) {
  const single = vi.fn().mockResolvedValue(result);
  const eq = vi.fn().mockReturnValue({ single });
  const select = vi.fn().mockReturnValue({ eq });
  return { select, eq, single };
}

describe('story-context', () => {
  it('loads the story and owning story map id', async () => {
    const storyQuery = createSingleQuery({
      data: { id: 'story-1', task_id: 'task-1', title: 'Approve invoice' },
      error: null,
    });
    const taskQuery = createSingleQuery({
      data: { activity_id: 'activity-1' },
      error: null,
    });
    const activityQuery = createSingleQuery({
      data: { story_map_id: 'map-1' },
      error: null,
    });
    const from = vi.fn((table: string) => {
      if (table === 'stories') return { select: storyQuery.select };
      if (table === 'tasks') return { select: taskQuery.select };
      if (table === 'activities') return { select: activityQuery.select };
      throw new Error(`Unexpected table: ${table}`);
    });

    const result = await loadStoryWithStoryMap({ from } as never, 'story-1');

    expect(result).toEqual({
      ok: true,
      data: {
        story: { id: 'story-1', task_id: 'task-1', title: 'Approve invoice' },
        storyMapId: 'map-1',
      },
    });
    expect(taskQuery.eq).toHaveBeenCalledWith('id', 'task-1');
    expect(activityQuery.eq).toHaveBeenCalledWith('id', 'activity-1');
  });

  it('returns story_not_found when the story lookup fails', async () => {
    const storyError = new Error('missing story');
    const storyQuery = createSingleQuery({ data: null, error: storyError });
    const from = vi.fn((table: string) => {
      if (table === 'stories') return { select: storyQuery.select };
      throw new Error(`Unexpected table: ${table}`);
    });

    const result = await loadStoryWithStoryMap({ from } as never, 'story-404');

    expect(result).toEqual({ ok: false, reason: 'story_not_found', error: storyError });
  });

  it('returns story_task_not_found when the story task is missing', async () => {
    const storyQuery = createSingleQuery({
      data: { id: 'story-1', task_id: 'task-404', title: 'Approve invoice' },
      error: null,
    });
    const taskError = new Error('missing task');
    const taskQuery = createSingleQuery({ data: null, error: taskError });
    const from = vi.fn((table: string) => {
      if (table === 'stories') return { select: storyQuery.select };
      if (table === 'tasks') return { select: taskQuery.select };
      throw new Error(`Unexpected table: ${table}`);
    });

    const result = await loadStoryWithStoryMap({ from } as never, 'story-1');

    expect(result).toEqual({ ok: false, reason: 'story_task_not_found', error: taskError });
  });

  it('returns story_activity_not_found when the owning activity is missing', async () => {
    const storyQuery = createSingleQuery({
      data: { id: 'story-1', task_id: 'task-1', title: 'Approve invoice' },
      error: null,
    });
    const taskQuery = createSingleQuery({
      data: { activity_id: 'activity-404' },
      error: null,
    });
    const activityError = new Error('missing activity');
    const activityQuery = createSingleQuery({ data: null, error: activityError });
    const from = vi.fn((table: string) => {
      if (table === 'stories') return { select: storyQuery.select };
      if (table === 'tasks') return { select: taskQuery.select };
      if (table === 'activities') return { select: activityQuery.select };
      throw new Error(`Unexpected table: ${table}`);
    });

    const result = await loadStoryWithStoryMap({ from } as never, 'story-1');

    expect(result).toEqual({ ok: false, reason: 'story_activity_not_found', error: activityError });
  });
});
