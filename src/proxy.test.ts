import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { createServerClientMock, getUserMock } = vi.hoisted(() => ({
  createServerClientMock: vi.fn(),
  getUserMock: vi.fn(),
}));

vi.mock('@supabase/ssr', () => ({
  createServerClient: createServerClientMock,
}));

import { proxy } from './proxy';

function makeRequest(path: string): NextRequest {
  return new NextRequest(`http://internal-service${path}`, {
    headers: {
      host: 'internal-service',
      'x-forwarded-host': 'app.example.com',
      'x-forwarded-proto': 'https',
    },
  });
}

describe('proxy auth redirects', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://project-ref.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'publishable-key';

    getUserMock.mockResolvedValue({ data: { user: null } });
    createServerClientMock.mockReturnValue({
      auth: {
        getUser: getUserMock,
      },
    });
  });

  it('redirects unauthenticated users to the forwarded public login URL', async () => {
    const response = await proxy(makeRequest('/story-map/123'));

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('https://app.example.com/auth/login?next=%2Fstory-map%2F123');
  });

  it('stores oauth consent resume state in a dedicated cookie', async () => {
    const response = await proxy(makeRequest('/oauth/consent?authorization_id=auth-123'));

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('https://app.example.com/auth/login');
    expect(response.cookies.get('beemspec_oauth_login_resume')?.value).toBe(
      '%2Foauth%2Fconsent%3Fauthorization_id%3Dauth-123',
    );
  });

  it('redirects authenticated users away from login using the forwarded public origin', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'user-1' } } });

    const response = await proxy(makeRequest('/auth/login?next=%2Fstory-map%2F123'));

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('https://app.example.com/story-map/123');
  });

  it('ignores external next targets and falls back to the app root', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'user-1' } } });

    const response = await proxy(makeRequest('/auth/login?next=https://evil.example.com/phish'));

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('https://app.example.com/');
  });
});
