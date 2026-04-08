import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  createAdminClientMock,
  createLinearClientMock,
  getLinearOAuthConnectionForTeamMock,
  hasLinearOAuthConnectionForTeamMock,
  refreshLinearOAuthAccessTokenMock,
  upsertLinearOAuthConnectionMock,
  getSyncTargetForStoryMock,
  getSyncTargetForStoryMapMock,
  getTeamIdForStoryMock,
  getTeamIdForStoryMapMock,
} = vi.hoisted(() => ({
  createAdminClientMock: vi.fn(),
  createLinearClientMock: vi.fn(),
  getLinearOAuthConnectionForTeamMock: vi.fn(),
  hasLinearOAuthConnectionForTeamMock: vi.fn(),
  refreshLinearOAuthAccessTokenMock: vi.fn(),
  upsertLinearOAuthConnectionMock: vi.fn(),
  getSyncTargetForStoryMock: vi.fn(),
  getSyncTargetForStoryMapMock: vi.fn(),
  getTeamIdForStoryMock: vi.fn(),
  getTeamIdForStoryMapMock: vi.fn(),
}));

vi.mock('@beemspec/linear', () => ({ createLinearClient: createLinearClientMock }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: createAdminClientMock }));
vi.mock('./connections', async () => {
  const actual = await import('./connections');
  return {
    ...actual,
    getLinearOAuthConnectionForTeam: getLinearOAuthConnectionForTeamMock,
    hasLinearOAuthConnectionForTeam: hasLinearOAuthConnectionForTeamMock,
    upsertLinearOAuthConnection: upsertLinearOAuthConnectionMock,
  };
});
vi.mock('./oauth-token', () => ({ refreshLinearOAuthAccessToken: refreshLinearOAuthAccessTokenMock }));
vi.mock('./settings', () => ({
  getSyncTargetForStory: getSyncTargetForStoryMock,
  getSyncTargetForStoryMap: getSyncTargetForStoryMapMock,
  getTeamIdForStory: getTeamIdForStoryMock,
  getTeamIdForStoryMap: getTeamIdForStoryMapMock,
}));

import {
  isLinearSyncAvailableForStoryMap,
  resolveLinearAuthTokenForTeam,
  resolveLinearSyncContextForStory,
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
      teamId: 'team-1',
      target: { projectId: 'project-1' },
      targetConfigured: true,
      linearIssueSync: syncClient,
    });
  });

  it('returns a safe default story sync context when target lookup fails', async () => {
    getSyncTargetForStoryMock.mockRejectedValue(new Error('boom'));

    await expect(resolveLinearSyncContextForStory({} as never, { storyId: 'story-1' })).resolves.toEqual({
      teamId: null,
      target: null,
      targetConfigured: false,
      linearIssueSync: null,
    });
  });

  it('checks team availability before reporting story map sync availability', async () => {
    getTeamIdForStoryMapMock.mockResolvedValue('team-1');
    hasLinearOAuthConnectionForTeamMock.mockResolvedValue(true);

    await expect(isLinearSyncAvailableForStoryMap({} as never, { storyMapId: 'map-1' })).resolves.toBe(true);

    getTeamIdForStoryMapMock.mockResolvedValue(null);
    await expect(isLinearSyncAvailableForStoryMap({} as never, { storyMapId: 'map-2' })).resolves.toBe(false);
  });
});
