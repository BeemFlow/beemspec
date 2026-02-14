import { beforeEach, describe, expect, it, vi } from 'vitest';
import { requireAuth } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { GET } from './route';

vi.mock('@/lib/auth', () => ({ requireAuth: vi.fn() }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }));

describe('linear reconcile-failures ops route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAuth).mockResolvedValue({ success: true, user: { id: 'user_1' } } as never);
  });

  it('returns sync error links summary', async () => {
    const limit = vi.fn().mockResolvedValue({
      data: [{ story_id: 's1', linear_issue_id: 'l1', sync_state: 'error' }],
      error: null,
    });
    const order = vi.fn().mockReturnValue({ limit });
    const eq = vi.fn().mockReturnValue({ order });
    const select = vi.fn().mockReturnValue({ eq });
    const from = vi.fn().mockReturnValue({ select });

    vi.mocked(createAdminClient).mockReturnValue({ from } as never);

    const response = await GET(new Request('http://localhost/api/integrations/linear/ops/reconcile-failures?limit=5'));
    await expect(response.json()).resolves.toMatchObject({ count: 1 });
    expect(limit).toHaveBeenCalledWith(5);
  });
});
