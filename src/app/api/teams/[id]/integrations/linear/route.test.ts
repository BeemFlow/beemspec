import { beforeEach, describe, expect, it, vi } from 'vitest';
import { requireAuth } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { GET, PUT } from './route';

vi.mock('@/lib/auth', () => ({
  requireAuth: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}));

const TEAM_ID = 'd7f34189-5d27-4dc0-b2c5-23d11796add4';

function jsonRequest(body: unknown): Request {
  return new Request('http://localhost/api/test', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('team linear integration settings route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAuth).mockResolvedValue({ success: true, user: { id: 'user_1' } } as never);
  });

  it('returns current settings on GET', async () => {
    const maybeSingle = vi.fn().mockResolvedValue({
      data: {
        team_id: TEAM_ID,
        linear_team_id: 'team_linear_1',
      },
      error: null,
    });
    const eq = vi.fn().mockReturnValue({ maybeSingle });
    const select = vi.fn().mockReturnValue({ eq });
    const from = vi.fn().mockReturnValue({ select });

    vi.mocked(createClient).mockResolvedValue({ from } as never);

    const response = await GET(new Request('http://localhost/api/test'), { params: Promise.resolve({ id: TEAM_ID }) });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      team_id: TEAM_ID,
      linear_team_id: 'team_linear_1',
    });
  });

  it('upserts settings on PUT', async () => {
    const ownerMaybeSingle = vi.fn().mockResolvedValue({ data: { role: 'owner' }, error: null });
    const ownerEqUser = vi.fn().mockReturnValue({ maybeSingle: ownerMaybeSingle });
    const ownerEqTeam = vi.fn().mockReturnValue({ eq: ownerEqUser });
    const ownerSelect = vi.fn().mockReturnValue({ eq: ownerEqTeam });

    const single = vi.fn().mockResolvedValue({
      data: {
        team_id: TEAM_ID,
        linear_workspace_id: null,
        linear_team_id: 'team_linear_1',
        linear_status_mapping: {},
      },
      error: null,
    });
    const select = vi.fn().mockReturnValue({ single });
    const upsert = vi.fn().mockReturnValue({ select });
    const from = vi.fn((table: string) => {
      if (table === 'team_members') return { select: ownerSelect };
      return { upsert };
    });

    vi.mocked(createClient).mockResolvedValue({ from } as never);

    const response = await PUT(jsonRequest({ linear_team_id: 'team_linear_1' }), {
      params: Promise.resolve({ id: TEAM_ID }),
    });

    expect(upsert).toHaveBeenCalledWith(
      {
        team_id: TEAM_ID,
        linear_workspace_id: null,
        linear_team_id: 'team_linear_1',
        linear_status_mapping: {},
      },
      { onConflict: 'team_id' },
    );
    expect(response.status).toBe(200);
  });

  it('returns 403 on PUT when requester is not owner', async () => {
    const ownerMaybeSingle = vi.fn().mockResolvedValue({ data: { role: 'member' }, error: null });
    const ownerEqUser = vi.fn().mockReturnValue({ maybeSingle: ownerMaybeSingle });
    const ownerEqTeam = vi.fn().mockReturnValue({ eq: ownerEqUser });
    const ownerSelect = vi.fn().mockReturnValue({ eq: ownerEqTeam });
    const from = vi.fn((table: string) => {
      if (table === 'team_members') return { select: ownerSelect };
      return {};
    });

    vi.mocked(createClient).mockResolvedValue({ from } as never);

    const response = await PUT(jsonRequest({ linear_team_id: 'team_linear_1' }), {
      params: Promise.resolve({ id: TEAM_ID }),
    });

    expect(response.status).toBe(403);
  });
});
