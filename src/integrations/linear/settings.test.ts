import { describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_AUTO_IMPORT_LABELED_ISSUES,
  DEFAULT_LINEAR_IMPORT_LABEL,
  getSyncTargetForStory,
  getSyncTargetForStoryMap,
  toStoryMapLinearImportSettings,
} from './settings';

describe('linear settings target resolution', () => {
  it('returns null when settings unavailable', async () => {
    const from = vi.fn().mockReturnValue({});
    const target = await getSyncTargetForStory({ from }, 'story_1');

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
        linear_state_id: null,
      },
      error: null,
    });
    const settingsEq = vi.fn().mockReturnValue({ maybeSingle: settingsMaybeSingle });
    const settingsSelect = vi.fn().mockReturnValue({ eq: settingsEq });

    const mapSettingsMaybeSingle = vi.fn().mockResolvedValue({
      data: {
        linear_project_id: 'linear_project_map',
        linear_state_id: null,
      },
      error: null,
    });
    const mapSettingsEq = vi.fn().mockReturnValue({ maybeSingle: mapSettingsMaybeSingle });
    const mapSettingsSelect = vi.fn().mockReturnValue({ eq: mapSettingsEq });

    const from = vi.fn((table: string) => {
      if (table === 'story_maps') return { select: storyMapSelect };
      if (table === 'integration_settings') return { select: settingsSelect };
      if (table === 'story_map_integration_settings') return { select: mapSettingsSelect };
      return {};
    });

    const target = await getSyncTargetForStoryMap({ from }, 'story_map_1');

    expect(target).toEqual({
      teamId: 'linear_team_db',
      projectId: 'linear_project_map',
      stateId: undefined,
    });
  });

  it('returns null when map-level project is not configured', async () => {
    const storyMapSingle = vi.fn().mockResolvedValue({
      data: { team_id: 'team_db_1' },
      error: null,
    });
    const storyMapEq = vi.fn().mockReturnValue({ single: storyMapSingle });
    const storyMapSelect = vi.fn().mockReturnValue({ eq: storyMapEq });

    const settingsMaybeSingle = vi.fn().mockResolvedValue({
      data: {
        linear_team_id: 'linear_team_db',
        linear_state_id: null,
      },
      error: null,
    });
    const settingsEq = vi.fn().mockReturnValue({ maybeSingle: settingsMaybeSingle });
    const settingsSelect = vi.fn().mockReturnValue({ eq: settingsEq });

    const mapSettingsMaybeSingle = vi.fn().mockResolvedValue({
      data: {
        linear_project_id: null,
        linear_state_id: null,
      },
      error: null,
    });
    const mapSettingsEq = vi.fn().mockReturnValue({ maybeSingle: mapSettingsMaybeSingle });
    const mapSettingsSelect = vi.fn().mockReturnValue({ eq: mapSettingsEq });

    const from = vi.fn((table: string) => {
      if (table === 'story_maps') return { select: storyMapSelect };
      if (table === 'integration_settings') return { select: settingsSelect };
      if (table === 'story_map_integration_settings') return { select: mapSettingsSelect };
      return {};
    });

    const target = await getSyncTargetForStoryMap({ from }, 'story_map_1');
    expect(target).toBeNull();
  });

  it('uses label import defaults when settings are missing', () => {
    expect(toStoryMapLinearImportSettings(null)).toEqual({
      autoImportLabeledIssues: DEFAULT_AUTO_IMPORT_LABELED_ISSUES,
      importLabelName: DEFAULT_LINEAR_IMPORT_LABEL,
    });
  });
});
