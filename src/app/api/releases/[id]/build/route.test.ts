import { beforeEach, describe, expect, it, vi } from 'vitest';
import { domainRuntime } from '@/domains/runtime';
import { requireAuth } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { dispatchReleaseBuildJobById, enqueueReleaseBuildJob } from '@/orchestration/release-runner/jobs';
import { POST } from './route';

vi.mock('@/lib/auth', () => ({ requireAuth: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }));
vi.mock('@/orchestration/release-runner/jobs', () => ({
  enqueueReleaseBuildJob: vi.fn(),
  dispatchReleaseBuildJobById: vi.fn(),
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

    const storyCountEq = vi.fn().mockResolvedValue({ count: 2, error: null });
    const storyCountSelect = vi.fn().mockReturnValue({ eq: storyCountEq });

    const runSingle = vi.fn().mockResolvedValue({ data: { id: 'run_1' }, error: null });
    const runInsertSelect = vi.fn().mockReturnValue({ single: runSingle });
    const runInsert = vi.fn().mockReturnValue({ select: runInsertSelect });

    const from = vi.fn((table: string) => {
      if (table === 'releases') return { select: releaseSelect };
      if (table === 'stories') return { select: storyCountSelect };
      if (table === 'release_runs') return { insert: runInsert };
      return {};
    });

    vi.mocked(createClient).mockResolvedValue({ from } as never);
    vi.mocked(enqueueReleaseBuildJob).mockResolvedValue({
      data: { id: 'job_1', status: 'queued' },
      error: null,
    } as never);
    vi.mocked(dispatchReleaseBuildJobById).mockResolvedValue({ claimed: true, completed: true } as never);

    domainRuntime.storyMap.linearIssueSync = {
      getIssueById: vi.fn(),
      createIssue: vi.fn(),
      updateIssue: vi.fn(),
    };

    const response = await POST(new Request('http://localhost/api/test', { method: 'POST' }), {
      params: Promise.resolve({ id: RELEASE_ID }),
    });

    expect(enqueueReleaseBuildJob).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ releaseId: RELEASE_ID, releaseRunId: 'run_1' }),
    );
    await expect(response.json()).resolves.toMatchObject({ run_id: 'run_1', job_id: 'job_1', status: 'queued' });
  });

  it('returns 503 when linear integration disabled', async () => {
    domainRuntime.storyMap.linearIssueSync = null;

    const response = await POST(new Request('http://localhost/api/test', { method: 'POST' }), {
      params: Promise.resolve({ id: RELEASE_ID }),
    });

    expect(response.status).toBe(503);
  });
});
