import { describe, expect, it, vi } from 'vitest';

const { createClientForAccessTokenMock } = vi.hoisted(() => ({
  createClientForAccessTokenMock: vi.fn(),
}));

vi.mock('@/lib/supabase/token', () => ({
  createClientForAccessToken: createClientForAccessTokenMock,
}));

import { authenticateMcpRequest, getMcpAuthContext } from './auth';

describe('mcp auth', () => {
  it('returns an OAuth challenge with metadata when the bearer token is missing', async () => {
    const result = await authenticateMcpRequest(new Request('http://localhost/api/mcp', { method: 'POST' }));

    expect(result).toBeInstanceOf(Response);
    if (!(result instanceof Response)) throw new Error('Expected auth failure');

    expect(result.status).toBe(401);
    expect(result.headers.get('WWW-Authenticate')).toContain('resource_metadata=');
    expect(result.headers.get('WWW-Authenticate')).toContain('/.well-known/oauth-protected-resource/api/mcp');
    await expect(result.json()).resolves.toMatchObject({ error: 'invalid_token' });
  });

  it('returns an invalid-token challenge when Supabase rejects the token', async () => {
    createClientForAccessTokenMock.mockReturnValue({
      auth: {
        getClaims: vi.fn().mockResolvedValue({
          data: null,
          error: { message: 'invalid token' },
        }),
      },
    });

    const result = await authenticateMcpRequest(
      new Request('http://localhost/api/mcp', {
        method: 'POST',
        headers: { authorization: 'Bearer invalid-token' },
      }),
    );

    expect(result).toBeInstanceOf(Response);
    if (!(result instanceof Response)) throw new Error('Expected auth failure');

    expect(result.status).toBe(401);
    expect(result.headers.get('WWW-Authenticate')).toContain('invalid_token');
  });

  it('rejects an expired Supabase token', async () => {
    createClientForAccessTokenMock.mockReturnValue({
      auth: {
        getClaims: vi.fn().mockResolvedValue({
          data: {
            claims: {
              sub: 'd7f34189-5d27-4dc0-b2c5-23d11796add4',
              exp: Math.floor(Date.now() / 1000) - 1,
            },
          },
          error: null,
        }),
      },
    });

    const result = await authenticateMcpRequest(
      new Request('http://localhost/api/mcp', {
        method: 'POST',
        headers: { authorization: 'Bearer expired-token' },
      }),
    );

    expect(result).toBeInstanceOf(Response);
    if (!(result instanceof Response)) throw new Error('Expected auth failure');
    expect(result.status).toBe(401);
    await expect(result.json()).resolves.toMatchObject({ error: 'invalid_token' });
  });

  it('returns SDK auth info with the scoped BeemSpec context for a valid token', async () => {
    const expiresAt = Math.floor(Date.now() / 1000) + 3600;
    const getClaims = vi.fn().mockResolvedValue({
      data: {
        claims: {
          sub: 'd7f34189-5d27-4dc0-b2c5-23d11796add4',
          email: 'owner@example.com',
          client_id: 'mcp-client',
          exp: expiresAt,
        },
      },
      error: null,
    });
    const supabase = { auth: { getClaims } };
    createClientForAccessTokenMock.mockReturnValue(supabase);

    const result = await authenticateMcpRequest(
      new Request('http://localhost/api/mcp', {
        method: 'POST',
        headers: { authorization: 'Bearer valid-token' },
      }),
    );

    expect(result).not.toBeInstanceOf(Response);
    if (result instanceof Response) throw new Error('Expected auth success');

    expect(result).toMatchObject({
      token: 'valid-token',
      clientId: 'mcp-client',
      scopes: [],
      expiresAt,
    });
    expect(getMcpAuthContext(result)).toEqual({
      user: {
        id: 'd7f34189-5d27-4dc0-b2c5-23d11796add4',
        email: 'owner@example.com',
      },
      supabase,
    });
    expect(getClaims).toHaveBeenCalledWith('valid-token');
  });
});
