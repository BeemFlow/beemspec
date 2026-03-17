import { describe, expect, it } from 'vitest';
import type { Story, StoryMapFull } from '@/types';
import { buildCreateStoryMapPayload, planStoryEditSave } from './payloads';

const baseStory: Story = {
  id: 'story-1',
  task_id: 'task-1',
  release_id: 'release-a',
  sort_order: 0,
  status: 'backlog',
  title: 'Story',
  content: {
    _version: 1,
    user_story: 'As a user',
    acceptance_criteria: 'It works',
  },
};

const storyMap: StoryMapFull = {
  id: 'map-1',
  name: 'Map',
  description: null,
  activities: [
    {
      id: 'activity-1',
      story_map_id: 'map-1',
      name: 'Activity',
      description: null,
      sort_order: 0,
      tasks: [
        {
          id: 'task-1',
          activity_id: 'activity-1',
          name: 'Task',
          description: null,
          sort_order: 0,
          stories: [
            baseStory,
            { ...baseStory, id: 'story-2', release_id: 'release-b', sort_order: 1, title: 'Story 2' },
            { ...baseStory, id: 'story-3', release_id: 'release-b', sort_order: 2, title: 'Story 3' },
          ],
        },
      ],
    },
  ],
  releases: [
    { id: 'release-a', story_map_id: 'map-1', name: 'Release A', description: null, sort_order: 0 },
    { id: 'release-b', story_map_id: 'map-1', name: 'Release B', description: null, sort_order: 1 },
  ],
};

describe('story-map payload helpers', () => {
  it('omits empty story map descriptions', () => {
    expect(buildCreateStoryMapPayload('team-1', '  My Map  ', '   ')).toEqual({
      team_id: 'team-1',
      name: 'My Map',
    });
  });

  it('rejects empty story map names', () => {
    expect(() => buildCreateStoryMapPayload('team-1', '   ', 'Desc')).toThrow('Story map name is required');
  });

  it('plans story edits without sending release_id to the generic update route', () => {
    const plan = planStoryEditSave(storyMap, baseStory, {
      title: 'Edited story',
      release_id: 'release-b',
    });

    expect(plan.updates).toEqual({ title: 'Edited story' });
    expect(plan.move).toEqual({
      target_task_id: 'task-1',
      target_release_id: 'release-b',
      target_order: ['story-2', 'story-3', 'story-1'],
    });
  });

  it('plans moves to backlog with a null release id', () => {
    const plan = planStoryEditSave(storyMap, baseStory, {
      release_id: null,
    });

    expect(plan.updates).toEqual({});
    expect(plan.move).toEqual({
      target_task_id: 'task-1',
      target_release_id: null,
      target_order: ['story-1'],
    });
  });

  it('skips move planning when the release is unchanged', () => {
    const plan = planStoryEditSave(storyMap, baseStory, {
      title: 'Edited story',
      release_id: 'release-a',
    });

    expect(plan.updates).toEqual({ title: 'Edited story' });
    expect(plan.move).toBeNull();
  });

  it('throws when the local task data needed for reordering is missing', () => {
    const staleStoryMap: StoryMapFull = {
      ...storyMap,
      activities: [],
    };

    expect(() => planStoryEditSave(staleStoryMap, baseStory, { release_id: 'release-b' })).toThrow(
      'Task task-1 not found while planning story move',
    );
  });
});
