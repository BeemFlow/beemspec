import { describe, expect, it } from 'vitest';
import { storyRowSchema } from './story-output-schemas';

const id = 'd7f34189-5d27-4dc0-b2c5-23d11796add4';

describe('MCP output contracts', () => {
  it('accepts legacy sparse story content without applying current input restrictions', () => {
    const story = {
      id,
      task_id: id,
      release_id: null,
      title: 'Existing story',
      status: 'backlog',
      sort_order: 0,
      content: { edge_cases: '', figma_link: 'legacy reference', custom_field: true },
    };

    expect(storyRowSchema.parse(story)).toEqual(story);
  });
});
