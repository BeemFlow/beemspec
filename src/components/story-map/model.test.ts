import { describe, expect, it } from 'vitest';
import type { StoryMapFull } from '@/types';
import { buildStoryMapIndex, encodeDragId, moveStoryInStoryMap, parseDragId } from './model';

const storyMap: StoryMapFull = {
  id: 'map-1',
  name: 'Map',
  releases: [{ id: 'release-1', story_map_id: 'map-1', name: 'Release', sort_order: 0 }],
  activities: [
    {
      id: 'activity-1',
      story_map_id: 'map-1',
      name: 'Activity',
      sort_order: 0,
      tasks: [
        {
          id: 'task-1',
          activity_id: 'activity-1',
          name: 'First',
          sort_order: 0,
          stories: [
            {
              id: 'story-1',
              task_id: 'task-1',
              release_id: null,
              sort_order: 0,
              status: 'backlog',
              title: 'Story',
              content: { _version: 1, user_story: '', acceptance_criteria: '' },
            },
          ],
        },
        {
          id: 'task-2',
          activity_id: 'activity-1',
          name: 'Second',
          sort_order: 1,
          stories: [],
        },
      ],
    },
  ],
};

describe('story map model', () => {
  it('round-trips typed drag identifiers', () => {
    const dragId = { type: 'story-end', taskId: 'task-1', releaseId: null } as const;
    expect(parseDragId(encodeDragId(dragId))).toEqual(dragId);
  });

  it('indexes story cells once while preserving ordered lookups', () => {
    const index = buildStoryMapIndex(storyMap);
    expect(index.getTasksForActivity('activity-1').map((task) => task.id)).toEqual(['task-1', 'task-2']);
    expect(index.getStoriesForCell('task-1', null).map((story) => story.id)).toEqual(['story-1']);
    expect(index.getStoriesForCell('task-1', 'release-1')).toEqual([]);
  });

  it('normalizes both source and target cells for optimistic story moves', () => {
    const moved = moveStoryInStoryMap(storyMap, 'story-1', 'task-2', 'release-1', ['story-1']);
    expect(moved.activities[0].tasks[0].stories).toEqual([]);
    expect(moved.activities[0].tasks[1].stories[0]).toMatchObject({
      id: 'story-1',
      task_id: 'task-2',
      release_id: 'release-1',
      sort_order: 0,
    });
  });
});
