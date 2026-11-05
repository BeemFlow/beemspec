import { describe, expect, it } from 'vitest';
import { createProcessFlowSchema, updateProcessFlowSchema, updateProcessFlowToolSchema } from './schemas';

const id = '00000000-0000-4000-8000-000000000001';

describe('process flow document schemas', () => {
  it('allows a new flow with or without source', () => {
    const base = { team_id: id, name: 'New flow' };
    expect(createProcessFlowSchema.safeParse(base).success).toBe(true);
    expect(createProcessFlowSchema.safeParse({ ...base, mermaid_source: 'flowchart LR' }).success).toBe(true);
  });

  it('requires a revision and changes and keeps canvas snapshots out of MCP', () => {
    const base = { process_flow_id: id, expected_revision: 1 };
    expect(updateProcessFlowToolSchema.safeParse(base).success).toBe(false);
    expect(updateProcessFlowToolSchema.safeParse({ process_flow_id: id, layout: 'auto' }).success).toBe(false);
    expect(updateProcessFlowToolSchema.safeParse({ ...base, layout: 'auto' }).success).toBe(true);
    expect(updateProcessFlowToolSchema.safeParse({ ...base, canvas: { nodes: [], edges: [] } }).success).toBe(false);
    expect(updateProcessFlowSchema.safeParse({ expected_revision: 1, canvas: { nodes: [], edges: [] } }).success).toBe(
      true,
    );
  });

  it('allows operational data patches and keeps labels in Mermaid', () => {
    const base = { process_flow_id: id, expected_revision: 1 };
    const data = { owner_role: 'Finance', frequency: 'Daily', estimated_duration: '15 minutes' };
    expect(
      updateProcessFlowToolSchema.safeParse({ ...base, diagram_metadata: { nodes: { approve: { data } } } }).success,
    ).toBe(true);
    expect(
      updateProcessFlowToolSchema.safeParse({
        ...base,
        diagram_metadata: { nodes: { approve: { data: { label: 'Wrong field' } } } },
      }).success,
    ).toBe(false);
  });
});

const canvas = {
  nodes: [{ id: 'A', process_flow_id: id, type: 'step', position: { x: 0, y: 0 }, data: { label: '' } }],
  edges: [{ id: 'e', process_flow_id: id, type: 'flow', source_node_id: 'A', target_node_id: 'B', data: {} }],
};

it.each([
  { owner_role: 42 },
  { notes: [] },
  { systems: 'ERP' },
  { inputs: [42] },
  { outputs: null },
  { pain_points: false },
  { automation_opportunity: {} },
  { frequency: 1 },
  { estimated_duration: [] },
  { time_constraint: true },
])('rejects malformed known canvas node data: %j', (data) => {
  expect(
    updateProcessFlowSchema.safeParse({
      expected_revision: 1,
      canvas: { ...canvas, nodes: [{ ...canvas.nodes[0], data: { label: 'A', ...data } }] },
    }).success,
  ).toBe(false);
});

it('validates edge metadata and retains blank and unknown legacy canvas fields', () => {
  expect(
    updateProcessFlowSchema.safeParse({
      expected_revision: 1,
      canvas: { ...canvas, edges: [{ ...canvas.edges[0], data: { condition: 42 } }] },
    }).success,
  ).toBe(false);
  const legacy = {
    nodes: [{ ...canvas.nodes[0], data: { label: '', owner_role: '', systems: [''], legacy: { value: 42 } } }],
    edges: [{ ...canvas.edges[0], data: { label: '', condition: '', legacy: ['old value'] } }],
  };
  expect(updateProcessFlowSchema.parse({ expected_revision: 1, canvas: legacy }).canvas).toEqual(legacy);
});
