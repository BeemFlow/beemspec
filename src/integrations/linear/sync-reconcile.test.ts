import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  buildStoryPatchFromLinearIssueMock,
  mapStoryToLinearIssueInputMock,
  resolveLinearSyncContextForStoryMock,
  getStoryLinearLinkMock,
  upsertStoryLinearLinkMock,
  maybeSyncStoryToLinearMock,
  buildDbUpdateFromPatchMock,
  shouldApplyRemoteUpdateMock,
  syncStoryToRemoteMock,
} = vi.hoisted(() => ({
  buildStoryPatchFromLinearIssueMock: vi.fn(),
  mapStoryToLinearIssueInputMock: vi.fn(),
  resolveLinearSyncContextForStoryMock: vi.fn(),
  getStoryLinearLinkMock: vi.fn(),
  upsertStoryLinearLinkMock: vi.fn(),
  maybeSyncStoryToLinearMock: vi.fn(),
  buildDbUpdateFromPatchMock: vi.fn(),
  shouldApplyRemoteUpdateMock: vi.fn(),
  syncStoryToRemoteMock: vi.fn(),
}));

vi.mock('@beemspec/linear', () => ({
  buildStoryPatchFromLinearIssue: buildStoryPatchFromLinearIssueMock,
  mapStoryToLinearIssueInput: mapStoryToLinearIssueInputMock,
}));
vi.mock('@/integrations/linear/auth', () => ({
  resolveLinearSyncContextForStory: resolveLinearSyncContextForStoryMock,
}));
vi.mock('@/integrations/linear/story-links', () => ({
  getStoryLinearLink: getStoryLinearLinkMock,
  upsertStoryLinearLink: upsertStoryLinearLinkMock,
}));
vi.mock('@/integrations/linear/sync', () => ({
  maybeSyncStoryToLinear: maybeSyncStoryToLinearMock,
}));
vi.mock('@/integrations/sync', () => ({
  buildDbUpdateFromPatch: buildDbUpdateFromPatchMock,
  SYNC_DIRECTION: { localToRemote: 'local_to_remote', remoteToLocal: 'remote_to_local' },
  shouldApplyRemoteUpdate: shouldApplyRemoteUpdateMock,
  syncStoryToRemote: syncStoryToRemoteMock,
}));

import { syncStoriesByIdList, syncStoryById } from './sync-reconcile';

function createStoryLookupClient(story: Record<string, unknown>) {
  const updateEq = vi.fn().mockResolvedValue({ error: null });
  const update = vi.fn().mockReturnValue({ eq: updateEq });
  const single = vi.fn().mockResolvedValue({ data: story, error: null });
  const eq = vi.fn().mockReturnValue({ single, update });
  const select = vi.fn().mockReturnValue({ eq });
  const from = vi.fn((table: string) => {
    if (table === 'stories') return { select, update };
    throw new Error(`Unexpected table: ${table}`);
  });

  return { supabase: { from } as never, updateEq };
}

describe('linear sync reconcile', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    resolveLinearSyncContextForStoryMock.mockResolvedValue({
      targetConfigured: true,
      target: { teamId: 'linear-team-1', projectId: 'project-1' },
      linearIssueSync: { getIssueById: vi.fn(), updateIssue: vi.fn() },
    });
  });

  it('ignores stories when no linear target is configured', async () => {
    const { supabase } = createStoryLookupClient({ id: 'story-1' });
    resolveLinearSyncContextForStoryMock.mockResolvedValue({
      targetConfigured: false,
      target: null,
      linearIssueSync: null,
    });

    const response = await syncStoryById({ supabase, storyId: 'story-1' });

    await expect(response.json()).resolves.toEqual({
      success: true,
      ignored: true,
      reason: 'no linear target configured for story team',
    });
  });

  it('creates a remote issue when a story is not yet linked', async () => {
    const { supabase } = createStoryLookupClient({ id: 'story-1', updated_at: '2026-03-01T00:00:00Z' });
    getStoryLinearLinkMock.mockResolvedValue(null);
    maybeSyncStoryToLinearMock.mockResolvedValue({ id: 'lin-1', identifier: 'BEE-1' });

    const response = await syncStoryById({ supabase, storyId: 'story-1' });

    await expect(response.json()).resolves.toEqual({
      success: true,
      direction: 'local_to_remote',
      story_id: 'story-1',
      linear_issue_id: 'lin-1',
      action: 'created_remote',
    });
  });

  it('applies a remote update to the local story when the remote issue is newer', async () => {
    const { supabase, updateEq } = createStoryLookupClient({
      id: 'story-1',
      updated_at: '2026-03-01T00:00:00Z',
      content: { _version: 1, user_story: 'old', acceptance_criteria: 'old' },
    });
    getStoryLinearLinkMock.mockResolvedValue({ linearIssueId: 'lin-1' });
    const getIssueById = vi.fn().mockResolvedValue({
      id: 'lin-1',
      identifier: 'BEE-1',
      title: 'Remote title',
      description: 'Remote description',
      updatedAt: '2026-03-02T00:00:00Z',
    });
    resolveLinearSyncContextForStoryMock.mockResolvedValue({
      targetConfigured: true,
      target: { teamId: 'linear-team-1', projectId: 'project-1' },
      linearIssueSync: { getIssueById },
    });
    shouldApplyRemoteUpdateMock.mockReturnValue(true);
    buildStoryPatchFromLinearIssueMock.mockReturnValue({ title: 'Remote title', content: { _version: 1 } });
    buildDbUpdateFromPatchMock.mockReturnValue({ title: 'Remote title', content: { _version: 1 } });

    const response = await syncStoryById({ supabase, storyId: 'story-1' });

    expect(updateEq).toHaveBeenCalledWith('id', 'story-1');
    expect(upsertStoryLinearLinkMock).toHaveBeenCalledWith(
      supabase,
      expect.objectContaining({ storyId: 'story-1', linearIssueId: 'lin-1' }),
    );
    await expect(response.json()).resolves.toEqual({
      success: true,
      direction: 'remote_to_local',
      story_id: 'story-1',
      linear_issue_id: 'lin-1',
      action: 'remote_to_local',
    });
  });

  it('syncs the local story back to linear when local is newer', async () => {
    const { supabase } = createStoryLookupClient({ id: 'story-1', updated_at: '2026-03-03T00:00:00Z' });
    getStoryLinearLinkMock.mockResolvedValue({ linearIssueId: 'lin-1' });
    shouldApplyRemoteUpdateMock.mockReturnValue(false);
    const getIssueById = vi.fn().mockResolvedValue({
      id: 'lin-1',
      identifier: 'BEE-1',
      title: 'Remote title',
      description: 'Keep this section',
      updatedAt: '2026-03-01T00:00:00Z',
    });
    resolveLinearSyncContextForStoryMock.mockResolvedValue({
      targetConfigured: true,
      target: { teamId: 'linear-team-1', projectId: 'project-1' },
      linearIssueSync: { getIssueById },
    });
    mapStoryToLinearIssueInputMock.mockReturnValue({ title: 'Story title' });
    syncStoryToRemoteMock.mockResolvedValue({ id: 'lin-1', identifier: 'BEE-1', updatedAt: '2026-03-03T00:00:00Z' });

    const response = await syncStoryById({ supabase, storyId: 'story-1' });

    expect(mapStoryToLinearIssueInputMock).toHaveBeenCalledWith(
      expect.anything(),
      { teamId: 'linear-team-1', projectId: 'project-1' },
      { preserveFromDescription: 'Keep this section' },
    );
    expect(syncStoryToRemoteMock).toHaveBeenCalledWith(expect.anything(), { title: 'Story title' }, 'lin-1');
    await expect(response.json()).resolves.toEqual({
      success: true,
      direction: 'local_to_remote',
      story_id: 'story-1',
      linear_issue_id: 'lin-1',
      action: 'local_to_remote',
    });
  });

  it('aggregates sync outcomes across a story list', async () => {
    const currentStoryId = { value: '' };
    const updateEq = vi.fn().mockResolvedValue({ error: null });
    const update = vi.fn().mockReturnValue({ eq: updateEq });
    const single = vi.fn().mockImplementation(() => {
      if (currentStoryId.value === 'c') {
        throw new Error('boom');
      }

      return Promise.resolve({
        data: {
          id: currentStoryId.value,
          updated_at: currentStoryId.value === 'd' ? '2026-03-01T00:00:00Z' : '2026-03-03T00:00:00Z',
        },
        error: null,
      });
    });
    const eq = vi.fn((column: string, value: string) => {
      if (column === 'id') currentStoryId.value = value;
      return { single, update };
    });
    const select = vi.fn().mockReturnValue({ eq });
    const supabase = { from: vi.fn(() => ({ select, update })) } as never;

    resolveLinearSyncContextForStoryMock.mockImplementation(async (_supabase, input: { storyId: string }) => {
      if (input.storyId === 'a') {
        return { targetConfigured: false, target: null, linearIssueSync: null };
      }

      return {
        targetConfigured: true,
        target: { teamId: 'linear-team-1', projectId: 'project-1' },
        linearIssueSync: {
          getIssueById: vi.fn().mockResolvedValue({
            id: 'lin-1',
            identifier: 'BEE-1',
            title: 'Remote title',
            description: 'Remote description',
            updatedAt: '2026-03-02T00:00:00Z',
          }),
        },
      };
    });
    getStoryLinearLinkMock.mockImplementation(async (_supabase, storyId: string) =>
      storyId === 'd' ? { linearIssueId: 'lin-1' } : null,
    );
    maybeSyncStoryToLinearMock.mockImplementation(async (_supabase, storyId: string) =>
      storyId === 'b' ? { id: 'lin-created', identifier: 'BEE-2' } : null,
    );
    shouldApplyRemoteUpdateMock.mockReturnValue(true);
    buildStoryPatchFromLinearIssueMock.mockReturnValue({ title: 'Remote title' });
    buildDbUpdateFromPatchMock.mockReturnValue({ title: 'Remote title' });

    const result = await syncStoriesByIdList({ supabase, storyIds: ['a', 'b', 'c', 'd'] });

    expect(result).toMatchObject({
      considered: 4,
      succeeded: 3,
      failed: 1,
      ignored: 1,
      createdRemote: 1,
      remoteToLocal: 1,
      localToRemote: 0,
    });
    expect(result.responses).toHaveLength(4);
  });
});
