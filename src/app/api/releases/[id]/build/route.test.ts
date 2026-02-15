import { beforeEach, describe, expect, it, vi } from 'vitest';
import { domainRuntime } from '@/domains/runtime';
import { requireAuth } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { POST } from './route';

vi.mock('@/lib/auth', () => ({
  requireAuth: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}));

const RELEASE_ID = 'd7f34189-5d27-4dc0-b2c5-23d11796add4';

function createBuildClient(stories: Array<Record<string, unknown>>) {
  const releaseSingle = vi.fn().mockResolvedValue({
    data: { id: RELEASE_ID, story_map_id: 'story_map_1' },
    error: null,
  });
  const releaseEq = vi.fn().mockReturnValue({ single: releaseSingle });
  const releaseSelect = vi.fn().mockReturnValue({ eq: releaseEq });

  const storiesOrder = vi.fn().mockResolvedValue({ data: stories, error: null });
  const storiesEq = vi.fn().mockReturnValue({ order: storiesOrder });
  const storiesSelect = vi.fn().mockReturnValue({ eq: storiesEq });

  const runSingle = vi.fn().mockResolvedValue({ data: { id: 'run_1', status: 'running' }, error: null });
  const runInsertSelect = vi.fn().mockReturnValue({ single: runSingle });
  const runInsert = vi.fn().mockReturnValue({ select: runInsertSelect });
  const runUpdateEq = vi.fn().mockResolvedValue({ error: null });
  const runUpdate = vi.fn().mockReturnValue({ eq: runUpdateEq });

  const runItemsInsert = vi.fn().mockResolvedValue({ error: null });

  const linkMaybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
  const linkSelectEq = vi.fn().mockReturnValue({ maybeSingle: linkMaybeSingle });
  const linkSelect = vi.fn().mockReturnValue({ eq: linkSelectEq });
  const linkUpsertSingle = vi.fn().mockResolvedValue({
    data: {
      story_id: stories[0]?.id ?? 'story_1',
      linear_issue_id: 'lin_1',
      linear_issue_identifier: 'ENG-1',
      last_local_updated_at: null,
      last_linear_updated_at: null,
    },
    error: null,
  });
  const linkUpsertSelect = vi.fn().mockReturnValue({ single: linkUpsertSingle });
  const linkUpsert = vi.fn().mockReturnValue({ select: linkUpsertSelect });

  const storyMapSingle = vi.fn().mockResolvedValue({ data: { team_id: 'team_1' }, error: null });
  const storyMapEq = vi.fn().mockReturnValue({ single: storyMapSingle });
  const storyMapSelect = vi.fn().mockReturnValue({ eq: storyMapEq });

  const settingsMaybeSingle = vi.fn().mockResolvedValue({
    data: { linear_team_id: 'team_linear_1', linear_project_id: null, linear_state_id: null },
    error: null,
  });
  const settingsEq = vi.fn().mockReturnValue({ maybeSingle: settingsMaybeSingle });
  const settingsSelect = vi.fn().mockReturnValue({ eq: settingsEq });

  const from = vi.fn((table: string) => {
    if (table === 'releases') return { select: releaseSelect };
    if (table === 'stories') return { select: storiesSelect };
    if (table === 'release_runs') return { insert: runInsert, update: runUpdate };
    if (table === 'release_run_items') return { insert: runItemsInsert };
    if (table === 'story_linear_links') return { select: linkSelect, upsert: linkUpsert };
    if (table === 'story_maps') return { select: storyMapSelect };
    if (table === 'integration_settings') return { select: settingsSelect };
    return {};
  });

  return {
    client: { from },
    runItemsInsert,
    runUpdate,
  };
}

describe('release build route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAuth).mockResolvedValue({ success: true, user: { id: 'user_1' } } as never);
    domainRuntime.storyMap.openCodeSessions = null;
  });

  it('creates completed run when all release stories sync', async () => {
    const stories = [
      {
        id: 'story_1',
        title: 'Story 1',
        requirements: 'Req',
        acceptance_criteria: 'AC',
        status: 'ready',
        updated_at: '2026-02-14T11:00:00.000Z',
      },
      {
        id: 'story_2',
        title: 'Story 2',
        requirements: 'Req',
        acceptance_criteria: 'AC',
        status: 'ready',
        updated_at: '2026-02-14T11:00:00.000Z',
      },
    ];

    const { client, runItemsInsert, runUpdate } = createBuildClient(stories);
    vi.mocked(createClient).mockResolvedValue(client as never);

    const createIssue = vi
      .fn()
      .mockResolvedValueOnce({
        id: 'lin_1',
        identifier: 'ENG-1',
        title: 'Story 1',
        description: 'mapped',
        stateId: null,
        updatedAt: '2026-02-14T11:01:00.000Z',
      })
      .mockResolvedValueOnce({
        id: 'lin_2',
        identifier: 'ENG-2',
        title: 'Story 2',
        description: 'mapped',
        stateId: null,
        updatedAt: '2026-02-14T11:01:00.000Z',
      });

    domainRuntime.storyMap.linearIssueSync = {
      getIssueById: vi.fn(),
      createIssue,
      updateIssue: vi.fn(),
    };
    domainRuntime.storyMap.openCodeSessions = {
      createSession: vi.fn().mockResolvedValue({
        id: 'session_1',
        url: 'https://opencode.ai/sessions/session_1',
        state: 'active',
        createdAt: '2026-02-14T11:01:00.000Z',
      }),
      getSessionById: vi.fn(),
    };

    const response = await POST(new Request('http://localhost/api/test', { method: 'POST' }), {
      params: Promise.resolve({ id: RELEASE_ID }),
    });

    expect(runItemsInsert).toHaveBeenCalledTimes(2);
    expect(runItemsInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        opencode_session_id: 'session_1',
        opencode_session_url: 'https://opencode.ai/sessions/session_1',
      }),
    );
    expect(runUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'completed',
        completed_items: 2,
        failed_items: 0,
      }),
    );
    await expect(response.json()).resolves.toMatchObject({
      status: 'completed',
      total_items: 2,
      completed_items: 2,
      failed_items: 0,
    });
  });

  it('creates failed run when some release stories fail to sync', async () => {
    const stories = [
      {
        id: 'story_1',
        title: 'Story 1',
        requirements: 'Req',
        acceptance_criteria: 'AC',
        status: 'ready',
        updated_at: '2026-02-14T11:00:00.000Z',
      },
      {
        id: 'story_2',
        title: 'Story 2',
        requirements: 'Req',
        acceptance_criteria: 'AC',
        status: 'ready',
        updated_at: '2026-02-14T11:00:00.000Z',
      },
    ];

    const { client, runItemsInsert, runUpdate } = createBuildClient(stories);
    vi.mocked(createClient).mockResolvedValue(client as never);

    const createIssue = vi.fn().mockRejectedValueOnce(new Error('sync failed')).mockResolvedValueOnce({
      id: 'lin_2',
      identifier: 'ENG-2',
      title: 'Story 2',
      description: 'mapped',
      stateId: null,
      updatedAt: '2026-02-14T11:01:00.000Z',
    });

    domainRuntime.storyMap.linearIssueSync = {
      getIssueById: vi.fn(),
      createIssue,
      updateIssue: vi.fn(),
    };

    const response = await POST(new Request('http://localhost/api/test', { method: 'POST' }), {
      params: Promise.resolve({ id: RELEASE_ID }),
    });

    expect(runItemsInsert).toHaveBeenCalledTimes(2);
    expect(runUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'failed',
        completed_items: 1,
        failed_items: 1,
      }),
    );
    await expect(response.json()).resolves.toMatchObject({
      status: 'failed',
      total_items: 2,
      completed_items: 1,
      failed_items: 1,
    });
  });
});
