import { beforeEach, describe, expect, it, vi } from 'vitest';
import { requireAuth } from '@/lib/auth';
import { batchMutateE2EProcessFlowNodes } from '@/lib/e2e/test-store';
import { env } from '@/lib/env';
import { createClient } from '@/lib/supabase/server';
import { batchMutateProcessFlowNodes, createProcessFlowNode } from '@/processflow/service';
import { POST as createNodeRoute, PUT as mutateNodesRoute } from './route';

vi.mock('@/lib/auth', () => ({ requireAuth: vi.fn() }));
vi.mock('@/lib/e2e/test-store', () => ({ batchMutateE2EProcessFlowNodes: vi.fn(), createE2EProcessFlowNode: vi.fn() }));
vi.mock('@/lib/env', () => ({ env: { e2eTestMode: vi.fn(() => false) } }));
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }));
vi.mock('@/processflow/service', () => ({
  createProcessFlowNode: vi.fn(),
  batchMutateProcessFlowNodes: vi.fn(),
}));

const FLOW_ID = 'd7f34189-5d27-4dc0-b2c5-23d11796add4';

describe('process flow nodes route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(env.e2eTestMode).mockReturnValue(false);
    vi.mocked(requireAuth).mockResolvedValue({ success: true, user: { id: 'user-1' } } as never);
  });

  it('injects process_flow_id from route when creating a node', async () => {
    const client = {};
    vi.mocked(createClient).mockResolvedValue(client as never);
    vi.mocked(createProcessFlowNode).mockResolvedValue({ data: { id: 'node-1' }, error: null } as never);

    const response = await createNodeRoute(
      new Request('http://localhost/api/process-flows/id/nodes', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          type: 'step',
          position: { x: 10, y: 20 },
          data: {
            label: 'Receive invoice',
            frequency: '~200/day',
            estimated_duration: '5-10 min',
            time_constraint: 'must complete within 48h',
          },
        }),
      }),
      { params: Promise.resolve({ id: FLOW_ID }) },
    );

    expect(response.status).toBe(200);
    expect(createProcessFlowNode).toHaveBeenCalledWith(client, {
      process_flow_id: FLOW_ID,
      type: 'step',
      position: { x: 10, y: 20 },
      data: {
        label: 'Receive invoice',
        frequency: '~200/day',
        estimated_duration: '5-10 min',
        time_constraint: 'must complete within 48h',
      },
    });
  });

  it('injects process_flow_id from route for batch node mutations', async () => {
    const client = {};
    vi.mocked(createClient).mockResolvedValue(client as never);
    vi.mocked(batchMutateProcessFlowNodes).mockResolvedValue({
      data: { created: [], updated: [], deleted: [] },
      error: null,
    } as never);

    const response = await mutateNodesRoute(
      new Request('http://localhost/api/process-flows/id/nodes', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          mutations: [{ action: 'delete', id: '34e8bb98-8f40-4331-8df2-8f83fd8c7af4' }],
        }),
      }),
      { params: Promise.resolve({ id: FLOW_ID }) },
    );

    expect(response.status).toBe(200);
    expect(batchMutateProcessFlowNodes).toHaveBeenCalledWith(client, {
      process_flow_id: FLOW_ID,
      mutations: [{ action: 'delete', id: '34e8bb98-8f40-4331-8df2-8f83fd8c7af4' }],
    });
  });

  it('uses the e2e mutation path for non-uuid node ids and forwards operational metadata', async () => {
    vi.mocked(env.e2eTestMode).mockReturnValue(true);
    vi.mocked(batchMutateE2EProcessFlowNodes).mockReturnValue({
      created: [],
      updated: [
        {
          id: 'node-1',
          process_flow_id: FLOW_ID,
          type: 'step',
          position: { x: 10, y: 20 },
          size: null,
          data: {
            label: 'Receive invoice',
            frequency: '~200/day',
            estimated_duration: '5-10 min',
            time_constraint: 'must complete within 48h',
          },
        },
      ],
      deleted: [],
    } as never);

    const response = await mutateNodesRoute(
      new Request('http://localhost/api/process-flows/id/nodes', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          mutations: [
            {
              action: 'update',
              id: 'node-1',
              payload: {
                data: {
                  label: 'Receive invoice',
                  frequency: '~200/day',
                  estimated_duration: '5-10 min',
                  time_constraint: 'must complete within 48h',
                },
              },
            },
          ],
        }),
      }),
      { params: Promise.resolve({ id: FLOW_ID }) },
    );

    expect(response.status).toBe(200);
    expect(batchMutateE2EProcessFlowNodes).toHaveBeenCalledWith(FLOW_ID, [
      {
        action: 'update',
        id: 'node-1',
        payload: {
          data: {
            label: 'Receive invoice',
            frequency: '~200/day',
            estimated_duration: '5-10 min',
            time_constraint: 'must complete within 48h',
          },
        },
      },
    ]);
    expect(batchMutateProcessFlowNodes).not.toHaveBeenCalled();
  });
});
