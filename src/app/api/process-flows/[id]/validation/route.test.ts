import { beforeEach, describe, expect, it, vi } from 'vitest';
import { requireAuth } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { validateProcessFlowById } from '@/processflow/service';
import { GET } from './route';

vi.mock('@/lib/auth', () => ({ requireAuth: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }));
vi.mock('@/processflow/service', () => ({ validateProcessFlowById: vi.fn() }));

const FLOW_ID = 'd7f34189-5d27-4dc0-b2c5-23d11796add4';

describe('process flow validation route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAuth).mockImplementation(
      async () => ({ success: true, user: { id: 'user-1' }, supabase: await createClient() }) as never,
    );
  });

  it('returns validation results for a persisted process flow', async () => {
    const client = {};
    vi.mocked(createClient).mockResolvedValue(client as never);
    vi.mocked(validateProcessFlowById).mockResolvedValue({
      data: { warnings: [{ code: 'duplicate_node_label' }] },
      error: null,
    } as never);

    const response = await GET(new Request('http://localhost/api/process-flows/id/validation'), {
      params: Promise.resolve({ id: FLOW_ID }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ warnings: [{ code: 'duplicate_node_label' }] });
    expect(validateProcessFlowById).toHaveBeenCalledWith(client, FLOW_ID);
  });

  it('returns the auth response when the request is unauthorized', async () => {
    vi.mocked(requireAuth).mockResolvedValue({
      success: false,
      response: new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 }),
    } as never);

    const response = await GET(new Request('http://localhost/api/process-flows/id/validation'), {
      params: Promise.resolve({ id: FLOW_ID }),
    });

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' });
    expect(validateProcessFlowById).not.toHaveBeenCalled();
  });

  it('rejects invalid route ids before validating the process flow', async () => {
    const response = await GET(new Request('http://localhost/api/process-flows/id/validation'), {
      params: Promise.resolve({ id: 'bad-id' }),
    });

    expect(response.status).toBe(400);
    expect(validateProcessFlowById).not.toHaveBeenCalled();
  });

  it('returns 404 when the process flow cannot be found', async () => {
    const client = {};
    vi.mocked(createClient).mockResolvedValue(client as never);
    vi.mocked(validateProcessFlowById).mockResolvedValue({ data: null, error: { code: 'PGRST116' } } as never);

    const response = await GET(new Request('http://localhost/api/process-flows/id/validation'), {
      params: Promise.resolve({ id: FLOW_ID }),
    });

    expect(response.status).toBe(404);
  });

  it('returns 500 when validation fails unexpectedly', async () => {
    const client = {};
    vi.mocked(createClient).mockResolvedValue(client as never);
    vi.mocked(validateProcessFlowById).mockResolvedValue({ data: null, error: { message: 'rpc failed' } } as never);

    const response = await GET(new Request('http://localhost/api/process-flows/id/validation'), {
      params: Promise.resolve({ id: FLOW_ID }),
    });

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: 'Failed to validate process flow' });
  });
});
