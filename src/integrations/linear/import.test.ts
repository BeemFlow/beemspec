import { beforeEach, describe, expect, it, vi } from 'vitest';

const { buildStoryPatchFromLinearIssueMock, emptyContentMock, buildDbUpdateFromPatchMock } = vi.hoisted(() => ({
  buildStoryPatchFromLinearIssueMock: vi.fn(),
  emptyContentMock: vi.fn(),
  buildDbUpdateFromPatchMock: vi.fn(),
}));

vi.mock('@beemspec/linear', () => ({
  buildStoryPatchFromLinearIssue: buildStoryPatchFromLinearIssueMock,
}));
vi.mock('@beemspec/storymap', () => ({
  emptyContent: emptyContentMock,
}));
vi.mock('@beemspec/sync', () => ({
  buildDbUpdateFromPatch: buildDbUpdateFromPatchMock,
}));

import { findStoryMapImportCandidate, importLinearIssueIntoStoryMap } from './import';

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

  it('imports and links a Linear issue through the atomic database operation', async () => {
    const rpcSingle = vi.fn().mockResolvedValue({
      data: { story_id: 'story-1', duplicate: false },
      error: null,
    });
    const rpc = vi.fn().mockReturnValue({ single: rpcSingle });
    const supabase = { rpc } as never;

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
    ).resolves.toEqual({ storyId: 'story-1', duplicate: false });

    expect(rpc).toHaveBeenCalledWith('import_linear_issue_into_story_map', {
      p_story_map_id: 'map-1',
      p_linear_issue_id: 'lin-1',
      p_linear_issue_identifier: 'BEE-1',
      p_story_title: 'Imported from Linear',
      p_story_status: 'todo',
      p_story_content: { _version: 1, user_story: 'Imported', acceptance_criteria: 'Done' },
      p_story_updated_at: '2026-03-03T00:00:00Z',
      p_idempotency_key: null,
      p_event_type: null,
      p_event_action: null,
      p_payload: null,
    });
  });
});
