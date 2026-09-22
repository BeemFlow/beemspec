import { describe, expect, it } from 'vitest';
import * as flow from '@/domain/process-flow/schemas';
import * as story from '@/domain/story-map/schemas';
import * as mcp from './input-schemas';

const id = (value: number) => `00000000-0000-4000-8000-${String(value).padStart(12, '0')}`;

describe('MCP-only input budgets', () => {
  it.each([
    [
      'story map',
      story.createStoryMapSchema,
      mcp.createStoryMapSchema,
      { team_id: id(1), name: 'Map' },
      ['description', 'context_markdown'],
    ],
    [
      'release',
      story.createReleaseSchema,
      mcp.createReleaseSchema,
      { story_map_id: id(1), name: 'Release' },
      ['description', 'context_markdown'],
    ],
    [
      'activity',
      story.createActivitySchema,
      mcp.createActivitySchema,
      { story_map_id: id(1), name: 'Activity' },
      ['description'],
    ],
    ['task', story.createTaskSchema, mcp.createTaskSchema, { activity_id: id(1), name: 'Task' }, ['description']],
    [
      'persona',
      story.createPersonaSchema,
      mcp.createPersonaSchema,
      { story_map_id: id(1), name: 'Persona' },
      ['description', 'goals'],
    ],
    [
      'process flow',
      flow.createProcessFlowSchema,
      mcp.createProcessFlowSchema,
      { team_id: id(1), name: 'Flow' },
      ['description', 'context_markdown'],
    ],
  ] as const)('bounds %s text only at the MCP boundary', (_entity, restSchema, mcpSchema, required, fields) => {
    for (const field of fields) {
      const max = field === 'context_markdown' ? 100_000 : 20_000;
      const oversized = { ...required, [field]: 'x'.repeat(max + 1) };
      expect(restSchema.safeParse(oversized).success).toBe(true);
      expect(mcpSchema.safeParse(oversized).success).toBe(false);
      expect(mcpSchema.safeParse({ ...required, [field]: 'x'.repeat(max) }).success).toBe(true);
      expect(mcpSchema.safeParse({ ...required, [field]: null }).success).toBe(true);
    }
    expect(mcpSchema.safeParse(required).success).toBe(true);
  });

  it.each([
    ['user_story', 100_000],
    ['acceptance_criteria', 100_000],
    ['edge_cases', 20_000],
    ['technical_guidelines', 20_000],
  ])('allows a REST title edit to retain oversized %s', (field, max) => {
    const input = {
      title: 'Renamed',
      content: { user_story: 'Story', acceptance_criteria: 'AC', [field]: 'x'.repeat(Number(max) + 1) },
    };
    expect(story.updateStorySchema.safeParse(input).success).toBe(true);
    expect(mcp.updateStoryToolSchema.safeParse({ ...input, story_id: id(1) }).success).toBe(false);
    expect(mcp.updateStoryToolSchema.safeParse({ story_id: id(1), title: input.title }).success).toBe(true);
  });

  it('preserves URL validation while making the URL size budget MCP-only', () => {
    const content = {
      user_story: 'Story',
      acceptance_criteria: 'AC',
      figma_link: `https://figma.com/${'a'.repeat(2_048)}`,
    };
    expect(story.updateStorySchema.safeParse({ content }).success).toBe(true);
    expect(mcp.updateStoryToolSchema.safeParse({ story_id: id(1), content }).success).toBe(false);
    for (const figma_link of [null, undefined, 'https://figma.com/file/example']) {
      expect(
        mcp.updateStoryToolSchema.safeParse({ story_id: id(1), content: { ...content, figma_link } }).success,
      ).toBe(true);
    }
    expect(
      mcp.updateStoryToolSchema.safeParse({ story_id: id(1), content: { ...content, figma_link: 'not a URL' } })
        .success,
    ).toBe(false);
  });

  it.each(['systems', 'inputs', 'outputs'])('keeps existing %s collections compatible with REST', (field) => {
    for (const entries of [Array.from({ length: 201 }, () => 'System'), ['x'.repeat(2_001)]]) {
      const data = { label: 'Step', [field]: entries };
      expect(flow.updateProcessFlowNodeSchema.safeParse({ data }).success).toBe(true);
      expect(
        mcp.updateProcessFlowNodeToolSchema.safeParse({ process_flow_id: id(1), node_id: id(2), data }).success,
      ).toBe(false);
      expect(
        mcp.batchMutateProcessFlowNodesSchema.safeParse({
          process_flow_id: id(1),
          mutations: [{ action: 'update', id: id(2), payload: { data } }],
        }).success,
      ).toBe(false);
    }
  });

  it.each([
    ['node', flow.batchProcessFlowNodesBodySchema, mcp.batchMutateProcessFlowNodesSchema],
    ['edge', flow.batchProcessFlowEdgesBodySchema, mcp.batchMutateProcessFlowEdgesSchema],
  ] as const)('preserves large REST %s batches while enforcing the MCP limit', (_entity, restSchema, mcpSchema) => {
    const mutations = Array.from({ length: 101 }, (_, i) => ({ action: 'delete', id: id(i) }));
    expect(restSchema.safeParse({ mutations }).success).toBe(true);
    expect(mcpSchema.safeParse({ process_flow_id: id(200), mutations }).success).toBe(false);
    expect(mcpSchema.safeParse({ process_flow_id: id(200), mutations: mutations.slice(0, 100) }).success).toBe(true);
    expect(mcpSchema.safeParse({ process_flow_id: id(200), mutations: [] }).success).toBe(false);
  });

  it.each([
    [
      'node',
      mcp.batchMutateProcessFlowNodesSchema,
      { data: { label: 'Step', notes: 'x'.repeat(20_001) } },
      { type: 'step', position: { x: 0, y: 0 } },
    ],
    [
      'edge',
      mcp.batchMutateProcessFlowEdgesSchema,
      { data: { condition: 'x'.repeat(20_001) } },
      { type: 'flow', source_node_id: id(2), target_node_id: id(3) },
    ],
  ] as const)('bounds nested %s batch data on create and update', (_entity, schema, changes, creation) => {
    for (const mutation of [
      { action: 'create', payload: { ...creation, ...changes } },
      { action: 'update', id: id(2), payload: changes },
      { action: 'update', id: id(2), payload: {} },
    ]) {
      expect(schema.safeParse({ process_flow_id: id(1), mutations: [mutation] }).success).toBe(false);
    }
  });

  it.each([
    ['activity', story.reorderActivitiesSchema, mcp.reorderActivitiesSchema, { story_map_id: id(1) }, 'order'],
    ['task', story.reorderTasksSchema, mcp.reorderTasksSchema, { activity_id: id(1) }, 'order'],
    ['release', story.reorderReleasesSchema, mcp.reorderReleasesSchema, { story_map_id: id(1) }, 'order'],
    ['story', story.reorderStoriesSchema, mcp.reorderStoriesSchema, { task_id: id(1), release_id: null }, 'order'],
    ['task move', story.moveTaskSchema, mcp.moveTaskSchema, { target_activity_id: id(1) }, 'target_order'],
    [
      'story move',
      story.moveStorySchema,
      mcp.moveStorySchema,
      { target_task_id: id(1), target_release_id: null },
      'target_order',
    ],
  ] as const)(
    'keeps complete REST %s ordering independent of the MCP limit',
    (_entity, restSchema, mcpSchema, target, field) => {
      const order = Array.from({ length: 1_001 }, (_, i) => id(i));
      expect(restSchema.safeParse({ ...target, [field]: order }).success).toBe(true);
      expect(mcpSchema.safeParse({ ...target, [field]: order }).success).toBe(false);
      expect(mcpSchema.safeParse({ ...target, [field]: order.slice(0, 1_000) }).success).toBe(true);
      expect(mcpSchema.safeParse({ ...target, [field]: [id(1), id(1)] }).success).toBe(false);
    },
  );

  it.each([
    [mcp.updateStoryMapToolSchema, { story_map_id: id(1) }],
    [mcp.updateActivityToolSchema, { activity_id: id(1) }],
    [mcp.updateTaskToolSchema, { task_id: id(1) }],
    [mcp.updateReleaseToolSchema, { release_id: id(1) }],
    [mcp.updatePersonaToolSchema, { persona_id: id(1) }],
    [mcp.updateStoryToolSchema, { story_id: id(1) }],
    [mcp.updateProcessFlowToolSchema, { process_flow_id: id(1) }],
    [mcp.updateProcessFlowNodeToolSchema, { process_flow_id: id(1), node_id: id(2) }],
    [mcp.updateProcessFlowEdgeToolSchema, { process_flow_id: id(1), edge_id: id(2) }],
  ] as const)('preserves no-op refinements and update guidance %#', (schema, input) => {
    expect(schema.safeParse(input).success).toBe(false);
    expect(schema.description).toContain('at least one change is required');
  });
});
