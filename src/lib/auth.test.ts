import { describe, expect, it, vi } from 'vitest';
import { createClient } from '@/lib/supabase/server';
import { requireAuth } from './auth';

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }));

describe('requireAuth', () => {
  it('returns the authenticated user when Supabase has a session', async () => {
    const supabase = {
      auth: {
        getClaims: vi.fn().mockResolvedValue({
          data: { claims: { sub: 'user-1', email: 'person@example.com' } },
          error: null,
        }),
      },
    };
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const result = await requireAuth();

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.user).toEqual({ id: 'user-1', email: 'person@example.com' });
      expect(result.supabase).toBe(supabase);
    }
  });

  it('returns an unauthorized response when no user is present', async () => {
    vi.mocked(createClient).mockResolvedValue({
      auth: {
        getClaims: vi.fn().mockResolvedValue({ data: null, error: null }),
      },
    } as never);

    const result = await requireAuth();

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.response.status).toBe(401);
    }
  });
});
