import { beforeEach, describe, expect, it, vi } from 'vitest';
import { enqueueStoryLinearSyncJob } from '@/build-runs/queue';
import { requireAuth } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { runtime } from '@/runtime';
import { POST } from './route';

vi.mock('@/lib/auth', () => ({ requireAuth: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }));
vi.mock('@/build-runs/queue', () => ({ enqueueStoryLinearSyncJob: vi.fn() }));

const STORY_ID = 'd7f34189-5d27-4dc0-b2c5-23d11796add4';

describe('story manual linear sync route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAuth).mockResolvedValue({ success: true, user: { id: 'user_1' } } as never);
  });

  it('queues story linear sync job', async () => {
    const storySingle = vi.fn().mockResolvedValue({
      data: {
        id: STORY_ID,
        task_id: 'task_1',
        title: 'Story 1',
        requirements: 'Req',
        acceptance_criteria: 'AC',
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

    runtime.storyMap.linearIssueSync = { getIssueById: vi.fn(), createIssue: vi.fn(), updateIssue: vi.fn() };
    vi.mocked(enqueueStoryLinearSyncJob).mockResolvedValue({
      data: { id: 'job_1', status: 'queued' },
      error: null,
    } as never);

    const response = await POST(new Request('http://localhost/api/test', { method: 'POST' }), {
      params: Promise.resolve({ id: STORY_ID }),
    });

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toMatchObject({
      story_id: STORY_ID,
      job_id: 'job_1',
      status: 'queued',
    });
  });
});
