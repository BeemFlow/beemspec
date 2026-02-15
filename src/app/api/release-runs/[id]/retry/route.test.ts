import { beforeEach, describe, expect, it, vi } from 'vitest';
import { requireAuth } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { enqueueStoryBuildJob } from '@/orchestration/release-build';
import { runtime } from '@/runtime';
import { POST } from './route';

vi.mock('@/lib/auth', () => ({ requireAuth: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }));
vi.mock('@/orchestration/release-build', () => ({ enqueueStoryBuildJob: vi.fn() }));

const RUN_ID = 'd7f34189-5d27-4dc0-b2c5-23d11796add4';

describe('release run retry route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAuth).mockResolvedValue({ success: true, user: { id: 'user_1' } } as never);
    runtime.storyMap.openCodeSessions = { createSession: vi.fn(), getSessionById: vi.fn() };
  });

  it('queues retry job for failed run items', async () => {
    const runSingle = vi.fn().mockResolvedValue({
      data: { id: RUN_ID, release_id: 'release_1', story_map_id: 'story_map_1', total_items: 2 },
      error: null,
    });
    const runEq = vi.fn().mockReturnValue({ single: runSingle });

    const failedItemsEqStatus = vi.fn().mockResolvedValue({ data: [{ story_id: 'story_1' }], error: null });
    const failedItemsEqRun = vi.fn().mockReturnValue({ eq: failedItemsEqStatus });
    const failedItemsSelect = vi.fn().mockReturnValue({ eq: failedItemsEqRun });

    const runUpdateEq = vi.fn().mockResolvedValue({ error: null });
    const runUpdate = vi.fn().mockReturnValue({ eq: runUpdateEq });

    const from = vi.fn((table: string) => {
      if (table === 'release_runs') return { select: () => ({ eq: runEq }), update: runUpdate };
      if (table === 'release_run_items') return { select: failedItemsSelect };
      return {};
    });

    vi.mocked(createClient).mockResolvedValue({ from } as never);
    vi.mocked(enqueueStoryBuildJob).mockResolvedValue({
      data: { id: 'job_1', status: 'queued' },
      error: null,
    } as never);

    const response = await POST(new Request('http://localhost/api/test', { method: 'POST' }), {
      params: Promise.resolve({ id: RUN_ID }),
    });

    expect(response.status).toBe(202);
    expect(enqueueStoryBuildJob).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ releaseRunId: RUN_ID, storyIds: ['story_1'] }),
    );
    await expect(response.json()).resolves.toMatchObject({ run_id: RUN_ID, job_id: 'job_1', status: 'queued' });
  });
});
