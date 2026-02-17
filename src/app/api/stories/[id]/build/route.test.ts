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
  loadStoryWithStoryMap: vi.fn(),
}));
vi.mock('@/integrations/opencode/session', () => ({ createOpenCodeSessions: vi.fn() }));

const STORY_ID = 'd7f34189-5d27-4dc0-b2c5-23d11796add4';

describe('story build route', () => {
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

  it('creates run for one story and processes inline', async () => {
    const { loadStoryWithStoryMap } = await import('@/build-runs/processor');
    vi.mocked(loadStoryWithStoryMap).mockResolvedValue({
      ok: true,
      data: {
        story: {
          id: STORY_ID,
          release_id: 'release_1',
          task_id: 'task_1',
          title: 'Story 1',
          requirements: 'Req',
          acceptance_criteria: 'AC',
          technical_guidelines: null,
        } as never,
        storyMapId: 'story_map_1',
      },
    });

    vi.mocked(createClient).mockResolvedValue({ from: vi.fn() } as never);
    vi.mocked(createBuildRunWithItems).mockResolvedValue({
      data: {
        run_id: 'run_1',
        created_story_ids: [STORY_ID],
        total_items: 1,
      },
      error: null,
    } as never);
    vi.mocked(processBuildRunById).mockResolvedValue({
      status: 'completed',
      totalItems: 1,
      completedItems: 1,
      failedItems: 0,
    });

    const response = await POST(new Request('http://localhost/api/test', { method: 'POST' }), {
      params: Promise.resolve({ id: STORY_ID }),
    });

    expect(response.status).toBe(200);
    expect(processBuildRunById).toHaveBeenCalled();
    await expect(response.json()).resolves.toMatchObject({
      run_id: 'run_1',
      story_id: STORY_ID,
      status: 'completed',
    });
  });

  it('appends story to an existing build run', async () => {
    const { loadStoryWithStoryMap } = await import('@/build-runs/processor');
    vi.mocked(loadStoryWithStoryMap).mockResolvedValue({
      ok: true,
      data: {
        story: {
          id: STORY_ID,
          release_id: 'release_1',
          task_id: 'task_1',
          title: 'Story 1',
          requirements: 'Req',
          acceptance_criteria: 'AC',
          technical_guidelines: null,
        } as never,
        storyMapId: 'story_map_1',
      },
    });

    const targetRunSingle = vi.fn().mockResolvedValue({
      data: {
        id: 'run_existing',
        release_id: 'release_1',
        story_map_id: 'story_map_1',
        total_items: 3,
        status: 'running',
      },
      error: null,
    });
    const targetRunEq = vi.fn().mockReturnValue({ single: targetRunSingle });
    const targetRunSelect = vi.fn().mockReturnValue({ eq: targetRunEq });

    const from = vi.fn((table: string) => {
      if (table === 'build_runs') return { select: targetRunSelect };
      return {};
    });

    vi.mocked(createClient).mockResolvedValue({ from } as never);
    vi.mocked(appendBuildRunItems).mockResolvedValue({
      data: {
        appended_items: 1,
        total_items: 4,
      },
      error: null,
    } as never);
    vi.mocked(processBuildRunById).mockResolvedValue({
      status: 'completed',
      totalItems: 4,
      completedItems: 4,
      failedItems: 0,
    });

    const response = await POST(
      new Request(`http://localhost/api/stories/${STORY_ID}/build?build_run_id=aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa`, {
        method: 'POST',
      }),
      {
        params: Promise.resolve({ id: STORY_ID }),
      },
    );

    expect(createBuildRunWithItems).not.toHaveBeenCalled();
    expect(appendBuildRunItems).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        buildRunId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        storyIds: [STORY_ID],
      }),
    );
    expect(processBuildRunById).toHaveBeenCalled();

    await expect(response.json()).resolves.toMatchObject({
      run_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      build_run_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      story_id: STORY_ID,
      status: 'completed',
      appended_item: true,
    });
  });
});
