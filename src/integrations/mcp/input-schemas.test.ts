import { describe, expect, it } from 'vitest';
import * as flow from '@/domain/process-flow/schemas';
import * as mcp from './input-schemas';

const id = (value: number) => `00000000-0000-4000-8000-${String(value).padStart(12, '0')}`;

describe('MCP mutation batch limits', () => {
  it.each([
    ['node', flow.batchMutateProcessFlowNodesSchema, mcp.batchMutateProcessFlowNodesSchema],
    ['edge', flow.batchMutateProcessFlowEdgesSchema, mcp.batchMutateProcessFlowEdgesSchema],
  ] as const)(
    'reuses the shared %s mutations while limiting database work to 100 operations',
    (_entity, domain, schema) => {
      expect(schema.shape.process_flow_id).toBe(domain.shape.process_flow_id);
      expect(schema.shape.mutations.element).toBe(domain.shape.mutations.element);
      expect(schema.shape.mutations.description).toBe(domain.shape.mutations.description);
      const mutations = Array.from({ length: 101 }, (_, i) => ({ action: 'delete', id: id(i) }));
      const input = { process_flow_id: id(200), mutations };
      expect(domain.safeParse(input).success).toBe(true);
      expect(schema.safeParse(input).success).toBe(false);
      expect(schema.safeParse({ ...input, mutations: mutations.slice(0, 100) }).success).toBe(true);
      expect(schema.safeParse({ ...input, mutations: [] }).success).toBe(false);
    },
  );

  it.each([
    [
      'node',
      mcp.batchMutateProcessFlowNodesSchema,
      { data: { label: 'Step', notes: 'x'.repeat(20_001), systems: Array(201).fill('x'.repeat(2_001)) } },
      { type: 'step', position: { x: 0, y: 0 } },
    ],
    [
      'edge',
      mcp.batchMutateProcessFlowEdgesSchema,
      { data: { condition: 'x'.repeat(20_001) } },
      { type: 'flow', source_node_id: id(2), target_node_id: id(3) },
    ],
  ] as const)(
    'accepts existing large %s data without relaxing domain validation',
    (_entity, schema, changes, creation) => {
      for (const mutation of [
        { action: 'create', payload: { ...creation, ...changes } },
        { action: 'update', id: id(2), payload: changes },
      ]) {
        expect(schema.safeParse({ process_flow_id: id(1), mutations: [mutation] }).success).toBe(true);
      }
      for (const payload of [{}, { unknown: true }]) {
        expect(
          schema.safeParse({
            process_flow_id: id(1),
            mutations: [{ action: 'update', id: id(2), payload }],
          }).success,
        ).toBe(false);
      }
      expect(schema.shape.mutations.element.options[1].shape.payload.description).toContain(
        'at least one change is required',
      );
    },
  );
});
