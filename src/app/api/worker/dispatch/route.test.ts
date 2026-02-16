import { beforeEach, describe, expect, it, vi } from 'vitest';
import { dispatchQueuedWorkerJobs } from '@/build-runs/queue';
import { requireAuth } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { POST } from './route';

vi.mock('@/lib/auth', () => ({ requireAuth: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }));
vi.mock('@/build-runs/queue', () => ({ dispatchQueuedWorkerJobs: vi.fn() }));

describe('worker dispatch route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.BEEMSPEC_WORKER_TOKEN;
    vi.mocked(requireAuth).mockResolvedValue({ success: true, user: { id: 'user_1' } } as never);
  });

  it('dispatches queued jobs', async () => {
    vi.mocked(createClient).mockResolvedValue({ from: vi.fn() } as never);
    vi.mocked(dispatchQueuedWorkerJobs).mockResolvedValue({
      considered: 2,
      claimed: 2,
      completed: 2,
      requeued: 0,
      failed: 0,
    });

    const response = await POST(new Request('http://localhost/api/worker/dispatch?limit=2', { method: 'POST' }));

    await expect(response.json()).resolves.toMatchObject({ ok: true, claimed: 2 });
  });

  it('accepts worker token auth path', async () => {
    process.env.BEEMSPEC_WORKER_TOKEN = 'worker_123';
    vi.mocked(createClient).mockResolvedValue({ from: vi.fn() } as never);
    vi.mocked(dispatchQueuedWorkerJobs).mockResolvedValue({
      considered: 1,
      claimed: 1,
      completed: 1,
      requeued: 0,
      failed: 0,
    });

    await POST(
      new Request('http://localhost/api/worker/dispatch', {
        method: 'POST',
        headers: { authorization: 'Bearer worker_123' },
      }),
    );

    expect(requireAuth).not.toHaveBeenCalled();
  });
});
