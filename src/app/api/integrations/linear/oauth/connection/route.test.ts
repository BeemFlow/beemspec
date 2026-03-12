import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getLinearOAuthConnectionStatusForTeam } from '@/integrations/linear/connections';
import { requireAuth } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { isTeamOwnerForRequest } from '@/lib/teams';
import { DELETE, GET } from './route';

vi.mock('@/integrations/linear/connections', () => ({
  getLinearOAuthConnectionStatusForTeam: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  requireAuth: vi.fn(),
}));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(),
}));

vi.mock('@/lib/teams', () => ({
  isTeamOwnerForRequest: vi.fn(),
}));

const TEAM_ID = 'd7f34189-5d27-4dc0-b2c5-23d11796add4';

describe('linear oauth connection route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAuth).mockResolvedValue({ success: true, user: { id: 'user_1' } } as never);
    vi.mocked(isTeamOwnerForRequest).mockResolvedValue(true);
  });

  it('returns current connection status on GET', async () => {
    vi.mocked(createAdminClient).mockReturnValue({} as never);
    vi.mocked(getLinearOAuthConnectionStatusForTeam).mockResolvedValue({
      teamId: TEAM_ID,
      scope: 'read,write',
      expiresAt: null,
    });

    const response = await GET(new Request(`http://localhost/api/test?team_id=${TEAM_ID}`));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      team_id: TEAM_ID,
      connected: true,
      scope: 'read,write',
    });
  });

  it('cleans up Linear state atomically on DELETE', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: null });
    vi.mocked(createAdminClient).mockReturnValue({ rpc } as never);

    const response = await DELETE(new Request(`http://localhost/api/test?team_id=${TEAM_ID}`, { method: 'DELETE' }));

    expect(rpc).toHaveBeenCalledWith('disconnect_linear_for_team', { p_team_id: TEAM_ID });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ success: true, team_id: TEAM_ID, connected: false });
  });
});
