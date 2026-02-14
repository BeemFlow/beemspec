import { beforeEach, describe, expect, it, vi } from 'vitest';
import { requireAuth } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { GET } from './route';

vi.mock('@/lib/auth', () => ({ requireAuth: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }));

const RELEASE_ID = 'd7f34189-5d27-4dc0-b2c5-23d11796add4';

describe('release runs history route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAuth).mockResolvedValue({ success: true, user: { id: 'user_1' } } as never);
  });

  it('returns release run history for release', async () => {
    const limit = vi.fn().mockResolvedValue({
      data: [{ id: 'run_1', release_id: RELEASE_ID, status: 'completed' }],
      error: null,
    });
    const order = vi.fn().mockReturnValue({ limit });
    const eq = vi.fn().mockReturnValue({ order });
    const select = vi.fn().mockReturnValue({ eq });
    const from = vi.fn().mockReturnValue({ select });

    vi.mocked(createClient).mockResolvedValue({ from } as never);

    const response = await GET(new Request(`http://localhost/api/releases/${RELEASE_ID}/runs?limit=10`), {
      params: Promise.resolve({ id: RELEASE_ID }),
    });

    expect(limit).toHaveBeenCalledWith(10);
    await expect(response.json()).resolves.toMatchObject({ count: 1 });
  });
});
