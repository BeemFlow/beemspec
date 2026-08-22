import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LinearSyncContext } from '@/integrations/linear/auth';

const {
  applyLinearIssueToStoryMock,
  getStoryLinearLinkMock,
  loadStoryWithStoryMapMock,
  pushStoryToLinearMock,
  resolveLinearSyncContextForStoryMapMock,
  shouldApplyRemoteUpdateMock,
} = vi.hoisted(() => ({
  applyLinearIssueToStoryMock: vi.fn(),
  getStoryLinearLinkMock: vi.fn(),
  loadStoryWithStoryMapMock: vi.fn(),
  pushStoryToLinearMock: vi.fn(),
  resolveLinearSyncContextForStoryMapMock: vi.fn(),
  shouldApplyRemoteUpdateMock: vi.fn(),
}));

vi.mock('@/integrations/linear/conflict', () => ({ shouldApplyRemoteUpdate: shouldApplyRemoteUpdateMock }));
vi.mock('@/integrations/linear/auth', () => ({
  resolveLinearSyncContextForStoryMap: resolveLinearSyncContextForStoryMapMock,
}));
vi.mock('@/integrations/linear/story-links', () => ({ getStoryLinearLink: getStoryLinearLinkMock }));
vi.mock('@/integrations/linear/story-sync', () => ({
  applyLinearIssueToStory: applyLinearIssueToStoryMock,
  pushStoryToLinear: pushStoryToLinearMock,
}));
vi.mock('@/storymap/story-context', () => ({ loadStoryWithStoryMap: loadStoryWithStoryMapMock }));

import { reconcileStoriesForStoryMap, reconcileStoryById } from './reconcile';

const readyContext: LinearSyncContext = {
  status: 'ready',
  teamId: 'team-1',
  targetConfigured: true,
  target: { teamId: 'linear-team-1', projectId: 'project-1' },
  linearIssueSync: {
    getIssueById: vi.fn(),
    createIssue: vi.fn(),
    updateIssue: vi.fn(),
    deleteIssue: vi.fn(),
  },
  accessToken: 'token-1',
};

function storyContext(storyId: string, updatedAt = '2026-03-03T00:00:00Z') {
  return {
    ok: true,
    data: {
      storyMapId: 'map-1',
      story: {
        id: storyId,
        task_id: 'task-1',
        release_id: null,
        sort_order: 0,
        title: 'Story',
        status: 'todo',
        content: { _version: 1, user_story: 'Requirement', acceptance_criteria: 'Criterion' },
        updated_at: updatedAt,
      },
    },
  };
}

describe('Linear story reconciliation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const issueSync = readyContext.linearIssueSync;
    if (!issueSync) throw new Error('Expected ready Linear sync context');
    issueSync.getIssueById = vi.fn().mockResolvedValue({
      id: 'lin-1',
      identifier: 'BEE-1',
      title: 'Remote story',
      description: 'Remote description',
      stateId: null,
      updatedAt: '2026-03-02T00:00:00Z',
    });
    loadStoryWithStoryMapMock.mockImplementation(async (_supabase, storyId: string) => storyContext(storyId));
    resolveLinearSyncContextForStoryMapMock.mockResolvedValue(readyContext);
    getStoryLinearLinkMock.mockResolvedValue({ linearIssueId: 'lin-1' });
    pushStoryToLinearMock.mockResolvedValue({ id: 'lin-1' });
    applyLinearIssueToStoryMock.mockResolvedValue({ applied: true, conflict: false, duplicate: false });
    shouldApplyRemoteUpdateMock.mockReturnValue(false);
  });

  it('ignores a story when the map has no Linear target', async () => {
    const result = await reconcileStoryById({
      supabase: {} as never,
      storyId: 'story-1',
      context: {
        status: 'not_configured',
        teamId: 'team-1',
        targetConfigured: false,
        target: null,
        linearIssueSync: null,
      },
    });

    expect(result).toEqual({
      storyId: 'story-1',
      success: true,
      action: 'ignored',
      reason: 'no linear target configured for story team',
    });
  });

  it('uses the shared outbound operation for an unlinked story', async () => {
    getStoryLinearLinkMock.mockResolvedValue(null);
    pushStoryToLinearMock.mockResolvedValue({ id: 'lin-created' });

    const result = await reconcileStoryById({ supabase: {} as never, storyId: 'story-1', context: readyContext });

    expect(pushStoryToLinearMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ link: null, storyMapId: 'map-1' }),
    );
    expect(result).toMatchObject({ action: 'created_remote', linearIssueId: 'lin-created' });
  });

  it('uses the shared inbound operation when Linear is newer', async () => {
    shouldApplyRemoteUpdateMock.mockReturnValue(true);

    const result = await reconcileStoryById({ supabase: {} as never, storyId: 'story-1', context: readyContext });

    expect(applyLinearIssueToStoryMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ issue: expect.objectContaining({ id: 'lin-1' }) }),
    );
    expect(result).toMatchObject({ action: 'remote_to_local', linearIssueId: 'lin-1' });
  });

  it('passes the fetched issue to the shared outbound operation when local is newer', async () => {
    const result = await reconcileStoryById({ supabase: {} as never, storyId: 'story-1', context: readyContext });

    expect(pushStoryToLinearMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ link: expect.objectContaining({ linearIssueId: 'lin-1' }), remote: expect.anything() }),
    );
    expect(result).toMatchObject({ action: 'local_to_remote', linearIssueId: 'lin-1' });
  });

  it('resolves map context once and aggregates typed outcomes', async () => {
    getStoryLinearLinkMock.mockImplementation(async (_supabase, storyId: string) =>
      storyId === 'created' ? null : { linearIssueId: 'lin-1' },
    );
    pushStoryToLinearMock.mockImplementation(async (_supabase, input) => {
      if (input.story.id === 'failed') throw new Error('boom');
      return { id: input.story.id === 'created' ? 'lin-created' : 'lin-1' };
    });

    const result = await reconcileStoriesForStoryMap({
      supabase: {} as never,
      storyMapId: 'map-1',
      storyIds: ['created', 'updated', 'failed'],
    });

    expect(resolveLinearSyncContextForStoryMapMock).toHaveBeenCalledOnce();
    expect(result).toMatchObject({
      considered: 3,
      succeeded: 2,
      failed: 1,
      createdRemote: 1,
      localToRemote: 1,
    });
    expect(result.results.map((item) => item.action)).toEqual(['created_remote', 'local_to_remote', 'failed']);
  });
});
