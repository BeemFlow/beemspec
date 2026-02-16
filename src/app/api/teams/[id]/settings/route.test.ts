import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getLinearOAuthConnectionStatusForTeam } from '@/integrations/linear/auth';
import { requireAuth } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { GET } from './route';

vi.mock('@/lib/auth', () => ({ requireAuth: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }));
vi.mock('@/integrations/linear/auth', () => ({
  getLinearOAuthConnectionStatusForTeam: vi.fn(),
}));

const TEAM_ID = 'd7f34189-5d27-4dc0-b2c5-23d11796add4';

describe('team settings route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAuth).mockResolvedValue({ success: true, user: { id: 'user_1' } } as never);
  });

  it('returns consolidated settings payload for owner', async () => {
    const roleMaybeSingle = vi.fn().mockResolvedValue({ data: { role: 'owner' }, error: null });
    const roleEqUser = vi.fn().mockReturnValue({ maybeSingle: roleMaybeSingle });
    const roleEqTeam = vi.fn().mockReturnValue({ eq: roleEqUser });
    const roleSelect = vi.fn().mockReturnValue({ eq: roleEqTeam });

    const integrationMaybeSingle = vi.fn().mockResolvedValue({
      data: {
        team_id: TEAM_ID,
        linear_workspace_id: 'workspace_1',
        linear_team_id: 'team_1',
        linear_project_id: null,
        linear_state_id: null,
        updated_at: '2026-02-16T10:00:00.000Z',
      },
      error: null,
    });
    const integrationEq = vi.fn().mockReturnValue({ maybeSingle: integrationMaybeSingle });
    const integrationSelect = vi.fn().mockReturnValue({ eq: integrationEq });

    const invitesOrder = vi.fn().mockResolvedValue({ data: [{ id: 'invite_1' }], error: null });
    const invitesIs = vi.fn().mockReturnValue({ order: invitesOrder });
    const invitesEq = vi.fn().mockReturnValue({ is: invitesIs });
    const invitesSelect = vi.fn().mockReturnValue({ eq: invitesEq });

    const from = vi.fn((table: string) => {
      if (table === 'team_members') return { select: roleSelect };
      if (table === 'integration_settings') return { select: integrationSelect };
      if (table === 'team_invites') return { select: invitesSelect };
      return {};
    });
    const rpc = vi.fn().mockResolvedValue({ data: [{ id: 'member_1' }], error: null });

    vi.mocked(createClient).mockResolvedValue({ from, rpc } as never);
    vi.mocked(getLinearOAuthConnectionStatusForTeam).mockResolvedValue({
      teamId: TEAM_ID,
      scope: 'read,write',
      expiresAt: '2026-02-17T10:00:00.000Z',
    });

    const response = await GET(new Request('http://localhost/api/test'), { params: Promise.resolve({ id: TEAM_ID }) });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      team_id: TEAM_ID,
      permissions: { is_owner: true },
      members: [{ id: 'member_1' }],
      invites: [{ id: 'invite_1' }],
      linear: {
        settings: { linear_workspace_id: 'workspace_1' },
        connection: { connected: true, scope: 'read,write' },
      },
    });
  });

  it('returns 404 when user is not a team member', async () => {
    const roleMaybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
    const roleEqUser = vi.fn().mockReturnValue({ maybeSingle: roleMaybeSingle });
    const roleEqTeam = vi.fn().mockReturnValue({ eq: roleEqUser });
    const roleSelect = vi.fn().mockReturnValue({ eq: roleEqTeam });
    const from = vi.fn(() => ({ select: roleSelect }));

    vi.mocked(createClient).mockResolvedValue({ from } as never);

    const response = await GET(new Request('http://localhost/api/test'), { params: Promise.resolve({ id: TEAM_ID }) });

    expect(response.status).toBe(404);
  });
});
