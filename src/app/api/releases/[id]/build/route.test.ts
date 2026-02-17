import { beforeEach, describe, expect, it, vi } from 'vitest';
import { appendBuildRunItems, createBuildRunWithItems, processBuildRunById } from '@/build-runs/processor';
import { createOpenCodeSessions } from '@/integrations/opencode/session';
import { requireAuth } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { POST } from './route';

vi.mock('@/lib/auth', () => ({ requireAuth: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }));
vi.mock('@/build-runs/processor', () => ({
  createBuildRunWithItems: vi.fn(),
  appendBuildRunItems: vi.fn(),
  processBuildRunById: vi.fn(),
}));
vi.mock('@/integrations/opencode/session', () => ({ createOpenCodeSessions: vi.fn() }));

const RELEASE_ID = 'd7f34189-5d27-4dc0-b2c5-23d11796add4';

describe('release run route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAuth).mockResolvedValue({ success: true, user: { id: 'user_1' } } as never);
    vi.mocked(createOpenCodeSessions).mockReturnValue({
      createSession: vi.fn(),
      getSessionById: vi.fn(),
      appendStoryAssignment: vi.fn(),
      startSession: vi.fn(),
    });
  });

  it('creates run and processes inline', async () => {
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
    vi.mocked(createBuildRunWithItems).mockResolvedValue({
      data: {
        run_id: 'run_1',
        created_story_ids: ['s1', 's2'],
        total_items: 2,
      },
      error: null,
    } as never);
    vi.mocked(processBuildRunById).mockResolvedValue({
      status: 'completed',
      totalItems: 2,
      completedItems: 2,
      failedItems: 0,
    });

    const response = await POST(new Request('http://localhost/api/test', { method: 'POST' }), {
      params: Promise.resolve({ id: RELEASE_ID }),
    });

    expect(createBuildRunWithItems).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ releaseId: RELEASE_ID, storyIds: ['s1', 's2'] }),
    );
    expect(processBuildRunById).toHaveBeenCalled();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ run_id: 'run_1', status: 'completed' });
  });

  it('appends to active run and processes inline', async () => {
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
    vi.mocked(appendBuildRunItems).mockResolvedValue({
      data: {
        appended_items: 1,
        total_items: 2,
      },
      error: null,
    } as never);
    vi.mocked(processBuildRunById).mockResolvedValue({
      status: 'completed',
      totalItems: 2,
      completedItems: 2,
      failedItems: 0,
    });

    const response = await POST(new Request('http://localhost/api/test', { method: 'POST' }), {
      params: Promise.resolve({ id: RELEASE_ID }),
    });

    expect(createBuildRunWithItems).not.toHaveBeenCalled();
    expect(appendBuildRunItems).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ buildRunId: 'run_existing', storyIds: ['s1', 's2'] }),
    );
    expect(processBuildRunById).toHaveBeenCalled();
    await expect(response.json()).resolves.toMatchObject({
      run_id: 'run_existing',
      status: 'completed',
      appended_items: 1,
    });
  });

  it('returns 503 when opencode integration disabled', async () => {
    vi.mocked(createOpenCodeSessions).mockReturnValue(null);

    const response = await POST(new Request('http://localhost/api/test', { method: 'POST' }), {
      params: Promise.resolve({ id: RELEASE_ID }),
    });

    expect(response.status).toBe(503);
  });

  it('returns completed when release has no stories', async () => {
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
    vi.mocked(createBuildRunWithItems).mockResolvedValue({
      data: {
        run_id: 'run_empty',
        created_story_ids: [],
        total_items: 0,
      },
      error: null,
    } as never);

    const response = await POST(new Request('http://localhost/api/test', { method: 'POST' }), {
      params: Promise.resolve({ id: RELEASE_ID }),
    });

    expect(response.status).toBe(200);
    expect(processBuildRunById).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toMatchObject({ run_id: 'run_empty', status: 'completed' });
  });
});
