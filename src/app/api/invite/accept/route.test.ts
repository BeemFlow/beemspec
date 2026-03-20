import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { POST } from './route';

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }));

describe('invite accept route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('accepts a pending invite for the authenticated user', async () => {
    const rpc = vi.fn().mockResolvedValue({ error: null });
    vi.mocked(createClient).mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }) },
      rpc,
    } as never);

    const single = vi.fn().mockResolvedValue({
      data: { id: 'invite-1', team_id: 'team-1', accepted_at: null },
      error: null,
    });
    const eq = vi.fn().mockReturnValue({ single });
    const select = vi.fn().mockReturnValue({ eq });
    vi.mocked(createAdminClient).mockReturnValue({ from: vi.fn().mockReturnValue({ select }) } as never);

    const response = await POST(
      new Request('http://localhost/api/invite/accept', {
        method: 'POST',
        body: JSON.stringify({ inviteId: 'invite-1' }),
      }),
    );

    expect(response.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith('accept_team_invite_member', {
      p_invite_id: 'invite-1',
      p_team_id: 'team-1',
      p_user_id: 'user-1',
    });
  });

  it('returns 401 when no authenticated user is present', async () => {
    vi.mocked(createClient).mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) },
    } as never);

    const response = await POST(
      new Request('http://localhost/api/invite/accept', {
        method: 'POST',
        body: JSON.stringify({ inviteId: 'invite-1' }),
      }),
    );

    expect(response.status).toBe(401);
  });
});
