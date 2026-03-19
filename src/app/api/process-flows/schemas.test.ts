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

  it('accepts explicit node and edge batch mutations', () => {
    expect(
      batchProcessFlowNodesBodySchema.safeParse({
        mutations: [
          {
            action: 'create',
            payload: {
              type: 'step',
              position: { x: 0, y: 0 },
              data: { label: 'Receive invoice' },
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

    expect(
      batchProcessFlowEdgesBodySchema.safeParse({
        mutations: [
          {
            action: 'delete',
            id: 'd7f34189-5d27-4dc0-b2c5-23d11796add4',
          },
        ],
      }).success,
    ).toBe(true);
  });
});
