import {
  batchProcessFlowEdgesBodySchema,
  batchProcessFlowNodesBodySchema,
  createProcessFlowSchema,
  updateProcessFlowEdgeSchema,
  updateProcessFlowNodeSchema,
  updateProcessFlowSchema,
} from '@beemspec/processflow';
import { describe, expect, it } from 'vitest';

describe('process-flow schemas', () => {
  it('accepts minimal process flow creation payload', () => {
    expect(
      createProcessFlowSchema.safeParse({
        team_id: 'd7f34189-5d27-4dc0-b2c5-23d11796add4',
        name: 'Accounts Payable',
      }).success,
    ).toBe(true);
  });

  it('rejects empty update payloads', () => {
    expect(updateProcessFlowSchema.safeParse({}).success).toBe(false);
    expect(updateProcessFlowNodeSchema.safeParse({}).success).toBe(false);
    expect(updateProcessFlowEdgeSchema.safeParse({}).success).toBe(false);
  });

  it('accepts batch node mutations with operational metadata fields', () => {
    expect(
      batchProcessFlowNodesBodySchema.safeParse({
        mutations: [
          {
            action: 'create',
            payload: {
              type: 'step',
              position: { x: 0, y: 0 },
              data: {
                label: 'Receive invoice',
                frequency: '~200/day',
                estimated_duration: '5-10 min',
                time_constraint: 'same-day turnaround',
              },
            },
          },
          {
            action: 'update',
            id: 'd7f34189-5d27-4dc0-b2c5-23d11796add4',
            payload: {
              data: { label: 'Review invoice' },
            },
          },
        ],
      }).success,
    ).toBe(true);
  });

  it('accepts batch edge mutations with branch condition fields', () => {
    expect(
      batchProcessFlowEdgesBodySchema.safeParse({
        mutations: [
          {
            action: 'update',
            id: 'd7f34189-5d27-4dc0-b2c5-23d11796add4',
            payload: {
              data: {
                label: 'High value',
                condition: 'amount > $10,000',
              },
            },
          },
        ],
      }).success,
    ).toBe(true);
  });

  it('accepts direct node and edge updates for the new metadata fields', () => {
    expect(
      updateProcessFlowNodeSchema.safeParse({
        data: {
          label: 'Review invoice',
          frequency: '~200/day',
          estimated_duration: '5-10 min',
          time_constraint: 'must complete within 48h',
        },
      }).success,
    ).toBe(true);

    expect(
      updateProcessFlowEdgeSchema.safeParse({
        data: {
          label: 'High value',
          condition: 'amount > $10,000 AND vendor not on approved list',
        },
      }).success,
    ).toBe(true);
  });
});
