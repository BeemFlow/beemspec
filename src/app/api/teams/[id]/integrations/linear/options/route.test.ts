import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getLinearOAuthConnectionForTeam, isExpired } from '@/integrations/linear/connections';
import { applySuggestedLinearSettings, resolveLinearOptions } from '@/integrations/linear/discovery';
import { requireAuth } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { isTeamOwnerForRequest } from '@/lib/teams';
import { GET } from './route';

vi.mock('@/lib/auth', () => ({
  requireAuth: vi.fn(),
}));

vi.mock('@/lib/teams', () => ({
  isTeamOwnerForRequest: vi.fn(),
}));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(),
}));

vi.mock('@/integrations/linear/connections', () => ({
  getLinearOAuthConnectionForTeam: vi.fn(),
  isExpired: vi.fn(),
  toExpiresAt: vi.fn(),
  upsertLinearOAuthConnection: vi.fn(),
}));

vi.mock('@/integrations/linear/oauth-token', () => ({
  refreshLinearOAuthAccessToken: vi.fn(),
}));

vi.mock('@/integrations/linear/discovery', () => ({
  resolveLinearOptions: vi.fn(),
  applySuggestedLinearSettings: vi.fn(),
}));

const TEAM_ID = 'd7f34189-5d27-4dc0-b2c5-23d11796add4';

describe('team linear options route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAuth).mockResolvedValue({ success: true, user: { id: 'user_1' } } as never);
    vi.mocked(isTeamOwnerForRequest).mockResolvedValue(true);
    vi.mocked(isExpired).mockReturnValue(false);
  });

  it('returns 403 for non-owners', async () => {
    vi.mocked(isTeamOwnerForRequest).mockResolvedValue(false);

    const response = await GET(new Request('http://localhost/api/test'), { params: Promise.resolve({ id: TEAM_ID }) });

    expect(response.status).toBe(403);
  });

  it('returns options and applies suggested defaults', async () => {
    const maybeSingle = vi.fn().mockResolvedValue({
      data: {
        team_id: TEAM_ID,
        linear_workspace_id: 'workspace_1',
        linear_team_id: null,
        linear_project_id: null,
        linear_state_id: null,
      },
      error: null,
    });
    const eq = vi.fn().mockReturnValue({ maybeSingle });
    const selectForRead = vi.fn().mockReturnValue({ eq });

    const single = vi.fn().mockResolvedValue({
      data: {
        team_id: TEAM_ID,
        linear_workspace_id: 'workspace_1',
        linear_team_id: 'team_linear_1',
        linear_project_id: null,
        linear_state_id: null,
      },
      error: null,
    });
    const selectForUpsert = vi.fn().mockReturnValue({ single });
    const upsert = vi.fn().mockReturnValue({ select: selectForUpsert });

    const from = vi.fn().mockReturnValue({
      select: selectForRead,
      upsert,
    });

    vi.mocked(createAdminClient).mockReturnValue({ from } as never);
    vi.mocked(getLinearOAuthConnectionForTeam).mockResolvedValue({
      teamId: TEAM_ID,
      accessToken: 'token_1',
      refreshToken: 'refresh_1',
      tokenType: 'Bearer',
      scope: 'read write',
      expiresAt: null,
    });
    vi.mocked(resolveLinearOptions).mockResolvedValue({
      workspaceId: 'workspace_1',
      teams: [{ id: 'team_linear_1', name: 'Engineering', key: 'ENG' }],
      projects: [],
      states: [],
    });
    vi.mocked(applySuggestedLinearSettings).mockReturnValue({
      linearWorkspaceId: 'workspace_1',
      linearTeamId: 'team_linear_1',
      linearProjectId: null,
      linearStateId: null,
      changed: true,
    });

    const response = await GET(new Request('http://localhost/api/test'), { params: Promise.resolve({ id: TEAM_ID }) });

    expect(response.status).toBe(200);
    expect(upsert).toHaveBeenCalled();
    await expect(response.json()).resolves.toMatchObject({
      connected: true,
      applied_defaults: true,
      settings: {
        linear_team_id: 'team_linear_1',
      },
      options: {
        teams: [{ id: 'team_linear_1', name: 'Engineering' }],
      },
    });
  });
});
