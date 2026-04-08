import { beforeEach, describe, expect, it, vi } from 'vitest';
import { requireAuth } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { createPersona } from '@/storymap/service';
import { POST } from './route';

vi.mock('@/lib/auth', () => ({ requireAuth: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }));
vi.mock('@/storymap/service', () => ({ createPersona: vi.fn() }));

describe('personas route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAuth).mockResolvedValue({ success: true, user: { id: 'user-1' } } as never);
  });

  it('creates a persona from validated input', async () => {
    const client = {};
    vi.mocked(createClient).mockResolvedValue(client as never);
    vi.mocked(createPersona).mockResolvedValue({ data: { id: 'persona-1', name: 'Manager' }, error: null } as never);

    const response = await POST(
      new Request('http://localhost/api/personas', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          story_map_id: 'd7f34189-5d27-4dc0-b2c5-23d11796add4',
          name: 'Manager',
          goals: 'Approve invoices quickly',
        }),
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ id: 'persona-1', name: 'Manager' });
    expect(createPersona).toHaveBeenCalledWith(client, {
      story_map_id: 'd7f34189-5d27-4dc0-b2c5-23d11796add4',
      name: 'Manager',
      goals: 'Approve invoices quickly',
    });
  });

  it('rejects invalid persona input before touching the database', async () => {
    const response = await POST(
      new Request('http://localhost/api/personas', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ story_map_id: 'not-a-uuid', name: '' }),
      }),
    );

    expect(response.status).toBe(400);
    expect(createClient).not.toHaveBeenCalled();
    expect(createPersona).not.toHaveBeenCalled();
  });

  it('returns the auth response when persona creation is unauthorized', async () => {
    vi.mocked(requireAuth).mockResolvedValue({
      success: false,
      response: new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 }),
    } as never);

    const response = await POST(new Request('http://localhost/api/personas', { method: 'POST' }));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' });
    expect(createClient).not.toHaveBeenCalled();
    expect(createPersona).not.toHaveBeenCalled();
  });

  it('returns 500 when persona creation fails unexpectedly', async () => {
    const client = {};
    vi.mocked(createClient).mockResolvedValue(client as never);
    vi.mocked(createPersona).mockResolvedValue({ data: null, error: { message: 'insert failed' } } as never);

    const response = await POST(
      new Request('http://localhost/api/personas', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          story_map_id: 'd7f34189-5d27-4dc0-b2c5-23d11796add4',
          name: 'Manager',
          goals: 'Approve invoices quickly',
        }),
      }),
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: 'Failed to create persona' });
  });
});
