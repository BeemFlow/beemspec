import { describe, expect, it } from 'vitest';
import {
  getLinearIssueLabelNames,
  getLinearIssueProjectIdFromPayload,
  getLinearIssueTeamIdFromPayload,
  linearPayloadHasLabel,
} from './label-sync';

describe('linear label sync helpers', () => {
  it('detects configured label case-insensitively', () => {
    const payload = {
      labels: {
        nodes: [{ name: 'Story' }, { name: 'Bug' }],
      },
    };

    expect(linearPayloadHasLabel(payload, 'story')).toBe(true);
    expect(linearPayloadHasLabel(payload, 'Feature')).toBe(false);
  });

  it('extracts de-duplicated label names from payload', () => {
    const payload = {
      labels: {
        nodes: [{ name: 'Story' }, { name: 'Story' }, { name: 'Todo' }],
      },
    };

    expect(getLinearIssueLabelNames(payload)).toEqual(['Story', 'Todo']);
  });

  it('extracts label names when payload uses labels array shape', () => {
    const payload = {
      labels: [{ name: 'Story' }, { name: 'Bug' }],
    };

    expect(getLinearIssueLabelNames(payload)).toEqual(['Story', 'Bug']);
  });

  it('reads team and project ids from direct or nested payload fields', () => {
    expect(getLinearIssueTeamIdFromPayload({ teamId: 'team_1' })).toBe('team_1');
    expect(getLinearIssueTeamIdFromPayload({ team: 'team_3' })).toBe('team_3');
    expect(getLinearIssueTeamIdFromPayload({ team: { id: 'team_2' } })).toBe('team_2');
    expect(getLinearIssueTeamIdFromPayload({})).toBeNull();

    expect(getLinearIssueProjectIdFromPayload({ projectId: 'project_1' })).toBe('project_1');
    expect(getLinearIssueProjectIdFromPayload({ project: 'project_3' })).toBe('project_3');
    expect(getLinearIssueProjectIdFromPayload({ project: { id: 'project_2' } })).toBe('project_2');
    expect(getLinearIssueProjectIdFromPayload({})).toBeNull();
  });
});
