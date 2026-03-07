import { describe, expect, it, vi } from 'vitest';
import { ensureUntriagedTaskId, findStoryMapImportCandidate } from './import';

describe('linear import candidate resolution', () => {
  it('matches story map by label + effective project', async () => {
    const storyMapsEq = vi.fn().mockResolvedValue({
      data: [
        { id: 'map_1', team_id: 'team_1', created_at: '2026-01-01T00:00:00.000Z' },
        { id: 'map_2', team_id: 'team_1', created_at: '2026-01-02T00:00:00.000Z' },
      ],
      error: null,
    });
    const storyMapsSelect = vi.fn().mockReturnValue({ eq: storyMapsEq });

    const mapSettingsIn = vi.fn().mockResolvedValue({
      data: [
        {
          story_map_id: 'map_1',
          linear_project_id: 'project_match',
          linear_state_id: null,
          auto_import_labeled_issues: true,
          import_label_name: 'Story',
        },
      ],
      error: null,
    });
    const mapSettingsSelect = vi.fn().mockReturnValue({ in: mapSettingsIn });

    const from = vi.fn((table: string) => {
      if (table === 'story_maps') return { select: storyMapsSelect };
      if (table === 'story_map_integration_settings') return { select: mapSettingsSelect };
      return {};
    });

    const candidate = await findStoryMapImportCandidate(
      { from },
      { teamId: 'team_1', linearProjectId: 'project_match', labelNames: ['Story'] },
    );

    expect(candidate?.storyMapId).toBe('map_1');
  });

  it('returns null when issue has no project id', async () => {
    const storyMapsEq = vi.fn().mockResolvedValue({
      data: [{ id: 'map_1', team_id: 'team_1', created_at: '2026-01-01T00:00:00.000Z' }],
      error: null,
    });
    const storyMapsSelect = vi.fn().mockReturnValue({ eq: storyMapsEq });

    const mapSettingsIn = vi.fn().mockResolvedValue({
      data: [
        {
          story_map_id: 'map_1',
          linear_project_id: 'project_match',
          linear_state_id: null,
          auto_import_labeled_issues: true,
          import_label_name: 'Story',
        },
      ],
      error: null,
    });
    const mapSettingsSelect = vi.fn().mockReturnValue({ in: mapSettingsIn });

    const from = vi.fn((table: string) => {
      if (table === 'story_maps') return { select: storyMapsSelect };
      if (table === 'story_map_integration_settings') return { select: mapSettingsSelect };
      return {};
    });

    const candidate = await findStoryMapImportCandidate(
      { from },
      { teamId: 'team_1', linearProjectId: null, labelNames: ['Story'] },
    );
    expect(candidate).toBeNull();
  });
});

describe('ensureUntriagedTaskId', () => {
  it('creates untriaged lane and reorders activity first when missing', async () => {
    const activitiesOrder = vi.fn().mockResolvedValue({
      data: [{ id: 'activity_existing', name: 'Plan', sort_order: 0 }],
      error: null,
    });
    const activitiesEq = vi.fn().mockReturnValue({ order: activitiesOrder });
    const activitiesSelect = vi.fn().mockReturnValue({ eq: activitiesEq });

    const activityInsertSingle = vi.fn().mockResolvedValue({
      data: { id: 'activity_untriaged', name: 'Untriaged', sort_order: 1 },
      error: null,
    });
    const activityInsertSelect = vi.fn().mockReturnValue({ single: activityInsertSingle });
    const activityInsert = vi.fn().mockReturnValue({ select: activityInsertSelect });

    const tasksOrder = vi.fn().mockResolvedValue({ data: [], error: null });
    const tasksEq = vi.fn().mockReturnValue({ order: tasksOrder });
    const tasksSelect = vi.fn().mockReturnValue({ eq: tasksEq });

    const taskInsertSingle = vi.fn().mockResolvedValue({
      data: { id: 'task_untriaged', name: 'Untriaged', sort_order: 0 },
      error: null,
    });
    const taskInsertSelect = vi.fn().mockReturnValue({ single: taskInsertSingle });
    const taskInsert = vi.fn().mockReturnValue({ select: taskInsertSelect });

    const rpc = vi.fn().mockResolvedValue({ error: null });

    const from = vi.fn((table: string) => {
      if (table === 'activities') return { select: activitiesSelect, insert: activityInsert };
      if (table === 'tasks') return { select: tasksSelect, insert: taskInsert };
      return {};
    });

    const taskId = await ensureUntriagedTaskId({ from, rpc } as never, 'map_1');

    expect(taskId).toBe('task_untriaged');
    expect(rpc).toHaveBeenCalledWith('reorder_activities', {
      p_story_map_id: 'map_1',
      p_order: ['activity_untriaged', 'activity_existing'],
    });
  });
});
