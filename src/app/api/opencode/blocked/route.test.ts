import { beforeEach, describe, expect, it, vi } from 'vitest';
import { requireAuth } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { POST } from './route';

vi.mock('@/lib/auth', () => ({ requireAuth: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }));

const STORY_ID = 'd7f34189-5d27-4dc0-b2c5-23d11796add4';

describe('opencode blocked route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.BEEMSPEC_OPENCODE_TOKEN;
    vi.mocked(requireAuth).mockResolvedValue({ success: true, user: { id: 'user_1' } } as never);
  });

  it('marks latest run item failed with blocked reason', async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: { id: 'item_1' }, error: null });
    const limit = vi.fn().mockReturnValue({ maybeSingle });
    const order = vi.fn().mockReturnValue({ limit });
    const eqSelect = vi.fn().mockReturnValue({ order });
    const select = vi.fn().mockReturnValue({ eq: eqSelect });

    const eqUpdate = vi.fn().mockResolvedValue({ error: null });
    const update = vi.fn().mockReturnValue({ eq: eqUpdate });

    const from = vi.fn((table: string) => {
      if (table === 'release_run_items') return { select, update };
      return {};
    });
    vi.mocked(createClient).mockResolvedValue({ from } as never);

    const response = await POST(
      new Request('http://localhost/api/opencode/blocked', {
        method: 'POST',
        body: JSON.stringify({ story_id: STORY_ID, reason: 'Waiting on API access' }),
      }),
    );

    expect(eqUpdate).toHaveBeenCalled();
    await expect(response.json()).resolves.toMatchObject({ ok: true });
  });

  it('accepts bearer token auth', async () => {
    process.env.BEEMSPEC_OPENCODE_TOKEN = 'token_123';

    const maybeSingle = vi.fn().mockResolvedValue({ data: { id: 'item_1' }, error: null });
    const limit = vi.fn().mockReturnValue({ maybeSingle });
    const order = vi.fn().mockReturnValue({ limit });
    const eqSelect = vi.fn().mockReturnValue({ order });
    const select = vi.fn().mockReturnValue({ eq: eqSelect });
    const eqUpdate = vi.fn().mockResolvedValue({ error: null });
    const update = vi.fn().mockReturnValue({ eq: eqUpdate });
    const from = vi.fn((table: string) => (table === 'release_run_items' ? { select, update } : {}));
    vi.mocked(createAdminClient).mockReturnValue({ from } as never);

    const response = await POST(
      new Request('http://localhost/api/opencode/blocked', {
        method: 'POST',
        headers: { authorization: 'Bearer token_123' },
        body: JSON.stringify({ story_id: STORY_ID, reason: 'Waiting on API access' }),
      }),
    );

    expect(requireAuth).not.toHaveBeenCalled();
    expect(response.status).toBe(200);
  });
});
