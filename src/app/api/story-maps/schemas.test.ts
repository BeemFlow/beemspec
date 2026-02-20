import { describe, expect, it } from 'vitest';

import { createStorySchema, updateStorySchema } from './schemas';

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
});
