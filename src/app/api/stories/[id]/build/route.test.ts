import { beforeEach, describe, expect, it, vi } from 'vitest';
import { requireAuth } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { createBuildRun, enqueueStoryBuildJob } from '@/orchestration/release-build';
import { runtime } from '@/runtime';
import { POST } from './route';

vi.mock('@/lib/auth', () => ({ requireAuth: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }));
vi.mock('@/orchestration/release-build', async () => {
  const actual = await vi.importActual<typeof import('@/orchestration/release-build')>('@/orchestration/release-build');
  return {
    ...actual,
    createBuildRun: vi.fn(),
    enqueueStoryBuildJob: vi.fn(),
  };
});

const STORY_ID = 'd7f34189-5d27-4dc0-b2c5-23d11796add4';

describe('story build route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAuth).mockResolvedValue({ success: true, user: { id: 'user_1' } } as never);
  });

  it('queues one story build job', async () => {
    const storySingle = vi.fn().mockResolvedValue({
      data: {
        id: STORY_ID,
        release_id: 'release_1',
        task_id: 'task_1',
        title: 'Story 1',
        requirements: 'Req',
        acceptance_criteria: 'AC',
        technical_guidelines: null,
        status: 'ready',
        updated_at: '2026-02-14T11:00:00.000Z',
      },
      error: null,
    });
    const storyEq = vi.fn().mockReturnValue({ single: storySingle });
    const storySelect = vi.fn().mockReturnValue({ eq: storyEq });

    const taskSingle = vi.fn().mockResolvedValue({ data: { activity_id: 'activity_1' }, error: null });
    const taskEq = vi.fn().mockReturnValue({ single: taskSingle });
    const taskSelect = vi.fn().mockReturnValue({ eq: taskEq });

    const activitySingle = vi.fn().mockResolvedValue({ data: { story_map_id: 'story_map_1' }, error: null });
    const activityEq = vi.fn().mockReturnValue({ single: activitySingle });
    const activitySelect = vi.fn().mockReturnValue({ eq: activityEq });

    const tableMap: Record<string, unknown> = {
      stories: { select: storySelect },
      tasks: { select: taskSelect },
      activities: { select: activitySelect },
    };
    const from = vi.fn((table: string) => tableMap[table] ?? {});

    vi.mocked(createClient).mockResolvedValue({ from } as never);

    runtime.storyMap.openCodeSessions = {
      createSession: vi.fn(),
      getSessionById: vi.fn(),
      appendStoryAssignment: vi.fn(),
    };
    vi.mocked(createBuildRun).mockResolvedValue({ data: { id: 'run_1' }, error: null } as never);
    vi.mocked(enqueueStoryBuildJob).mockResolvedValue({
      data: { id: 'job_1', status: 'queued' },
      error: null,
    } as never);

    const response = await POST(new Request('http://localhost/api/test', { method: 'POST' }), {
      params: Promise.resolve({ id: STORY_ID }),
    });

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toMatchObject({
      run_id: 'run_1',
      job_id: 'job_1',
      story_id: STORY_ID,
      status: 'queued',
    });
  });

  it('appends story to an existing build run when build_run_id is provided', async () => {
    const storySingle = vi.fn().mockResolvedValue({
      data: {
        id: STORY_ID,
        release_id: 'release_1',
        task_id: 'task_1',
        title: 'Story 1',
        requirements: 'Req',
        acceptance_criteria: 'AC',
        technical_guidelines: null,
        status: 'ready',
        updated_at: '2026-02-14T11:00:00.000Z',
      },
      error: null,
    });
    const storyEq = vi.fn().mockReturnValue({ single: storySingle });
    const storySelect = vi.fn().mockReturnValue({ eq: storyEq });

    const taskSingle = vi.fn().mockResolvedValue({ data: { activity_id: 'activity_1' }, error: null });
    const taskEq = vi.fn().mockReturnValue({ single: taskSingle });
    const taskSelect = vi.fn().mockReturnValue({ eq: taskEq });

    const activitySingle = vi.fn().mockResolvedValue({ data: { story_map_id: 'story_map_1' }, error: null });
    const activityEq = vi.fn().mockReturnValue({ single: activitySingle });
    const activitySelect = vi.fn().mockReturnValue({ eq: activityEq });

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

    const itemMaybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
    const itemEqStory = vi.fn().mockReturnValue({ maybeSingle: itemMaybeSingle });
    const itemEqRun = vi.fn().mockReturnValue({ eq: itemEqStory });
    const itemSelect = vi.fn().mockReturnValue({ eq: itemEqRun });

    const runUpdateEq = vi.fn().mockResolvedValue({ error: null });
    const runUpdate = vi.fn().mockReturnValue({ eq: runUpdateEq });

    const from = vi.fn((table: string) => {
      if (table === 'stories') return { select: storySelect };
      if (table === 'tasks') return { select: taskSelect };
      if (table === 'activities') return { select: activitySelect };
      if (table === 'build_runs') return { select: targetRunSelect, update: runUpdate };
      if (table === 'build_run_items') return { select: itemSelect };
      return {};
    });

    vi.mocked(createClient).mockResolvedValue({ from } as never);

    runtime.storyMap.openCodeSessions = {
      createSession: vi.fn(),
      getSessionById: vi.fn(),
      appendStoryAssignment: vi.fn(),
    };
    vi.mocked(enqueueStoryBuildJob).mockResolvedValue({
      data: { id: 'job_2', status: 'queued' },
      error: null,
    } as never);

    const response = await POST(
      new Request(`http://localhost/api/stories/${STORY_ID}/build?build_run_id=aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa`, {
        method: 'POST',
      }),
      {
        params: Promise.resolve({ id: STORY_ID }),
      },
    );

    expect(createBuildRun).not.toHaveBeenCalled();
    expect(enqueueStoryBuildJob).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ buildRunId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', storyIds: [STORY_ID] }),
    );
    expect(runUpdate).toHaveBeenCalledWith(expect.objectContaining({ total_items: 4, status: 'queued' }));

    await expect(response.json()).resolves.toMatchObject({
      run_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      build_run_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      job_id: 'job_2',
      story_id: STORY_ID,
      status: 'queued',
      appended_item: true,
    });
  });
});
