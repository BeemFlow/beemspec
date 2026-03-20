import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createClient } from '@/lib/supabase/server';
import { GET } from './route';

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }));

describe('auth callback route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('exchanges the code and preserves next redirects', async () => {
    const exchangeCodeForSession = vi.fn().mockResolvedValue({ error: null });
    vi.mocked(createClient).mockResolvedValue({ auth: { exchangeCodeForSession } } as never);

    const response = await GET(
      new Request('https://app.example.com/auth/callback?code=auth-code&next=%2Finvite%2Faccept'),
    );

    expect(exchangeCodeForSession).toHaveBeenCalledWith('auth-code');
    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('https://app.example.com/auth/complete?next=%2Finvite%2Faccept');
  });

  it('redirects to login when code exchange fails', async () => {
    const exchangeCodeForSession = vi.fn().mockResolvedValue({ error: { message: 'bad code' } });
    vi.mocked(createClient).mockResolvedValue({ auth: { exchangeCodeForSession } } as never);

    const response = await GET(new Request('https://app.example.com/auth/callback?code=auth-code'));

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('https://app.example.com/auth/login?error=auth_callback_error');
  });
});
