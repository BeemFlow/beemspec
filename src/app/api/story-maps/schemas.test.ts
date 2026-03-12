import {
  createStorySchema,
  updateActivitySchema,
  updatePersonaSchema,
  updateReleaseSchema,
  updateStorySchema,
  updateTaskSchema,
} from '@beemspec/storymap';
import { describe, expect, it } from 'vitest';

describe('story-map schemas', () => {
  it('defaults create story status to backlog', () => {
    const parsed = createStorySchema.parse({
      task_id: 'd7f34189-5d27-4dc0-b2c5-23d11796add4',
      title: 'Story title',
      content: {
        requirements: 'Reqs',
        acceptance_criteria: 'AC',
      },
    });

    expect(parsed.status).toBe('backlog');
  });

  it('rejects empty update payloads', () => {
    const parsed = updateStorySchema.safeParse({});

    expect(parsed.success).toBe(false);
  });

  it('rejects direct sort_order updates across generic update schemas', () => {
    expect(updateActivitySchema.safeParse({ sort_order: 1 }).success).toBe(false);
    expect(updateTaskSchema.safeParse({ sort_order: 1 }).success).toBe(false);
    expect(updateReleaseSchema.safeParse({ sort_order: 1 }).success).toBe(false);
    expect(updateStorySchema.safeParse({ sort_order: 1 }).success).toBe(false);
    expect(updatePersonaSchema.safeParse({ sort_order: 1 }).success).toBe(false);
  });

  it('rejects direct parent changes in generic task and story updates', () => {
    expect(updateTaskSchema.safeParse({ activity_id: 'd7f34189-5d27-4dc0-b2c5-23d11796add4' }).success).toBe(false);
    expect(updateStorySchema.safeParse({ task_id: 'd7f34189-5d27-4dc0-b2c5-23d11796add4' }).success).toBe(false);
    expect(updateStorySchema.safeParse({ release_id: null }).success).toBe(false);
  });
});
