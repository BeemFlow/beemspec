import { describe, expect, it, vi } from 'vitest';
import { createClient } from '@/lib/supabase/server';
import { requireAuth } from './auth';

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }));

describe('requireAuth', () => {
  it('returns the authenticated user when Supabase has a session', async () => {
    vi.mocked(createClient).mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: 'user-1', email: 'person@example.com' } },
          error: null,
        }),
      },
    } as never);

    const result = await requireAuth();

    expect(result).toEqual({
      success: true,
      user: { id: 'user-1', email: 'person@example.com' },
    });
  });

  it('returns an unauthorized response when no user is present', async () => {
    vi.mocked(createClient).mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
      },
    } as never);

    const result = await requireAuth();

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.response.status).toBe(401);
    }
  });
});
