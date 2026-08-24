import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getClaimsMock, createClientMock, approveAuthorizationMock, denyAuthorizationMock } = vi.hoisted(() => ({
  getClaimsMock: vi.fn(),
  createClientMock: vi.fn(),
  approveAuthorizationMock: vi.fn(),
  denyAuthorizationMock: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: createClientMock,
}));

import { POST } from './route';

describe('oauth decision route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createClientMock.mockResolvedValue({
      auth: {
        getClaims: getClaimsMock,
        oauth: {
          approveAuthorization: approveAuthorizationMock,
          denyAuthorization: denyAuthorizationMock,
        },
      },
    });
  });

  it('stores oauth resume state when redirecting unauthenticated users to login', async () => {
    getClaimsMock.mockResolvedValue({ data: null });

    const form = new FormData();
    form.set('decision', 'approve');
    form.set('authorization_id', 'auth-123');

    const response = await POST(
      new Request('https://app.example.com/oauth/decision', {
        method: 'POST',
        body: form,
      }),
    );

    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toBe('https://app.example.com/auth/login');
    expect(response.cookies.get('beemspec_oauth_login_resume')?.value).toBe(
      '%2Foauth%2Fconsent%3Fauthorization_id%3Dauth-123',
    );
  });

  it('uses see-other redirect after approving authorization', async () => {
    getClaimsMock.mockResolvedValue({ data: { claims: { sub: 'user-1' } } });
    approveAuthorizationMock.mockResolvedValue({
      data: {
        redirect_url: 'https://claude.ai/api/mcp/auth_callback?code=test&state=abc',
      },
      error: null,
    });

    const form = new FormData();
    form.set('decision', 'approve');
    form.set('authorization_id', 'auth-123');

    const response = await POST(
      new Request('https://app.example.com/oauth/decision', {
        method: 'POST',
        body: form,
      }),
    );

    expect(approveAuthorizationMock).toHaveBeenCalledWith('auth-123');
    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toBe('https://claude.ai/api/mcp/auth_callback?code=test&state=abc');
  });
});
