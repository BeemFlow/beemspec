import { describe, expect, it } from 'vitest';
import {
  moveStorySchema,
  moveTaskSchema,
  reorderActivitiesSchema,
  reorderReleasesSchema,
  reorderStoriesSchema,
  reorderTasksSchema,
  updateActivityToolSchema,
  updatePersonaToolSchema,
  updateReleaseToolSchema,
  updateStoryMapToolSchema,
  updateStoryToolSchema,
  updateTaskToolSchema,
} from './schemas';

const id = (value: number) => `00000000-0000-4000-8000-${value.toString().padStart(12, '0')}`;

describe('story map model-facing schemas', () => {
  it.each([
    ['story map', updateStoryMapToolSchema, { story_map_id: id(1) }],
    ['release', updateReleaseToolSchema, { release_id: id(1) }],
    ['activity', updateActivityToolSchema, { activity_id: id(1) }],
    ['task', updateTaskToolSchema, { task_id: id(1) }],
    ['story', updateStoryToolSchema, { story_id: id(1) }],
    ['persona', updatePersonaToolSchema, { persona_id: id(1) }],
  ])('requires a real change when updating a %s', (_entity, schema, input) => {
    expect(schema.safeParse(input).success).toBe(false);
    expect(schema.description).toContain('at least one change is required');
  });

  it.each([
    ['releases', reorderReleasesSchema, { story_map_id: id(1), order: [id(2), id(2)] }],
    ['activities', reorderActivitiesSchema, { story_map_id: id(1), order: [id(2), id(2)] }],
    ['tasks', reorderTasksSchema, { activity_id: id(1), order: [id(2), id(2)] }],
    ['stories', reorderStoriesSchema, { task_id: id(1), release_id: null, order: [id(2), id(2)] }],
    ['moved tasks', moveTaskSchema, { target_activity_id: id(1), target_order: [id(2), id(2)] }],
    [
      'moved stories',
      moveStorySchema,
      { target_task_id: id(1), target_release_id: null, target_order: [id(2), id(2)] },
    ],
  ])('rejects duplicate IDs when ordering %s', (_entity, schema, input) => {
    const result = schema.safeParse(input);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.message === 'Order must not contain duplicate IDs')).toBe(true);
    }
  });

  it('preserves a valid complete order', () => {
    expect(reorderReleasesSchema.safeParse({ story_map_id: id(1), order: [id(2), id(3)] }).success).toBe(true);
  });
});
