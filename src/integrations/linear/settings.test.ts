import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { LinearSettingsForm } from '@/components/integrations/linear/TeamLinearSettings';
import {
  DEFAULT_AUTO_IMPORT_LABELED_ISSUES,
  DEFAULT_LINEAR_IMPORT_LABEL,
  getSyncTargetForStory,
  getSyncTargetForStoryMap,
  toStoryMapLinearImportSettings,
} from './settings';

describe('linear settings target resolution', () => {
  it('surfaces settings infrastructure failures', async () => {
    const from = vi.fn().mockReturnValue({});
    await expect(getSyncTargetForStory({ from }, 'story_1')).rejects.toThrow();
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
        linear_status_mapping: { todo: 'state_todo' },
      },
      error: null,
    });
    const settingsEq = vi.fn().mockReturnValue({ maybeSingle: settingsMaybeSingle });
    const settingsSelect = vi.fn().mockReturnValue({ eq: settingsEq });

    const mapSettingsMaybeSingle = vi.fn().mockResolvedValue({
      data: {
        linear_project_id: 'linear_project_map',
        use_team_status_mapping: true,
        linear_status_mapping: {},
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
      statusMapping: { todo: 'state_todo' },
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
        linear_status_mapping: {},
      },
      error: null,
    });
    const settingsEq = vi.fn().mockReturnValue({ maybeSingle: settingsMaybeSingle });
    const settingsSelect = vi.fn().mockReturnValue({ eq: settingsEq });

    const mapSettingsMaybeSingle = vi.fn().mockResolvedValue({
      data: {
        linear_project_id: null,
        use_team_status_mapping: true,
        linear_status_mapping: {},
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

  it('renders a selectable Linear team control when multiple teams are available', () => {
    const markup = renderToStaticMarkup(
      createElement(LinearSettingsForm, {
        isOwner: true,
        workspaceName: 'BeemFlow',
        teamId: '',
        optionsLoading: false,
        teamOptions: [
          { id: 'team_1', name: 'Engineering', key: 'ENG' },
          { id: 'team_2', name: 'Product', key: 'PRD' },
        ],
        stateOptions: [],
        statusMapping: {},
        saving: false,
        onSave: async () => {},
        onTeamChange: () => {},
        onStatusMappingChange: () => {},
      }),
    );

    expect(markup).toContain('id="linear-team-name"');
    expect(markup).toContain('data-slot="select-trigger"');
    expect(markup).not.toContain('<input id="linear-team-name"');
  });
});
