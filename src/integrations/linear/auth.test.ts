import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  createAdminClientMock,
  createLinearClientMock,
  getLinearOAuthConnectionForTeamMock,
  refreshLinearOAuthAccessTokenMock,
  upsertLinearOAuthConnectionMock,
  getSyncTargetForStoryMapMock,
  getTeamIdForStoryMapMock,
} = vi.hoisted(() => ({
  createAdminClientMock: vi.fn(),
  createLinearClientMock: vi.fn(),
  getLinearOAuthConnectionForTeamMock: vi.fn(),
  refreshLinearOAuthAccessTokenMock: vi.fn(),
  upsertLinearOAuthConnectionMock: vi.fn(),
  getSyncTargetForStoryMapMock: vi.fn(),
  getTeamIdForStoryMapMock: vi.fn(),
}));

vi.mock('@beemspec/linear', () => ({ createLinearClient: createLinearClientMock }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: createAdminClientMock }));
vi.mock('./connections', async () => {
  const actual = await import('./connections');
  return {
    ...actual,
    getLinearOAuthConnectionForTeam: getLinearOAuthConnectionForTeamMock,
    upsertLinearOAuthConnection: upsertLinearOAuthConnectionMock,
  };
});
vi.mock('./oauth-token', () => ({ refreshLinearOAuthAccessToken: refreshLinearOAuthAccessTokenMock }));
vi.mock('./settings', () => ({
  getSyncTargetForStoryMap: getSyncTargetForStoryMapMock,
  getTeamIdForStoryMap: getTeamIdForStoryMapMock,
}));

import {
  resolveLinearAuthTokenForTeam,
  resolveLinearAuthTokenForTeamResult,
  resolveLinearSyncContextForStoryMap,
} from './auth';

describe('linear auth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-26T12:00:00Z'));
    createAdminClientMock.mockReturnValue({});
  });

  it('returns a cached access token when the connection is still fresh', async () => {
    getLinearOAuthConnectionForTeamMock.mockResolvedValue({
      accessToken: 'access-1',
      refreshToken: 'refresh-1',
      expiresAt: '2026-03-26T13:00:00Z',
    });

    await expect(resolveLinearAuthTokenForTeam('team-1')).resolves.toBe('access-1');
    expect(refreshLinearOAuthAccessTokenMock).not.toHaveBeenCalled();
  });

  it('refreshes expired access tokens and persists the new connection', async () => {
    getLinearOAuthConnectionForTeamMock.mockResolvedValue({
      accessToken: 'access-1',
      refreshToken: 'refresh-1',
      expiresAt: '2026-03-26T11:00:00Z',
    });
    refreshLinearOAuthAccessTokenMock.mockResolvedValue({
      accessToken: 'access-2',
      refreshToken: 'refresh-2',
      tokenType: 'Bearer',
      scope: 'read write',
      expiresIn: 3600,
    });

    await expect(resolveLinearAuthTokenForTeam('team-1')).resolves.toBe('access-2');
    expect(upsertLinearOAuthConnectionMock).toHaveBeenCalledWith(
      {},
      expect.objectContaining({ teamId: 'team-1', accessToken: 'access-2', refreshToken: 'refresh-2' }),
    );
  });

  it('returns null when the token is expired and no refresh token exists', async () => {
    getLinearOAuthConnectionForTeamMock.mockResolvedValue({
      accessToken: 'access-1',
      refreshToken: null,
      expiresAt: '2026-03-26T11:00:00Z',
    });

    await expect(resolveLinearAuthTokenForTeam('team-1')).resolves.toBeNull();
  });

  it('returns an oauth-backed sync context for a story map when target and team are configured', async () => {
    const syncClient = { upsertIssue: vi.fn() };
    getSyncTargetForStoryMapMock.mockResolvedValue({ projectId: 'project-1' });
    getTeamIdForStoryMapMock.mockResolvedValue('team-1');
    getLinearOAuthConnectionForTeamMock.mockResolvedValue({
      accessToken: 'access-1',
      refreshToken: null,
      expiresAt: null,
    });
    createLinearClientMock.mockReturnValue(syncClient);

    await expect(resolveLinearSyncContextForStoryMap({} as never, { storyMapId: 'map-1' })).resolves.toEqual({
      status: 'ready',
      teamId: 'team-1',
      target: { projectId: 'project-1' },
      targetConfigured: true,
      linearIssueSync: syncClient,
      accessToken: 'access-1',
    });
  });

  it('reports token infrastructure failures separately from a missing connection', async () => {
    const error = new Error('database unavailable');
    getLinearOAuthConnectionForTeamMock.mockRejectedValue(error);

    await expect(resolveLinearAuthTokenForTeamResult('team-1')).resolves.toEqual({ status: 'error', error });

    getLinearOAuthConnectionForTeamMock.mockResolvedValue(null);
    await expect(resolveLinearAuthTokenForTeamResult('team-1')).resolves.toEqual({ status: 'not_connected' });
  });
});
