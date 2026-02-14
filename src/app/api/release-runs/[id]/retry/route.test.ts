import { beforeEach, describe, expect, it, vi } from 'vitest';
import { domainRuntime } from '@/domains/runtime';
import { requireAuth } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { POST } from './route';

vi.mock('@/lib/auth', () => ({ requireAuth: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }));

const RUN_ID = 'd7f34189-5d27-4dc0-b2c5-23d11796add4';

function createRetryClient() {
  const runSingle = vi.fn().mockResolvedValue({
    data: {
      id: RUN_ID,
      story_map_id: 'story_map_1',
      total_items: 2,
    },
    error: null,
  });
  const runEq = vi.fn().mockReturnValue({ single: runSingle });

  const failedItemsSecondEq = vi.fn().mockResolvedValue({
    data: [{ status: 'synced' }, { status: 'synced' }],
    error: null,
  });
  const failedItemsFirstSecondEq = vi.fn().mockResolvedValue({
    data: [{ id: 'item_1', story_id: 'story_1' }],
    error: null,
  });
  const failedItemsFirstEq = vi.fn().mockReturnValue({ eq: failedItemsFirstSecondEq });
  const failedItemsSelect = vi.fn().mockImplementation((columns: string) => {
    if (columns.includes('id, story_id')) return { eq: failedItemsFirstEq };
    return { eq: failedItemsSecondEq };
  });

  const storySingle = vi.fn().mockResolvedValue({
    data: {
      id: 'story_1',
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

  const linkMaybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
  const linkSelectEq = vi.fn().mockReturnValue({ maybeSingle: linkMaybeSingle });
  const linkSelect = vi.fn().mockReturnValue({ eq: linkSelectEq });

  const linkUpsertSingle = vi.fn().mockResolvedValue({
    data: {
      story_id: 'story_1',
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

  const runUpdateEq = vi.fn().mockResolvedValue({ error: null });
  const runUpdate = vi.fn().mockReturnValue({ eq: runUpdateEq });

  const runItemsUpdateEq = vi.fn().mockResolvedValue({ error: null });
  const runItemsUpdate = vi.fn().mockReturnValue({ eq: runItemsUpdateEq });

  const from = vi.fn((table: string) => {
    if (table === 'release_runs') return { select: () => ({ eq: runEq }), update: runUpdate };
    if (table === 'release_run_items') return { select: failedItemsSelect, update: runItemsUpdate };
    if (table === 'stories') return { select: storySelect };
    if (table === 'story_linear_links') return { select: linkSelect, upsert: linkUpsert };
    if (table === 'story_maps') return { select: storyMapSelect };
    if (table === 'integration_settings') return { select: settingsSelect };
    return {};
  });

  return {
    client: { from },
    runItemsUpdate,
    runUpdate,
  };
}

describe('release run retry route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAuth).mockResolvedValue({ success: true, user: { id: 'user_1' } } as never);
  });

  it('retries failed items and finalizes run status', async () => {
    const { client, runItemsUpdate, runUpdate } = createRetryClient();
    vi.mocked(createClient).mockResolvedValue(client as never);

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

    const response = await POST(new Request('http://localhost/api/test', { method: 'POST' }), {
      params: Promise.resolve({ id: RUN_ID }),
    });

    expect(runItemsUpdate).toHaveBeenCalled();
    expect(runUpdate).toHaveBeenLastCalledWith(
      expect.objectContaining({
        status: 'completed',
        completed_items: 2,
        failed_items: 0,
      }),
    );
    await expect(response.json()).resolves.toMatchObject({
      run_id: RUN_ID,
      retried_items: 1,
      succeeded: 1,
      failed: 0,
      status: 'completed',
    });
  });
});
