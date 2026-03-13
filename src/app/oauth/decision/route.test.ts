import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getUserMock, createClientMock } = vi.hoisted(() => ({
  getUserMock: vi.fn(),
  createClientMock: vi.fn(),
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
        getUser: getUserMock,
      },
    });
  });

  it('stores oauth resume state when redirecting unauthenticated users to login', async () => {
    getUserMock.mockResolvedValue({ data: { user: null } });

    const form = new FormData();
    form.set('decision', 'approve');
    form.set('authorization_id', 'auth-123');

    const response = await POST(
      new Request('https://app.example.com/oauth/decision', {
        method: 'POST',
        body: form,
      }),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('https://app.example.com/auth/login');
    expect(response.cookies.get('beemspec_oauth_login_resume')?.value).toBe(
      '%2Foauth%2Fconsent%3Fauthorization_id%3Dauth-123',
    );
  });
});
