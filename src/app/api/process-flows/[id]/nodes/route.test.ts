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
    vi.mocked(createProcessFlowNode).mockResolvedValue({
      data: { id: 'node-1', process_flow_id: FLOW_ID },
      error: null,
    } as never);

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
    await expect(response.json()).resolves.toEqual({ id: 'node-1', process_flow_id: FLOW_ID });
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
    await expect(response.json()).resolves.toEqual({ created: [], updated: [], deleted: [] });
    expect(batchMutateProcessFlowNodes).toHaveBeenCalledWith(client, {
      process_flow_id: FLOW_ID,
      mutations: [{ action: 'delete', id: '34e8bb98-8f40-4331-8df2-8f83fd8c7af4' }],
    });
  });

  it('rejects invalid route ids before calling the service', async () => {
    const response = await createNodeRoute(
      new Request('http://localhost/api/process-flows/id/nodes', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ type: 'step', position: { x: 10, y: 20 }, data: { label: 'Receive invoice' } }),
      }),
      { params: Promise.resolve({ id: 'bad-id' }) },
    );

    expect(response.status).toBe(400);
    expect(createClient).not.toHaveBeenCalled();
    expect(createProcessFlowNode).not.toHaveBeenCalled();
  });

  it('translates create service errors into server responses', async () => {
    const client = {};
    vi.mocked(createClient).mockResolvedValue(client as never);
    vi.mocked(createProcessFlowNode).mockResolvedValue({ data: null, error: { message: 'insert failed' } } as never);

    const response = await createNodeRoute(
      new Request('http://localhost/api/process-flows/id/nodes', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ type: 'step', position: { x: 10, y: 20 }, data: { label: 'Receive invoice' } }),
      }),
      { params: Promise.resolve({ id: FLOW_ID }) },
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: 'Failed to create process flow node' });
  });

  it('translates batch mutation service errors into server responses', async () => {
    const client = {};
    vi.mocked(createClient).mockResolvedValue(client as never);
    vi.mocked(batchMutateProcessFlowNodes).mockResolvedValue({ data: null, error: { message: 'rpc failed' } } as never);

    const response = await mutateNodesRoute(
      new Request('http://localhost/api/process-flows/id/nodes', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ mutations: [{ action: 'delete', id: '34e8bb98-8f40-4331-8df2-8f83fd8c7af4' }] }),
      }),
      { params: Promise.resolve({ id: FLOW_ID }) },
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: 'Failed to mutate process flow nodes' });
  });
});
