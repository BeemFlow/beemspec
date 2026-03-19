import { beforeEach, describe, expect, it, vi } from 'vitest';
import { requireAuth } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { batchMutateProcessFlowNodes, createProcessFlowNode } from '@/processflow/service';
import { POST as createNodeRoute, PUT as mutateNodesRoute } from './route';

vi.mock('@/lib/auth', () => ({ requireAuth: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }));
vi.mock('@/processflow/service', () => ({
  createProcessFlowNode: vi.fn(),
  batchMutateProcessFlowNodes: vi.fn(),
}));

const FLOW_ID = 'd7f34189-5d27-4dc0-b2c5-23d11796add4';

describe('process flow nodes route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
        body: JSON.stringify({ type: 'step', position: { x: 10, y: 20 }, data: { label: 'Receive invoice' } }),
      }),
      { params: Promise.resolve({ id: FLOW_ID }) },
    );

    expect(response.status).toBe(200);
    expect(createProcessFlowNode).toHaveBeenCalledWith(client, {
      process_flow_id: FLOW_ID,
      type: 'step',
      position: { x: 10, y: 20 },
      data: { label: 'Receive invoice' },
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
});
