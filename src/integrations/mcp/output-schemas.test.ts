import { describe, expect, it } from 'vitest';
import { buildProcessFlowFull } from '@/processflow/service';
import { processFlowNodeRowSchema, processFlowNodeSchema } from './process-flow-output-schemas';
import { storyRowSchema } from './story-output-schemas';

const id = 'd7f34189-5d27-4dc0-b2c5-23d11796add4';

describe('MCP output contracts', () => {
  it.each([
    { width: null, height: null },
    { width: 200, height: null },
  ])('describes raw and mapped node geometry for dimensions %j', (dimensions) => {
    const row = {
      id,
      process_flow_id: id,
      type: 'step' as const,
      position_x: 10,
      position_y: 20,
      ...dimensions,
      data: { label: 'Existing node', owner_role: '', notes: null, legacy_field: true },
    };
    const flow = buildProcessFlowFull(
      {
        id,
        team_id: id,
        name: 'Existing flow',
        description: null,
        context_markdown: null,
        viewport: null,
        schema_version: 1,
      },
      [row],
      [],
    );

    expect(processFlowNodeRowSchema.parse(row)).toEqual(row);
    expect(processFlowNodeSchema.parse(flow.nodes[0])).toEqual(flow.nodes[0]);
    expect(processFlowNodeSchema.safeParse(row).success).toBe(false);
    expect(processFlowNodeRowSchema.safeParse(flow.nodes[0]).success).toBe(false);
  });

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
