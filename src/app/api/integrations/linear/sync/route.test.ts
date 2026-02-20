import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveLinearSyncContextForStory } from '@/integrations/linear/auth';
import { getLinearIssueSync } from '@/integrations/linear/helpers';
import { SYNC_DIRECTION } from '@/integrations/sync';
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

vi.mock('@/integrations/linear/auth', () => ({
  resolveLinearSyncContextForStory: vi.fn(),
}));

const STORY_ID = 'd7f34189-5d27-4dc0-b2c5-23d11796add4';

function jsonRequest(body: unknown): Request {
  return new Request('http://localhost/api/integrations/linear/sync', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function createSyncClient(storyUpdatedAt: string) {
  const storySingle = vi.fn().mockResolvedValue({
    data: {
      id: STORY_ID,
      task_id: STORY_ID,
      title: 'Story',
      content: {
        _version: 1,
        requirements: 'Req',
        acceptance_criteria: 'AC',
        figma_link: null,
        edge_cases: null,
        technical_guidelines: null,
      },
      status: 'ready',
      updated_at: storyUpdatedAt,
    },
    error: null,
  });
  const storyEq = vi.fn().mockReturnValue({ single: storySingle });
  const storyUpdateEq = vi.fn().mockResolvedValue({ error: null });
  const storyUpdate = vi.fn().mockReturnValue({ eq: storyUpdateEq });
  const storySelect = vi.fn().mockReturnValue({ eq: storyEq });

  const linkMaybeSingle = vi.fn().mockResolvedValue({
    data: {
      story_id: STORY_ID,
      linear_issue_id: 'lin_1',
      linear_issue_identifier: 'ENG-1',
      last_local_updated_at: null,
      last_linear_updated_at: null,
    },
    error: null,
  });
  const linkEq = vi.fn().mockReturnValue({ maybeSingle: linkMaybeSingle });
  const linkSelect = vi.fn().mockReturnValue({ eq: linkEq });

  const linkUpsertSingle = vi.fn().mockResolvedValue({
    data: {
      story_id: STORY_ID,
      linear_issue_id: 'lin_1',
      linear_issue_identifier: 'ENG-1',
      last_local_updated_at: null,
      last_linear_updated_at: null,
    },
    error: null,
  });
  const linkUpsertSelect = vi.fn().mockReturnValue({ single: linkUpsertSingle });
  const linkUpsert = vi.fn().mockReturnValue({ select: linkUpsertSelect });

  const from = vi.fn((table: string) => {
    if (table === 'stories') {
      return {
        select: storySelect,
        update: storyUpdate,
      };
    }
    if (table === 'story_linear_links') {
      return {
        select: linkSelect,
        upsert: linkUpsert,
      };
    }
    return {};
  });

  return {
    client: { from },
    storyUpdate,
  };
}

describe('linear sync route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAuth).mockResolvedValue({ success: true, user: { id: 'user_1' } } as never);
    vi.mocked(getLinearIssueSync).mockReturnValue(null);
  });

  it('applies remote->local when remote is newer', async () => {
    const { client, storyUpdate } = createSyncClient('2026-02-14T10:00:00.000Z');
    vi.mocked(createClient).mockResolvedValue(client as never);

    const issueSync = {
      getIssueById: vi.fn().mockResolvedValue({
        id: 'lin_1',
        identifier: 'ENG-1',
        title: 'Remote newer title',
        description: '## Requirements\nRemote req\n\n## Acceptance Criteria\n- [ ] Remote AC\n\n## Status\nIn Progress',
        stateId: null,
        updatedAt: '2026-02-14T11:00:00.000Z',
      }),
      createIssue: vi.fn(),
      updateIssue: vi.fn(),
    };

    vi.mocked(resolveLinearSyncContextForStory).mockResolvedValue({
      teamId: 'team_1',
      target: { teamId: 'team_linear_1' },
      targetConfigured: true,
      linearIssueSync: issueSync,
    });

    const response = await POST(jsonRequest({ story_id: STORY_ID }));

    expect(storyUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Remote newer title',
        content: expect.objectContaining({
          requirements: 'Remote req',
          acceptance_criteria: '- [ ] Remote AC',
        }),
        status: 'in_progress',
        updated_at: '2026-02-14T11:00:00.000Z',
      }),
    );
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      direction: SYNC_DIRECTION.remoteToLocal,
    });
  });

  it('applies local->remote when local is newer', async () => {
    const { client } = createSyncClient('2026-02-14T12:00:00.000Z');
    vi.mocked(createClient).mockResolvedValue(client as never);

    const updateIssue = vi.fn().mockResolvedValue({
      id: 'lin_1',
      identifier: 'ENG-1',
      title: 'Story',
      description: 'mapped',
      stateId: null,
      updatedAt: '2026-02-14T12:00:00.000Z',
    });

    vi.mocked(resolveLinearSyncContextForStory).mockResolvedValue({
      teamId: 'team_1',
      target: { teamId: 'team_linear_1' },
      targetConfigured: true,
      linearIssueSync: {
        getIssueById: vi.fn().mockResolvedValue({
          id: 'lin_1',
          identifier: 'ENG-1',
          title: 'Remote older title',
          description: null,
          stateId: null,
          updatedAt: '2026-02-14T11:00:00.000Z',
        }),
        createIssue: vi.fn(),
        updateIssue,
      },
    });

    const response = await POST(jsonRequest({ story_id: STORY_ID }));

    expect(updateIssue).toHaveBeenCalledTimes(1);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      direction: SYNC_DIRECTION.localToRemote,
    });
  });

  it('applies local->remote when timestamps are equal', async () => {
    const { client } = createSyncClient('2026-02-14T11:00:00.000Z');
    vi.mocked(createClient).mockResolvedValue(client as never);

    const updateIssue = vi.fn().mockResolvedValue({
      id: 'lin_1',
      identifier: 'ENG-1',
      title: 'Story',
      description: 'mapped',
      stateId: null,
      updatedAt: '2026-02-14T11:00:00.000Z',
    });

    vi.mocked(resolveLinearSyncContextForStory).mockResolvedValue({
      teamId: 'team_1',
      target: { teamId: 'team_linear_1' },
      targetConfigured: true,
      linearIssueSync: {
        getIssueById: vi.fn().mockResolvedValue({
          id: 'lin_1',
          identifier: 'ENG-1',
          title: 'Remote equal title',
          description: null,
          stateId: null,
          updatedAt: '2026-02-14T11:00:00.000Z',
        }),
        createIssue: vi.fn(),
        updateIssue,
      },
    });

    const response = await POST(jsonRequest({ story_id: STORY_ID }));

    expect(updateIssue).toHaveBeenCalledTimes(1);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      direction: SYNC_DIRECTION.localToRemote,
    });
  });
});
