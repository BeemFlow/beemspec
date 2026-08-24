import { beforeEach, describe, expect, it, vi } from 'vitest';
import { requireAuth } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { POST } from './route';

vi.mock('@/lib/auth', () => ({
  requireAuth: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}));

vi.mock('@/integrations/linear/reconcile', () => ({
  reconcileStoriesForStoryMap: vi.fn(),
}));

vi.mock('@/integrations/linear/settings', () => ({
  getTeamIdForStoryMap: vi.fn().mockResolvedValue(null),
}));

import { reconcileStoriesForStoryMap } from '@/integrations/linear/reconcile';

const STORY_MAP_ID = 'd7f34189-5d27-4dc0-b2c5-23d11796add4';

describe('story map linear sync route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAuth).mockImplementation(
      async () => ({ success: true, user: { id: 'user_1' }, supabase: await createClient() }) as never,
    );
  });

  it('syncs all stories in the story map and returns summary', async () => {
    const storiesIn = vi.fn().mockResolvedValue({
      data: [
        { id: 'story_1', title: 'Story One' },
        { id: 'story_2', title: 'Story Two' },
      ],
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
              maybeSingle: vi.fn().mockResolvedValue({ data: { linear_project_id: 'project_1' }, error: null }),
            }),
          }),
        };
      }
      return {};
    });

    vi.mocked(createClient).mockResolvedValue({ from } as never);
    vi.mocked(reconcileStoriesForStoryMap).mockResolvedValue({
      considered: 2,
      succeeded: 2,
      failed: 0,
      ignored: 0,
      createdRemote: 1,
      localToRemote: 1,
      remoteToLocal: 0,
      results: [
        {
          storyId: 'story_1',
          success: true,
          action: 'created_remote',
          linearIssueId: 'lin_1',
        },
        {
          storyId: 'story_2',
          success: true,
          action: 'local_to_remote',
          linearIssueId: 'lin_2',
        },
      ],
    });

    const response = await POST(new Request('http://localhost/api/test', { method: 'POST' }), {
      params: Promise.resolve({ id: STORY_MAP_ID }),
    });

    expect(reconcileStoriesForStoryMap).toHaveBeenCalledWith(
      expect.objectContaining({
        supabase: expect.anything(),
        storyMapId: STORY_MAP_ID,
        storyIds: ['story_1', 'story_2'],
      }),
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      stories: {
        considered: 2,
        succeeded: 2,
        failed: 0,
        created_in_linear: 1,
        synced_to_linear: 1,
        synced_from_linear: 0,
      },
      imports: {
        considered: 0,
        imported: 0,
        skipped: 0,
      },
      story_results: [
        {
          story_id: 'story_1',
          title: 'Story One',
          outcome: 'created_in_linear',
          linear_issue_id: 'lin_1',
        },
        {
          story_id: 'story_2',
          title: 'Story Two',
          outcome: 'synced_to_linear',
          linear_issue_id: 'lin_2',
        },
      ],
      import_results: [],
    });
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
              maybeSingle: vi.fn().mockResolvedValue({ data: { linear_project_id: 'project_1' }, error: null }),
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

    expect(reconcileStoriesForStoryMap).not.toHaveBeenCalled();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      stories: {
        considered: 0,
        succeeded: 0,
        failed: 0,
      },
      imports: {
        considered: 0,
        imported: 0,
        skipped: 0,
      },
      story_results: [],
      import_results: [],
    });
  });

  it('includes ignored and failed per-story debug results', async () => {
    const storiesIn = vi.fn().mockResolvedValue({
      data: [
        { id: 'story_1', title: 'Ignored Story' },
        { id: 'story_2', title: 'Failed Story' },
      ],
      error: null,
    });
    const storiesSelect = vi.fn().mockReturnValue({ in: storiesIn });

    const tasksEq = vi.fn().mockResolvedValue({
      data: [{ id: 'task_1' }],
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
              maybeSingle: vi.fn().mockResolvedValue({ data: { linear_project_id: 'project_1' }, error: null }),
            }),
          }),
        };
      }
      return {};
    });

    vi.mocked(createClient).mockResolvedValue({ from } as never);
    vi.mocked(reconcileStoriesForStoryMap).mockResolvedValue({
      considered: 2,
      succeeded: 1,
      failed: 1,
      ignored: 1,
      createdRemote: 0,
      localToRemote: 0,
      remoteToLocal: 0,
      results: [
        {
          storyId: 'story_1',
          success: true,
          action: 'ignored',
          reason: 'Linear integration is not enabled',
        },
        {
          storyId: 'story_2',
          success: false,
          action: 'failed',
          reason: 'sync failed',
        },
      ],
    });

    const response = await POST(new Request('http://localhost/api/test', { method: 'POST' }), {
      params: Promise.resolve({ id: STORY_MAP_ID }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      stories: {
        ignored: 1,
        failed: 1,
      },
      story_results: [
        {
          story_id: 'story_1',
          title: 'Ignored Story',
          outcome: 'ignored',
          reason: 'Linear integration is not enabled',
        },
        {
          story_id: 'story_2',
          title: 'Failed Story',
          outcome: 'failed',
          reason: 'sync failed',
        },
      ],
    });
  });

  it('returns 422 when no project is configured for the map', async () => {
    const from = vi.fn((table: string) => {
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

    expect(reconcileStoriesForStoryMap).not.toHaveBeenCalled();
    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toMatchObject({
      error: 'Manual sync requires a saved Linear project for this story map',
    });
  });
});
