import { beforeEach, describe, expect, it, vi } from 'vitest';
import { requireAuth } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { createReleaseRun, enqueueStoryBuildJob } from '@/orchestration/release-build';
import { runtime } from '@/runtime';
import { POST } from './route';

vi.mock('@/lib/auth', () => ({ requireAuth: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }));
vi.mock('@/orchestration/release-build', () => ({
  createReleaseRun: vi.fn(),
  enqueueStoryBuildJob: vi.fn(),
}));

const RELEASE_ID = 'd7f34189-5d27-4dc0-b2c5-23d11796add4';

describe('release build route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAuth).mockResolvedValue({ success: true, user: { id: 'user_1' } } as never);
  });

  it('creates queued run and enqueues orchestration job', async () => {
    const releaseSingle = vi
      .fn()
      .mockResolvedValue({ data: { id: RELEASE_ID, story_map_id: 'story_map_1' }, error: null });
    const releaseEq = vi.fn().mockReturnValue({ single: releaseSingle });
    const releaseSelect = vi.fn().mockReturnValue({ eq: releaseEq });

    const storyCountEq = vi
      .fn()
      .mockReturnValue({ order: vi.fn().mockResolvedValue({ data: [{ id: 's1' }, { id: 's2' }], error: null }) });
    const storyCountSelect = vi.fn().mockReturnValue({ eq: storyCountEq });

    const from = vi.fn((table: string) => {
      if (table === 'releases') return { select: releaseSelect };
      if (table === 'stories') return { select: storyCountSelect };
      return {};
    });

    vi.mocked(createClient).mockResolvedValue({ from } as never);
    vi.mocked(createReleaseRun).mockResolvedValue({ data: { id: 'run_1' }, error: null } as never);
    vi.mocked(enqueueStoryBuildJob).mockResolvedValue({
      data: { id: 'job_1', status: 'queued' },
      error: null,
    } as never);
    runtime.storyMap.openCodeSessions = { createSession: vi.fn(), getSessionById: vi.fn() };

    const response = await POST(new Request('http://localhost/api/test', { method: 'POST' }), {
      params: Promise.resolve({ id: RELEASE_ID }),
    });

    expect(enqueueStoryBuildJob).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ releaseId: RELEASE_ID, releaseRunId: 'run_1' }),
    );
    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toMatchObject({ run_id: 'run_1', job_id: 'job_1', status: 'queued' });
  });

  it('returns 503 when opencode integration disabled', async () => {
    runtime.storyMap.openCodeSessions = null;

    const response = await POST(new Request('http://localhost/api/test', { method: 'POST' }), {
      params: Promise.resolve({ id: RELEASE_ID }),
    });

    expect(response.status).toBe(503);
  });
});
