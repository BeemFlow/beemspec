import { describe, expect, it, vi } from 'vitest';
import {
  getLinearStorySyncTargetForStory,
  getLinearStorySyncTargetForStoryMap,
  getLinearStorySyncTargetForTask,
} from './settings';

describe('linear settings target resolution', () => {
  it('resolves target from integration_settings for task', async () => {
    const taskSingle = vi.fn().mockResolvedValue({
      data: {
        activities: {
          story_maps: {
            team_id: 'team_db_1',
          },
        },
      },
      error: null,
    });
    const taskEq = vi.fn().mockReturnValue({ single: taskSingle });
    const taskSelect = vi.fn().mockReturnValue({ eq: taskEq });

    const settingsMaybeSingle = vi.fn().mockResolvedValue({
      data: {
        linear_team_id: 'linear_team_db',
        linear_project_id: 'linear_project_db',
        linear_state_id: null,
      },
      error: null,
    });
    const settingsEq = vi.fn().mockReturnValue({ maybeSingle: settingsMaybeSingle });
    const settingsSelect = vi.fn().mockReturnValue({ eq: settingsEq });

    const from = vi.fn((table: string) => {
      if (table === 'tasks') return { select: taskSelect };
      if (table === 'integration_settings') return { select: settingsSelect };
      return {};
    });

    const target = await getLinearStorySyncTargetForTask({ from }, 'task_1');

    expect(target).toEqual({
      teamId: 'linear_team_db',
      projectId: 'linear_project_db',
      stateId: undefined,
    });
  });

  it('returns null when settings unavailable', async () => {
    const from = vi.fn().mockReturnValue({});
    const target = await getLinearStorySyncTargetForStory({ from }, 'story_1');

    expect(target).toBeNull();
  });

  it('resolves target for story map id', async () => {
    const storyMapSingle = vi.fn().mockResolvedValue({
      data: { team_id: 'team_db_1' },
      error: null,
    });
    const storyMapEq = vi.fn().mockReturnValue({ single: storyMapSingle });
    const storyMapSelect = vi.fn().mockReturnValue({ eq: storyMapEq });

    const settingsMaybeSingle = vi.fn().mockResolvedValue({
      data: {
        linear_team_id: 'linear_team_db',
        linear_project_id: null,
        linear_state_id: null,
      },
      error: null,
    });
    const settingsEq = vi.fn().mockReturnValue({ maybeSingle: settingsMaybeSingle });
    const settingsSelect = vi.fn().mockReturnValue({ eq: settingsEq });

    const from = vi.fn((table: string) => {
      if (table === 'story_maps') return { select: storyMapSelect };
      if (table === 'integration_settings') return { select: settingsSelect };
      return {};
    });

    const target = await getLinearStorySyncTargetForStoryMap({ from }, 'story_map_1');

    expect(target).toEqual({
      teamId: 'linear_team_db',
      projectId: undefined,
      stateId: undefined,
    });
  });
});
