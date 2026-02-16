import { NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getLinearIssueSync } from '@/integrations/linear/issue-sync';
import { requireAuth } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { POST } from './route';

vi.mock('@/lib/auth', () => ({
  requireAuth: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}));

vi.mock('@/integrations/linear/issue-sync', () => ({
  getLinearIssueSync: vi.fn(),
}));

vi.mock('@/app/api/integrations/linear/reconcile/route', () => ({
  reconcileStoryById: vi.fn(),
}));

import { reconcileStoryById } from '@/app/api/integrations/linear/reconcile/route';

function jsonRequest(body: unknown): Request {
  return new Request('http://localhost/api/integrations/linear/reconcile/batch', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('linear batch reconcile route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.BEEMSPEC_RECONCILE_CRON_TOKEN;
    vi.mocked(requireAuth).mockResolvedValue({ success: true, user: { id: 'user_1' } } as never);
    vi.mocked(getLinearIssueSync).mockReturnValue({
      getIssueById: vi.fn(),
      createIssue: vi.fn(),
      updateIssue: vi.fn(),
    });
  });

  it('reconciles stories selected by stale last_synced_at and returns summary', async () => {
    const limit = vi.fn().mockResolvedValue({
      data: [{ story_id: 'story_1' }, { story_id: 'story_2' }],
      error: null,
    });
    const order = vi.fn().mockReturnValue({ limit });
    const lt = vi.fn().mockReturnValue({ order });
    const select = vi.fn().mockReturnValue({ lt });
    const from = vi.fn().mockReturnValue({ select });
    vi.mocked(createClient).mockResolvedValue({ from } as never);

    vi.mocked(reconcileStoryById)
      .mockResolvedValueOnce(NextResponse.json({ success: true }, { status: 200 }))
      .mockResolvedValueOnce(NextResponse.json({ error: 'failed' }, { status: 500 }));

    const response = await POST(jsonRequest({ limit: 10, older_than_minutes: 60 }));

    expect(reconcileStoryById).toHaveBeenCalledTimes(2);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      considered: 2,
      succeeded: 1,
      failed: 1,
    });
  });

  it('allows cron token authorization without user session', async () => {
    process.env.BEEMSPEC_RECONCILE_CRON_TOKEN = 'cron_secret';
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

    const request = new Request('http://localhost/api/integrations/linear/reconcile/batch', {
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
});
