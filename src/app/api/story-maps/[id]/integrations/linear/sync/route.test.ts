import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getLinearIssueSync } from '@/integrations/linear/helpers';
import { requireAuth } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { POST } from './route';

vi.mock('@/lib/auth', () => ({
  requireAuth: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}));

vi.mock('@/integrations/linear/helpers', () => ({
  getLinearIssueSync: vi.fn(),
}));

vi.mock('@/app/api/integrations/linear/sync/route', () => ({
  syncStoriesByIdList: vi.fn(),
}));

import { syncStoriesByIdList } from '@/app/api/integrations/linear/sync/route';

const STORY_MAP_ID = 'd7f34189-5d27-4dc0-b2c5-23d11796add4';

describe('story map linear sync route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAuth).mockResolvedValue({ success: true, user: { id: 'user_1' } } as never);
    vi.mocked(getLinearIssueSync).mockReturnValue({
      getIssueById: vi.fn(),
      createIssue: vi.fn(),
      updateIssue: vi.fn(),
      deleteIssue: vi.fn(),
    });
  });

  it('syncs all stories in the story map and returns summary', async () => {
    const storiesIn = vi.fn().mockResolvedValue({
      data: [{ id: 'story_1' }, { id: 'story_2' }],
      error: null,
    });
    const storiesSelect = vi.fn().mockReturnValue({ in: storiesIn });

    const tasksEq = vi.fn().mockResolvedValue({
      data: [{ id: 'task_1' }, { id: 'task_2' }],
      error: null,
    });
    const tasksSelect = vi.fn().mockReturnValue({ eq: tasksEq });

    const from = vi.fn((table: string) => {
      if (table === 'tasks') return { select: tasksSelect };
      if (table === 'stories') return { select: storiesSelect };
      if (table === 'story_map_integration_settings') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: { linear_project_id: null }, error: null }),
            }),
          }),
        };
      }
      return {};
    });

    vi.mocked(createClient).mockResolvedValue({ from } as never);
    vi.mocked(syncStoriesByIdList).mockResolvedValue({
      considered: 2,
      succeeded: 2,
      failed: 0,
      responses: [],
    });

    const response = await POST(new Request('http://localhost/api/test', { method: 'POST' }), {
      params: Promise.resolve({ id: STORY_MAP_ID }),
    });

    expect(syncStoriesByIdList).toHaveBeenCalledWith(
      expect.objectContaining({
        supabase: expect.anything(),
        fallbackIssueSync: expect.anything(),
        storyIds: ['story_1', 'story_2'],
      }),
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ success: true, considered: 2, succeeded: 2, failed: 0 });
  });

  it('returns zero summary when no tasks exist in map', async () => {
    const tasksEq = vi.fn().mockResolvedValue({ data: [], error: null });
    const tasksSelect = vi.fn().mockReturnValue({ eq: tasksEq });

    const from = vi.fn((table: string) => {
      if (table === 'tasks') return { select: tasksSelect };
      if (table === 'story_map_integration_settings') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: { linear_project_id: null }, error: null }),
            }),
          }),
        };
      }
      return {};
    });

    vi.mocked(createClient).mockResolvedValue({ from } as never);

    const response = await POST(new Request('http://localhost/api/test', { method: 'POST' }), {
      params: Promise.resolve({ id: STORY_MAP_ID }),
    });

    expect(syncStoriesByIdList).not.toHaveBeenCalled();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ success: true, considered: 0, succeeded: 0, failed: 0 });
  });
});
