import { beforeEach, describe, expect, it, vi } from 'vitest';

const { envMock, fetchMock } = vi.hoisted(() => ({
  envMock: {
    linearClientId: vi.fn(),
    linearClientSecret: vi.fn(),
    linearOAuthRedirectUri: vi.fn(),
  },
  fetchMock: vi.fn(),
}));

vi.mock('@/lib/env', () => ({ env: envMock }));

import { createLinearOAuthAuthorizeUrl, exchangeLinearOAuthCode, refreshLinearOAuthAccessToken } from './oauth-token';

describe('linear oauth token helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', fetchMock);
    envMock.linearClientId.mockReturnValue('client-123');
    envMock.linearClientSecret.mockReturnValue('secret-456');
    envMock.linearOAuthRedirectUri.mockReturnValue('https://app.example.com/auth/callback');
  });

  it('builds an authorize url with default scopes', () => {
    const url = new URL(createLinearOAuthAuthorizeUrl({ state: 'state-1' }));

    expect(url.origin + url.pathname).toBe('https://linear.app/oauth/authorize');
    expect(url.searchParams.get('client_id')).toBe('client-123');
    expect(url.searchParams.get('redirect_uri')).toBe('https://app.example.com/auth/callback');
    expect(url.searchParams.get('scope')).toBe('read,write');
    expect(url.searchParams.get('state')).toBe('state-1');
  });

  it('throws when oauth env vars are missing', () => {
    envMock.linearClientSecret.mockReturnValue(null);

    expect(() => createLinearOAuthAuthorizeUrl({ state: 'state-1' })).toThrow(
      'Missing Linear OAuth environment variables',
    );
  });

  it('exchanges an auth code and normalizes token payload fields', async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          access_token: ' access-1 ',
          refresh_token: ' refresh-1 ',
          token_type: ' Bearer ',
          scope: ' read write ',
          expires_in: 3600.9,
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );

    await expect(exchangeLinearOAuthCode('code-123')).resolves.toEqual({
      accessToken: 'access-1',
      refreshToken: 'refresh-1',
      tokenType: 'Bearer',
      scope: 'read write',
      expiresIn: 3600,
    });

    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe('https://api.linear.app/oauth/token');
    expect(init.method).toBe('POST');
    expect(init.body.toString()).toContain('grant_type=authorization_code');
    expect(init.body.toString()).toContain('code=code-123');
  });

  it('surfaces token request failures from the api response payload', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ error_description: 'code expired' }), {
        status: 400,
        headers: { 'content-type': 'application/json' },
      }),
    );

    await expect(refreshLinearOAuthAccessToken('refresh-1')).rejects.toThrow(
      'Linear OAuth token request failed: code expired',
    );
  });

  it('fails when the token response omits a usable access token', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ error: 'invalid_grant' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    await expect(exchangeLinearOAuthCode('code-123')).rejects.toThrow(
      'Linear OAuth token exchange failed: invalid_grant',
    );
  });
});
