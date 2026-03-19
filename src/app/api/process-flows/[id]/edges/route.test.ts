import { beforeEach, describe, expect, it, vi } from 'vitest';
import { requireAuth } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { batchMutateProcessFlowEdges, createProcessFlowEdge } from '@/processflow/service';
import { POST as createEdgeRoute, PUT as mutateEdgesRoute } from './route';

vi.mock('@/lib/auth', () => ({ requireAuth: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }));
vi.mock('@/processflow/service', () => ({
  createProcessFlowEdge: vi.fn(),
  batchMutateProcessFlowEdges: vi.fn(),
}));

const FLOW_ID = 'd7f34189-5d27-4dc0-b2c5-23d11796add4';

describe('process flow edges route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAuth).mockResolvedValue({ success: true, user: { id: 'user-1' } } as never);
  });

  it('injects process_flow_id from route when creating an edge', async () => {
    const client = {};
    vi.mocked(createClient).mockResolvedValue(client as never);
    vi.mocked(createProcessFlowEdge).mockResolvedValue({ data: { id: 'edge-1' }, error: null } as never);

    const response = await createEdgeRoute(
      new Request('http://localhost/api/process-flows/id/edges', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          type: 'flow',
          source_node_id: '34e8bb98-8f40-4331-8df2-8f83fd8c7af4',
          target_node_id: '87c65304-2faf-4ccf-bad5-3d0cd632bffd',
          data: { label: 'Yes' },
        }),
      }),
      { params: Promise.resolve({ id: FLOW_ID }) },
    );

    expect(response.status).toBe(200);
    expect(createProcessFlowEdge).toHaveBeenCalledWith(client, {
      process_flow_id: FLOW_ID,
      type: 'flow',
      source_node_id: '34e8bb98-8f40-4331-8df2-8f83fd8c7af4',
      target_node_id: '87c65304-2faf-4ccf-bad5-3d0cd632bffd',
      data: { label: 'Yes' },
    });
  });

  it('injects process_flow_id from route for batch edge mutations', async () => {
    const client = {};
    vi.mocked(createClient).mockResolvedValue(client as never);
    vi.mocked(batchMutateProcessFlowEdges).mockResolvedValue({
      data: { created: [], updated: [], deleted: [] },
      error: null,
    } as never);

    const response = await mutateEdgesRoute(
      new Request('http://localhost/api/process-flows/id/edges', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          mutations: [{ action: 'delete', id: '34e8bb98-8f40-4331-8df2-8f83fd8c7af4' }],
        }),
      }),
      { params: Promise.resolve({ id: FLOW_ID }) },
    );

    expect(response.status).toBe(200);
    expect(batchMutateProcessFlowEdges).toHaveBeenCalledWith(client, {
      process_flow_id: FLOW_ID,
      mutations: [{ action: 'delete', id: '34e8bb98-8f40-4331-8df2-8f83fd8c7af4' }],
    });
  });
});
