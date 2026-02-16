import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createBuildRunWithStoryJob, enqueueBuildRunStoriesAtomically } from '@/build-runs/queue';
import { getOpenCodeSessions } from '@/integrations/opencode/session';
import { requireAuth } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { POST } from './route';

vi.mock('@/lib/auth', () => ({ requireAuth: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }));
vi.mock('@/build-runs/queue', () => ({
  createBuildRunWithStoryJob: vi.fn(),
  enqueueBuildRunStoriesAtomically: vi.fn(),
}));
vi.mock('@/integrations/opencode/session', () => ({ getOpenCodeSessions: vi.fn() }));

const STORY_ID = 'd7f34189-5d27-4dc0-b2c5-23d11796add4';

describe('story build route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAuth).mockResolvedValue({ success: true, user: { id: 'user_1' } } as never);
    vi.mocked(getOpenCodeSessions).mockReturnValue({
      createSession: vi.fn(),
      getSessionById: vi.fn(),
      appendStoryAssignment: vi.fn(),
    });
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

    vi.mocked(createBuildRunWithStoryJob).mockResolvedValue({
      data: {
        run_id: 'run_1',
        job_id: 'job_1',
        queued_story_ids: [STORY_ID],
        queued_items: 1,
      },
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

    const from = vi.fn((table: string) => {
      if (table === 'stories') return { select: storySelect };
      if (table === 'tasks') return { select: taskSelect };
      if (table === 'activities') return { select: activitySelect };
      if (table === 'build_runs') return { select: targetRunSelect };
      return {};
    });

    vi.mocked(createClient).mockResolvedValue({ from } as never);

    vi.mocked(enqueueBuildRunStoriesAtomically).mockResolvedValue({
      data: {
        build_run_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        job_id: 'job_2',
        queued_story_ids: [STORY_ID],
        queued_items: 1,
        appended_items: 1,
      },
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

    expect(createBuildRunWithStoryJob).not.toHaveBeenCalled();
    expect(enqueueBuildRunStoriesAtomically).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        buildRunId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        storyIds: [STORY_ID],
        queueExisting: true,
      }),
    );

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
