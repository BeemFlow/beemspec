import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  requireAuthMock,
  createLinearOAuthAuthorizeUrlMock,
  isTeamOwnerForRequestMock,
  resolveRequestOriginMock,
  randomUuidMock,
} = vi.hoisted(() => ({
  requireAuthMock: vi.fn(),
  createLinearOAuthAuthorizeUrlMock: vi.fn(),
  isTeamOwnerForRequestMock: vi.fn(),
  resolveRequestOriginMock: vi.fn(),
  randomUuidMock: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({ requireAuth: requireAuthMock }));
vi.mock('@/integrations/linear/oauth-token', () => ({
  createLinearOAuthAuthorizeUrl: createLinearOAuthAuthorizeUrlMock,
}));
vi.mock('@/lib/teams', () => ({ isTeamOwnerForRequest: isTeamOwnerForRequestMock }));
vi.mock('@/lib/request-url', async () => {
  const actual = await import('@/lib/request-url');
  return { ...actual, resolveRequestOrigin: resolveRequestOriginMock };
});

import { GET } from './route';

describe('linear oauth start route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthMock.mockResolvedValue({ success: true, user: { id: 'user-1' } });
    isTeamOwnerForRequestMock.mockResolvedValue(true);
    createLinearOAuthAuthorizeUrlMock.mockReturnValue('https://linear.app/oauth/authorize?state=state-1');
    resolveRequestOriginMock.mockReturnValue('https://app.example.com');
    randomUuidMock.mockReturnValue('state-1');
    vi.stubGlobal('crypto', { randomUUID: randomUuidMock });
  });

  it('rejects missing or invalid team ids', async () => {
    const response = await GET(new Request('https://app.example.com/api/integrations/linear/oauth/start'));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: 'Valid team_id is required' });
  });

  it('rejects non-owners before starting oauth', async () => {
    isTeamOwnerForRequestMock.mockResolvedValue(false);

    const response = await GET(
      new Request(
        'https://app.example.com/api/integrations/linear/oauth/start?team_id=d7f34189-5d27-4dc0-b2c5-23d11796add4',
      ),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: 'Only team owners can connect Linear' });
  });

  it('creates the authorize redirect and stores a secure oauth state cookie', async () => {
    const response = await GET(
      new Request(
        'https://app.example.com/api/integrations/linear/oauth/start?team_id=d7f34189-5d27-4dc0-b2c5-23d11796add4&return_to=/teams/123?tab=integrations',
      ),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('https://linear.app/oauth/authorize?state=state-1');
    expect(createLinearOAuthAuthorizeUrlMock).toHaveBeenCalledWith({ state: 'state-1' });
    expect(response.cookies.get('beemspec_linear_oauth_state')).toBeTruthy();
  });

  it('returns a 500 when oauth configuration is missing', async () => {
    createLinearOAuthAuthorizeUrlMock.mockImplementation(() => {
      throw new Error('Linear OAuth is not configured');
    });

    const response = await GET(
      new Request(
        'https://app.example.com/api/integrations/linear/oauth/start?team_id=d7f34189-5d27-4dc0-b2c5-23d11796add4',
      ),
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: 'Linear OAuth is not configured' });
  });
});
