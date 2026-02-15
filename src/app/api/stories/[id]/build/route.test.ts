import { beforeEach, describe, expect, it, vi } from 'vitest';
import { domainRuntime } from '@/domains/runtime';
import { requireAuth } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { POST } from './route';

vi.mock('@/lib/auth', () => ({ requireAuth: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }));

const STORY_ID = 'd7f34189-5d27-4dc0-b2c5-23d11796add4';

describe('story build route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAuth).mockResolvedValue({ success: true, user: { id: 'user_1' } } as never);
  });

  it('builds one story into linear issue and opencode session', async () => {
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

    const runSingle = vi.fn().mockResolvedValue({ data: { id: 'run_1' }, error: null });
    const runInsertSelect = vi.fn().mockReturnValue({ single: runSingle });
    const runInsert = vi.fn().mockReturnValue({ select: runInsertSelect });
    const runUpdateEq = vi.fn().mockResolvedValue({ error: null });
    const runUpdate = vi.fn().mockReturnValue({ eq: runUpdateEq });

    const runItemInsert = vi.fn().mockResolvedValue({ error: null });

    const linkMaybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
    const linkSelectEq = vi.fn().mockReturnValue({ maybeSingle: linkMaybeSingle });
    const linkSelect = vi.fn().mockReturnValue({ eq: linkSelectEq });
    const linkUpsertSingle = vi.fn().mockResolvedValue({ data: {}, error: null });
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

    const tableMap: Record<string, unknown> = {
      stories: { select: storySelect },
      tasks: { select: taskSelect },
      activities: { select: activitySelect },
      release_runs: { insert: runInsert, update: runUpdate },
      release_run_items: { insert: runItemInsert },
      story_linear_links: { select: linkSelect, upsert: linkUpsert },
      story_maps: { select: storyMapSelect },
      integration_settings: { select: settingsSelect },
    };
    const from = vi.fn((table: string) => tableMap[table] ?? {});

    vi.mocked(createClient).mockResolvedValue({ from } as never);

    domainRuntime.storyMap.linearIssueSync = {
      getIssueById: vi.fn(),
      createIssue: vi.fn().mockResolvedValue({
        id: 'lin_1',
        identifier: 'ENG-1',
        title: 'Story 1',
        description: 'mapped',
        stateId: null,
        updatedAt: '2026-02-14T11:01:00.000Z',
      }),
      updateIssue: vi.fn(),
    };

    domainRuntime.storyMap.openCodeSessions = {
      createSession: vi.fn().mockResolvedValue({
        id: 'session_1',
        url: 'http://127.0.0.1:4096/session/session_1',
        state: 'active',
        createdAt: '2026-02-14T11:02:00.000Z',
      }),
      getSessionById: vi.fn(),
    };

    const response = await POST(new Request('http://localhost/api/test', { method: 'POST' }), {
      params: Promise.resolve({ id: STORY_ID }),
    });

    await expect(response.json()).resolves.toMatchObject({
      run_id: 'run_1',
      story_id: STORY_ID,
      linear_issue_identifier: 'ENG-1',
      opencode_session_id: 'session_1',
    });
  });
});
