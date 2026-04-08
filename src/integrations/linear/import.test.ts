import { beforeEach, describe, expect, it, vi } from 'vitest';

const { buildStoryPatchFromLinearIssueMock, emptyContentMock, upsertStoryLinearLinkMock, buildDbUpdateFromPatchMock } =
  vi.hoisted(() => ({
    buildStoryPatchFromLinearIssueMock: vi.fn(),
    emptyContentMock: vi.fn(),
    upsertStoryLinearLinkMock: vi.fn(),
    buildDbUpdateFromPatchMock: vi.fn(),
  }));

vi.mock('@beemspec/linear', () => ({
  buildStoryPatchFromLinearIssue: buildStoryPatchFromLinearIssueMock,
}));
vi.mock('@beemspec/storymap', () => ({
  emptyContent: emptyContentMock,
}));
vi.mock('@/integrations/linear/story-links', () => ({
  upsertStoryLinearLink: upsertStoryLinearLinkMock,
}));
vi.mock('@/integrations/sync', () => ({
  buildDbUpdateFromPatch: buildDbUpdateFromPatchMock,
}));

import { ensureUntriagedTaskId, findStoryMapImportCandidate, importLinearIssueIntoStoryMap } from './import';

describe('linear import helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    emptyContentMock.mockReturnValue({ _version: 1, user_story: '', acceptance_criteria: '' });
  });

  it('finds exactly one eligible story map import candidate', async () => {
    const integrationEq = vi.fn().mockResolvedValue({ data: [{ team_id: 'team-a' }], error: null });
    const integrationSelect = vi.fn().mockReturnValue({ eq: integrationEq });

    const mapsIn = vi.fn().mockResolvedValue({
      data: [{ id: 'map-1', team_id: 'team-a', created_at: '2026-01-01T00:00:00Z' }],
      error: null,
    });
    const mapsSelect = vi.fn().mockReturnValue({ in: mapsIn });

    const settingsIn = vi.fn().mockResolvedValue({
      data: [
        {
          story_map_id: 'map-1',
          linear_project_id: 'project-1',
          auto_import_labeled_issues: true,
          import_label_name: 'Story',
        },
      ],
      error: null,
    });
    const settingsSelect = vi.fn().mockReturnValue({ in: settingsIn });

    const supabase = {
      from: vi.fn((table: string) => {
        if (table === 'integration_settings') return { select: integrationSelect };
        if (table === 'story_maps') return { select: mapsSelect };
        if (table === 'story_map_integration_settings') return { select: settingsSelect };
        throw new Error(`Unexpected table: ${table}`);
      }),
    } as never;

    await expect(
      findStoryMapImportCandidate(supabase, {
        teamId: 'linear-team-1',
        linearProjectId: 'project-1',
        labelNames: ['story', 'bug'],
      }),
    ).resolves.toEqual({ storyMapId: 'map-1' });
  });

  it('returns null when multiple story maps are eligible for import', async () => {
    const integrationEq = vi.fn().mockResolvedValue({ data: [{ team_id: 'team-a' }], error: null });
    const integrationSelect = vi.fn().mockReturnValue({ eq: integrationEq });
    const mapsIn = vi.fn().mockResolvedValue({
      data: [
        { id: 'map-1', team_id: 'team-a', created_at: '2026-01-01T00:00:00Z' },
        { id: 'map-2', team_id: 'team-a', created_at: '2026-01-02T00:00:00Z' },
      ],
      error: null,
    });
    const mapsSelect = vi.fn().mockReturnValue({ in: mapsIn });
    const settingsIn = vi.fn().mockResolvedValue({
      data: [
        {
          story_map_id: 'map-1',
          linear_project_id: 'project-1',
          auto_import_labeled_issues: true,
          import_label_name: 'Story',
        },
        {
          story_map_id: 'map-2',
          linear_project_id: 'project-1',
          auto_import_labeled_issues: true,
          import_label_name: 'Story',
        },
      ],
      error: null,
    });
    const settingsSelect = vi.fn().mockReturnValue({ in: settingsIn });
    const supabase = {
      from: vi.fn((table: string) => {
        if (table === 'integration_settings') return { select: integrationSelect };
        if (table === 'story_maps') return { select: mapsSelect };
        if (table === 'story_map_integration_settings') return { select: settingsSelect };
        throw new Error(`Unexpected table: ${table}`);
      }),
    } as never;

    await expect(
      findStoryMapImportCandidate(supabase, {
        teamId: 'linear-team-1',
        linearProjectId: 'project-1',
        labelNames: ['Story'],
      }),
    ).resolves.toBeNull();
  });

  it('reuses an existing Untriaged task when it already exists', async () => {
    const activitiesOrder = vi.fn().mockResolvedValue({
      data: [{ id: 'activity-1', name: 'Untriaged', sort_order: 0 }],
      error: null,
    });
    const activitiesEq = vi.fn().mockReturnValue({ order: activitiesOrder });
    const activitiesSelect = vi.fn().mockReturnValue({ eq: activitiesEq });

    const tasksOrder = vi.fn().mockResolvedValue({
      data: [{ id: 'task-1', name: 'Untriaged', sort_order: 0 }],
      error: null,
    });
    const tasksEq = vi.fn().mockReturnValue({ order: tasksOrder });
    const tasksSelect = vi.fn().mockReturnValue({ eq: tasksEq });

    const supabase = {
      from: vi.fn((table: string) => {
        if (table === 'activities') return { select: activitiesSelect };
        if (table === 'tasks') return { select: tasksSelect };
        throw new Error(`Unexpected table: ${table}`);
      }),
      rpc: vi.fn(),
    } as never;

    await expect(ensureUntriagedTaskId(supabase, 'map-1')).resolves.toBe('task-1');
  });

  it('creates and reorders Untriaged containers when they are missing', async () => {
    const activitiesOrder = vi
      .fn()
      .mockResolvedValue({ data: [{ id: 'activity-9', name: 'Existing', sort_order: 0 }], error: null });
    const activitiesEq = vi.fn().mockReturnValue({ order: activitiesOrder });
    const activitiesSelect = vi.fn().mockReturnValue({ eq: activitiesEq });
    const activitySingle = vi
      .fn()
      .mockResolvedValue({ data: { id: 'activity-1', name: 'Untriaged', sort_order: 1 }, error: null });
    const activityInsertSelect = vi.fn().mockReturnValue({ single: activitySingle });
    const activityInsert = vi.fn().mockReturnValue({ select: activityInsertSelect });

    const tasksOrder = vi.fn().mockResolvedValue({ data: [], error: null });
    const tasksEq = vi.fn().mockReturnValue({ order: tasksOrder });
    const tasksSelect = vi.fn().mockReturnValue({ eq: tasksEq });
    const taskSingle = vi
      .fn()
      .mockResolvedValue({ data: { id: 'task-1', name: 'Untriaged', sort_order: 0 }, error: null });
    const taskInsertSelect = vi.fn().mockReturnValue({ single: taskSingle });
    const taskInsert = vi.fn().mockReturnValue({ select: taskInsertSelect });

    const rpc = vi.fn().mockResolvedValue({ error: null });
    const supabase = {
      from: vi.fn((table: string) => {
        if (table === 'activities') return { select: activitiesSelect, insert: activityInsert };
        if (table === 'tasks') return { select: tasksSelect, insert: taskInsert };
        throw new Error(`Unexpected table: ${table}`);
      }),
      rpc,
    } as never;

    await expect(ensureUntriagedTaskId(supabase, 'map-1')).resolves.toBe('task-1');
    expect(rpc).toHaveBeenCalledWith('reorder_activities', {
      p_story_map_id: 'map-1',
      p_order: ['activity-1', 'activity-9'],
    });
  });

  it('imports a linear issue into the story map and records the link', async () => {
    const activitiesOrder = vi
      .fn()
      .mockResolvedValue({ data: [{ id: 'activity-1', name: 'Untriaged', sort_order: 0 }], error: null });
    const activitiesEq = vi.fn().mockReturnValue({ order: activitiesOrder });
    const activitiesSelect = vi.fn().mockReturnValue({ eq: activitiesEq });
    const tasksOrder = vi
      .fn()
      .mockResolvedValue({ data: [{ id: 'task-1', name: 'Untriaged', sort_order: 0 }], error: null });
    const tasksEq = vi.fn().mockReturnValue({ order: tasksOrder });
    const tasksSelect = vi.fn().mockReturnValue({ eq: tasksEq });
    const storySingle = vi
      .fn()
      .mockResolvedValue({ data: { id: 'story-1', updated_at: '2026-03-03T00:00:00Z' }, error: null });
    const storyInsertSelect = vi.fn().mockReturnValue({ single: storySingle });
    const storyInsert = vi.fn().mockReturnValue({ select: storyInsertSelect });

    const supabase = {
      from: vi.fn((table: string) => {
        if (table === 'activities') return { select: activitiesSelect };
        if (table === 'tasks') return { select: tasksSelect };
        if (table === 'stories') return { insert: storyInsert };
        throw new Error(`Unexpected table: ${table}`);
      }),
      rpc: vi.fn(),
    } as never;

    buildStoryPatchFromLinearIssueMock.mockReturnValue({ title: 'Imported from Linear', status: 'todo' });
    buildDbUpdateFromPatchMock.mockReturnValue({
      content: { _version: 1, user_story: 'Imported', acceptance_criteria: 'Done' },
    });

    await expect(
      importLinearIssueIntoStoryMap({
        supabase,
        storyMapId: 'map-1',
        linearIssueId: 'lin-1',
        linearIssueIdentifier: 'BEE-1',
        title: 'Imported from Linear',
        description: 'Issue body',
        stateName: 'Todo',
        updatedAt: '2026-03-03T00:00:00Z',
      }),
    ).resolves.toEqual({ storyId: 'story-1' });

    expect(storyInsert).toHaveBeenCalledWith({
      task_id: 'task-1',
      release_id: null,
      title: 'Imported from Linear',
      status: 'todo',
      content: { _version: 1, user_story: 'Imported', acceptance_criteria: 'Done' },
      updated_at: '2026-03-03T00:00:00Z',
    });
    expect(upsertStoryLinearLinkMock).toHaveBeenCalledWith(supabase, {
      storyId: 'story-1',
      linearIssueId: 'lin-1',
      linearIssueIdentifier: 'BEE-1',
      lastLocalUpdatedAt: '2026-03-03T00:00:00Z',
      lastLinearUpdatedAt: '2026-03-03T00:00:00Z',
    });
  });
});
