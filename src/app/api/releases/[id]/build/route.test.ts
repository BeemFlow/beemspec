import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createBuildRunWithStoryJob, enqueueBuildRunStoriesAtomically } from '@/build-runs';
import { requireAuth } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { runtime } from '@/runtime';
import { POST } from './route';

vi.mock('@/lib/auth', () => ({ requireAuth: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }));
vi.mock('@/build-runs', () => ({
  createBuildRunWithStoryJob: vi.fn(),
  enqueueBuildRunStoriesAtomically: vi.fn(),
}));

const RELEASE_ID = 'd7f34189-5d27-4dc0-b2c5-23d11796add4';

describe('release run route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAuth).mockResolvedValue({ success: true, user: { id: 'user_1' } } as never);
  });

  it('creates queued run and enqueues worker job', async () => {
    const releaseSingle = vi
      .fn()
      .mockResolvedValue({ data: { id: RELEASE_ID, story_map_id: 'story_map_1' }, error: null });
    const releaseEq = vi.fn().mockReturnValue({ single: releaseSingle });
    const releaseSelect = vi.fn().mockReturnValue({ eq: releaseEq });

    const storyCountEq = vi
      .fn()
      .mockReturnValue({ order: vi.fn().mockResolvedValue({ data: [{ id: 's1' }, { id: 's2' }], error: null }) });
    const storyCountSelect = vi.fn().mockReturnValue({ eq: storyCountEq });

    const activeRunMaybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
    const activeRunLimit = vi.fn().mockReturnValue({ maybeSingle: activeRunMaybeSingle });
    const activeRunOrder = vi.fn().mockReturnValue({ limit: activeRunLimit });
    const activeRunIn = vi.fn().mockReturnValue({ order: activeRunOrder });
    const activeRunEq = vi.fn().mockReturnValue({ in: activeRunIn });
    const activeRunSelect = vi.fn().mockReturnValue({ eq: activeRunEq });

    const from = vi.fn((table: string) => {
      if (table === 'releases') return { select: releaseSelect };
      if (table === 'stories') return { select: storyCountSelect };
      if (table === 'build_runs') return { select: activeRunSelect };
      return {};
    });

    vi.mocked(createClient).mockResolvedValue({ from } as never);
    vi.mocked(createBuildRunWithStoryJob).mockResolvedValue({
      data: {
        run_id: 'run_1',
        job_id: 'job_1',
        queued_story_ids: ['s1', 's2'],
        queued_items: 2,
      },
      error: null,
    } as never);
    runtime.storyMap.openCodeSessions = {
      createSession: vi.fn(),
      getSessionById: vi.fn(),
      appendStoryAssignment: vi.fn(),
    };

    const response = await POST(new Request('http://localhost/api/test', { method: 'POST' }), {
      params: Promise.resolve({ id: RELEASE_ID }),
    });

    expect(createBuildRunWithStoryJob).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ releaseId: RELEASE_ID, storyIds: ['s1', 's2'] }),
    );
    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toMatchObject({ run_id: 'run_1', job_id: 'job_1', status: 'queued' });
  });

  it('reuses active run and enqueues only appended stories', async () => {
    const releaseSingle = vi
      .fn()
      .mockResolvedValue({ data: { id: RELEASE_ID, story_map_id: 'story_map_1' }, error: null });
    const releaseEq = vi.fn().mockReturnValue({ single: releaseSingle });
    const releaseSelect = vi.fn().mockReturnValue({ eq: releaseEq });

    const storyCountEq = vi
      .fn()
      .mockReturnValue({ order: vi.fn().mockResolvedValue({ data: [{ id: 's1' }, { id: 's2' }], error: null }) });
    const storyCountSelect = vi.fn().mockReturnValue({ eq: storyCountEq });

    const activeRunMaybeSingle = vi.fn().mockResolvedValue({
      data: { id: 'run_existing', story_map_id: 'story_map_1', total_items: 1, status: 'running' },
      error: null,
    });
    const activeRunLimit = vi.fn().mockReturnValue({ maybeSingle: activeRunMaybeSingle });
    const activeRunOrder = vi.fn().mockReturnValue({ limit: activeRunLimit });
    const activeRunIn = vi.fn().mockReturnValue({ order: activeRunOrder });
    const activeRunEq = vi.fn().mockReturnValue({ in: activeRunIn });
    const activeRunSelect = vi.fn().mockReturnValue({ eq: activeRunEq });

    const from = vi.fn((table: string) => {
      if (table === 'releases') return { select: releaseSelect };
      if (table === 'stories') return { select: storyCountSelect };
      if (table === 'build_runs') return { select: activeRunSelect };
      return {};
    });

    vi.mocked(createClient).mockResolvedValue({ from } as never);
    vi.mocked(enqueueBuildRunStoriesAtomically).mockResolvedValue({
      data: {
        build_run_id: 'run_existing',
        job_id: 'job_append_1',
        queued_story_ids: ['s2'],
        queued_items: 1,
        appended_items: 1,
      },
      error: null,
    } as never);
    runtime.storyMap.openCodeSessions = {
      createSession: vi.fn(),
      getSessionById: vi.fn(),
      appendStoryAssignment: vi.fn(),
    };

    const response = await POST(new Request('http://localhost/api/test', { method: 'POST' }), {
      params: Promise.resolve({ id: RELEASE_ID }),
    });

    expect(createBuildRunWithStoryJob).not.toHaveBeenCalled();
    expect(enqueueBuildRunStoriesAtomically).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ buildRunId: 'run_existing', storyIds: ['s1', 's2'], queueExisting: false }),
    );
    await expect(response.json()).resolves.toMatchObject({
      run_id: 'run_existing',
      job_id: 'job_append_1',
      status: 'queued',
      appended_items: 1,
    });
  });

  it('returns 503 when opencode integration disabled', async () => {
    runtime.storyMap.openCodeSessions = null;

    const response = await POST(new Request('http://localhost/api/test', { method: 'POST' }), {
      params: Promise.resolve({ id: RELEASE_ID }),
    });

    expect(response.status).toBe(503);
  });

  it('returns completed run when release has no stories', async () => {
    const releaseSingle = vi
      .fn()
      .mockResolvedValue({ data: { id: RELEASE_ID, story_map_id: 'story_map_1' }, error: null });
    const releaseEq = vi.fn().mockReturnValue({ single: releaseSingle });
    const releaseSelect = vi.fn().mockReturnValue({ eq: releaseEq });

    const storyCountEq = vi.fn().mockReturnValue({ order: vi.fn().mockResolvedValue({ data: [], error: null }) });
    const storyCountSelect = vi.fn().mockReturnValue({ eq: storyCountEq });

    const activeRunMaybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
    const activeRunLimit = vi.fn().mockReturnValue({ maybeSingle: activeRunMaybeSingle });
    const activeRunOrder = vi.fn().mockReturnValue({ limit: activeRunLimit });
    const activeRunIn = vi.fn().mockReturnValue({ order: activeRunOrder });
    const activeRunEq = vi.fn().mockReturnValue({ in: activeRunIn });
    const activeRunSelect = vi.fn().mockReturnValue({ eq: activeRunEq });

    const from = vi.fn((table: string) => {
      if (table === 'releases') return { select: releaseSelect };
      if (table === 'stories') return { select: storyCountSelect };
      if (table === 'build_runs') return { select: activeRunSelect };
      return {};
    });

    vi.mocked(createClient).mockResolvedValue({ from } as never);
    vi.mocked(createBuildRunWithStoryJob).mockResolvedValue({
      data: {
        run_id: 'run_empty',
        job_id: null,
        queued_story_ids: [],
        queued_items: 0,
      },
      error: null,
    } as never);
    runtime.storyMap.openCodeSessions = {
      createSession: vi.fn(),
      getSessionById: vi.fn(),
      appendStoryAssignment: vi.fn(),
    };

    const response = await POST(new Request('http://localhost/api/test', { method: 'POST' }), {
      params: Promise.resolve({ id: RELEASE_ID }),
    });

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toMatchObject({ run_id: 'run_empty', status: 'completed' });
  });
});
