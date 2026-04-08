import { beforeEach, describe, expect, it, vi } from 'vitest';
import { requireAuth } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { DELETE, PUT } from './route';

vi.mock('@/lib/auth', () => ({ requireAuth: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }));

const TEAM_ID = 'd7f34189-5d27-4dc0-b2c5-23d11796add4';

describe('teams [id] route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAuth).mockResolvedValue({ success: true, user: { id: 'user-1' } } as never);
  });

  it('updates a team name and stamps updated_at', async () => {
    const single = vi.fn().mockResolvedValue({ data: { id: TEAM_ID, name: 'Ops Team' }, error: null });
    const select = vi.fn().mockReturnValue({ single });
    const eq = vi.fn().mockReturnValue({ select });
    const update = vi.fn().mockReturnValue({ eq });
    const from = vi.fn((table: string) => {
      if (table === 'teams') return { update };
      throw new Error(`Unexpected table: ${table}`);
    });
    vi.mocked(createClient).mockResolvedValue({ from } as never);

    const response = await PUT(
      new Request('http://localhost/api/teams/id', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'Ops Team' }),
      }),
      { params: Promise.resolve({ id: TEAM_ID }) },
    );

    expect(response.status).toBe(200);
    expect(update).toHaveBeenCalledWith({ name: 'Ops Team', updated_at: expect.any(String) });
    expect(eq).toHaveBeenCalledWith('id', TEAM_ID);
  });

  it('returns 404 when updating a missing team', async () => {
    const single = vi.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116' } });
    const select = vi.fn().mockReturnValue({ single });
    const eq = vi.fn().mockReturnValue({ select });
    const update = vi.fn().mockReturnValue({ eq });
    const from = vi.fn((table: string) => {
      if (table === 'teams') return { update };
      throw new Error(`Unexpected table: ${table}`);
    });
    vi.mocked(createClient).mockResolvedValue({ from } as never);

    const response = await PUT(
      new Request('http://localhost/api/teams/id', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'Ops Team' }),
      }),
      { params: Promise.resolve({ id: TEAM_ID }) },
    );

    expect(response.status).toBe(404);
  });

  it('deletes a team successfully', async () => {
    const eq = vi.fn().mockResolvedValue({ error: null });
    const remove = vi.fn().mockReturnValue({ eq });
    const from = vi.fn((table: string) => {
      if (table === 'teams') return { delete: remove };
      throw new Error(`Unexpected table: ${table}`);
    });
    vi.mocked(createClient).mockResolvedValue({ from } as never);

    const response = await DELETE(new Request('http://localhost/api/teams/id', { method: 'DELETE' }), {
      params: Promise.resolve({ id: TEAM_ID }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true });
    expect(eq).toHaveBeenCalledWith('id', TEAM_ID);
  });
});
