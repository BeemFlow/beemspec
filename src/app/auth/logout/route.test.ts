import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveRequestUrl } from '@/lib/request-url';
import { createClient } from '@/lib/supabase/server';
import { GET, POST } from './route';

vi.mock('@/lib/request-url', () => ({ resolveRequestUrl: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }));

describe('auth logout route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('signs out and redirects on GET', async () => {
    const signOut = vi.fn().mockResolvedValue(undefined);
    vi.mocked(createClient).mockResolvedValue({ auth: { signOut } } as never);
    vi.mocked(resolveRequestUrl).mockReturnValue(new URL('https://app.example.com/auth/login') as never);

    const response = await GET(new Request('https://app.example.com/auth/logout'));

    expect(signOut).toHaveBeenCalled();
    expect(resolveRequestUrl).toHaveBeenCalledWith(expect.any(Request), '/auth/login');
    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('https://app.example.com/auth/login');
  });

  it('uses the same logout behavior on POST', async () => {
    const signOut = vi.fn().mockResolvedValue(undefined);
    vi.mocked(createClient).mockResolvedValue({ auth: { signOut } } as never);
    vi.mocked(resolveRequestUrl).mockReturnValue(new URL('https://app.example.com/auth/login') as never);

    const response = await POST(new Request('https://app.example.com/auth/logout', { method: 'POST' }));

    expect(signOut).toHaveBeenCalled();
    expect(response.status).toBe(307);
  });
});
