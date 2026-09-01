import { describe, expect, it } from 'vitest';
import {
  batchMutateProcessFlowEdgesSchema,
  batchMutateProcessFlowNodesSchema,
  processFlowNodeDataSchema,
  updateProcessFlowEdgeToolSchema,
  updateProcessFlowNodeToolSchema,
  updateProcessFlowToolSchema,
} from './schemas';

const id = (value: number) => `00000000-0000-4000-8000-${value.toString().padStart(12, '0')}`;

describe('process flow model-facing schemas', () => {
  it.each([
    ['process flow', updateProcessFlowToolSchema, { process_flow_id: id(1) }],
    ['node', updateProcessFlowNodeToolSchema, { process_flow_id: id(1), node_id: id(2) }],
    ['edge', updateProcessFlowEdgeToolSchema, { process_flow_id: id(1), edge_id: id(2) }],
  ])('requires a real change when updating a %s', (_entity, schema, input) => {
    expect(schema.safeParse(input).success).toBe(false);
    expect(schema.description).toContain('at least one change is required');
  });

  it('accepts documented operational node data', () => {
    expect(
      processFlowNodeDataSchema.safeParse({
        label: 'Approve request',
        owner_role: 'Finance',
        systems: ['ERP'],
        inputs: ['Purchase request'],
        outputs: ['Approval'],
        frequency: 'Daily',
        estimated_duration: '15 minutes',
      }).success,
    ).toBe(true);
  });

  it.each([
    ['node', batchMutateProcessFlowNodesSchema],
    ['edge', batchMutateProcessFlowEdgesSchema],
  ])('limits %s mutation batches', (_entity, schema) => {
    const mutations = Array.from({ length: 101 }, (_, index) => ({ action: 'delete' as const, id: id(index + 1) }));

    expect(schema.safeParse({ process_flow_id: id(200), mutations }).success).toBe(false);
  });
});
