import { describe, expect, it, vi } from 'vitest';

const { createClientForAccessTokenMock } = vi.hoisted(() => ({
  createClientForAccessTokenMock: vi.fn(),
}));

vi.mock('@/lib/supabase/token', () => ({
  createClientForAccessToken: createClientForAccessTokenMock,
}));

import { authenticateMcpRequest } from './auth';

describe('mcp auth', () => {
  it('returns 401 with metadata header when bearer token is missing', async () => {
    const result = await authenticateMcpRequest(new Request('http://localhost/api/mcp', { method: 'POST' }));

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('Expected auth failure');

    expect(result.response.status).toBe(401);
    expect(result.response.headers.get('WWW-Authenticate')).toContain('resource_metadata=');
    expect(result.response.headers.get('WWW-Authenticate')).toContain('/.well-known/oauth-protected-resource/api/mcp');
  });

  it('returns 401 when Supabase rejects token', async () => {
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

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('Expected auth failure');

    expect(result.response.status).toBe(401);
    expect(result.response.headers.get('WWW-Authenticate')).toContain('invalid_token');
  });

  it('returns user and supabase client for valid token', async () => {
    const supabase = {
      auth: {
        getClaims: vi.fn().mockResolvedValue({
          data: {
            claims: {
              sub: 'd7f34189-5d27-4dc0-b2c5-23d11796add4',
              email: 'owner@example.com',
            },
          },
          error: null,
        }),
      },
    };
    createClientForAccessTokenMock.mockReturnValue(supabase);

    const result = await authenticateMcpRequest(
      new Request('http://localhost/api/mcp', {
        method: 'POST',
        headers: { authorization: 'Bearer valid-token' },
      }),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('Expected auth success');

    expect(result.user.id).toBe('d7f34189-5d27-4dc0-b2c5-23d11796add4');
    expect(result.supabase).toBe(supabase);
  });
});
