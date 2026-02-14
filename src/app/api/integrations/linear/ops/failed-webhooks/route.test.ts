import { beforeEach, describe, expect, it, vi } from 'vitest';
import { requireAuth } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { GET } from './route';

vi.mock('@/lib/auth', () => ({ requireAuth: vi.fn() }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }));

describe('linear failed-webhooks ops route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAuth).mockResolvedValue({ success: true, user: { id: 'user_1' } } as never);
  });

  it('returns failed webhook receipts summary', async () => {
    const limit = vi.fn().mockResolvedValue({
      data: [{ id: 'r1', event_type: 'Issue', event_action: 'update', error: 'boom' }],
      error: null,
    });
    const order = vi.fn().mockReturnValue({ limit });
    const eqStatus = vi.fn().mockReturnValue({ order });
    const eqProvider = vi.fn().mockReturnValue({ eq: eqStatus });
    const select = vi.fn().mockReturnValue({ eq: eqProvider });
    const from = vi.fn().mockReturnValue({ select });

    vi.mocked(createAdminClient).mockReturnValue({ from } as never);

    const response = await GET(new Request('http://localhost/api/integrations/linear/ops/failed-webhooks?limit=10'));
    await expect(response.json()).resolves.toMatchObject({ count: 1 });
    expect(limit).toHaveBeenCalledWith(10);
  });
});
