import { NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { requireAuth } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { POST } from './route';

vi.mock('@/lib/auth', () => ({
  requireAuth: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}));

vi.mock('@/integrations/linear/sync-reconcile', () => ({
  syncStoriesByIdList: vi.fn(),
}));

import { syncStoriesByIdList } from '@/integrations/linear/sync-reconcile';

function jsonRequest(body: unknown): Request {
  return new Request('http://localhost/api/integrations/linear/sync/batch', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('linear batch sync route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.BEEMSPEC_SYNC_CRON_TOKEN;
    vi.mocked(requireAuth).mockResolvedValue({ success: true, user: { id: 'user_1' } } as never);
  });

  it('syncs stories selected by stale last_synced_at and returns summary', async () => {
    const limit = vi.fn().mockResolvedValue({
      data: [{ story_id: 'story_1' }, { story_id: 'story_2' }],
      error: null,
    });
    const order = vi.fn().mockReturnValue({ limit });
    const lt = vi.fn().mockReturnValue({ order });
    const select = vi.fn().mockReturnValue({ lt });
    const from = vi.fn().mockReturnValue({ select });
    vi.mocked(createClient).mockResolvedValue({ from } as never);

    vi.mocked(syncStoriesByIdList).mockResolvedValue({
      considered: 2,
      succeeded: 1,
      failed: 1,
      responses: [],
    });

    const response = await POST(jsonRequest({ limit: 10, older_than_minutes: 60 }));

    expect(syncStoriesByIdList).toHaveBeenCalledWith(
      expect.objectContaining({
        supabase: expect.anything(),
        storyIds: ['story_1', 'story_2'],
      }),
    );
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      considered: 2,
      succeeded: 1,
      failed: 1,
    });
  });

  it('allows cron token authorization without user session', async () => {
    process.env.BEEMSPEC_SYNC_CRON_TOKEN = 'cron_secret';
    vi.mocked(requireAuth).mockResolvedValue({
      success: false,
      response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    } as never);

    const limit = vi.fn().mockResolvedValue({ data: [], error: null });
    const order = vi.fn().mockReturnValue({ limit });
    const lt = vi.fn().mockReturnValue({ order });
    const select = vi.fn().mockReturnValue({ lt });
    const from = vi.fn().mockReturnValue({ select });
    vi.mocked(createClient).mockResolvedValue({ from } as never);
    vi.mocked(syncStoriesByIdList).mockResolvedValue({
      considered: 0,
      succeeded: 0,
      failed: 0,
      responses: [],
    });

    const request = new Request('http://localhost/api/integrations/linear/sync/batch', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: 'Bearer cron_secret',
      },
      body: JSON.stringify({ limit: 5 }),
    });

    const response = await POST(request);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ success: true, considered: 0 });
  });

  it('uses provided story_ids instead of stale-link selection', async () => {
    const from = vi.fn();
    vi.mocked(createClient).mockResolvedValue({ from } as never);
    vi.mocked(syncStoriesByIdList).mockResolvedValue({
      considered: 1,
      succeeded: 1,
      failed: 0,
      responses: [],
    });

    const response = await POST(
      jsonRequest({ story_ids: ['d7f34189-5d27-4dc0-b2c5-23d11796add4', 'd7f34189-5d27-4dc0-b2c5-23d11796add4'] }),
    );

    expect(from).not.toHaveBeenCalled();
    expect(syncStoriesByIdList).toHaveBeenCalledWith(
      expect.objectContaining({
        storyIds: ['d7f34189-5d27-4dc0-b2c5-23d11796add4'],
      }),
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ success: true, considered: 1, succeeded: 1, failed: 0 });
  });
});
