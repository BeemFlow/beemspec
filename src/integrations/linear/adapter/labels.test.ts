import { beforeEach, describe, expect, it, vi } from 'vitest';

const { LinearClientMock } = vi.hoisted(() => ({
  LinearClientMock: vi.fn(),
}));

vi.mock('@linear/sdk', () => ({
  LinearClient: LinearClientMock,
}));

import {
  ensureLinearIssueHasLabel,
  getLinearIssueLabelNames,
  getLinearIssueProjectIdFromPayload,
  getLinearIssueTeamIdFromPayload,
  linearPayloadHasLabel,
} from './labels';

describe('linear label sync helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('parses label names and membership from webhook payloads', () => {
    const payload = {
      team: { id: 'team-1' },
      projectId: 'project-1',
      labels: { nodes: [{ name: 'Story' }, { name: ' Story ' }, { name: 'Bug' }, { name: '' }] },
    } as Record<string, unknown>;

    expect(linearPayloadHasLabel(payload, 'story')).toBe(true);
    expect(getLinearIssueLabelNames(payload)).toEqual(['Story', 'Bug']);
    expect(getLinearIssueTeamIdFromPayload(payload)).toBe('team-1');
    expect(getLinearIssueProjectIdFromPayload(payload)).toBe('project-1');
  });

  it('returns empty-ish values when webhook payload shapes are missing', () => {
    expect(linearPayloadHasLabel(null, 'Story')).toBe(false);
    expect(getLinearIssueLabelNames({ labels: [] })).toEqual([]);
    expect(getLinearIssueTeamIdFromPayload({ team: '' })).toBeNull();
    expect(getLinearIssueProjectIdFromPayload({ project: { id: '' } })).toBeNull();
  });

  it('does nothing when the issue already has the requested label', async () => {
    const issueLabels = vi.fn().mockResolvedValue({ nodes: [{ id: 'label-1', name: 'Story' }] });
    const issue = vi.fn().mockResolvedValue({ id: 'issue-1', labels: issueLabels });
    const updateIssue = vi.fn();
    LinearClientMock.mockImplementation(function LinearClientMockImplementation() {
      return { issue, updateIssue };
    });

    await ensureLinearIssueHasLabel({ authToken: 'token', issueId: 'issue-1', teamId: 'team-1', labelName: ' story ' });

    expect(updateIssue).not.toHaveBeenCalled();
  });

  it('creates a missing label for the team and attaches it to the issue', async () => {
    const issueLabels = vi.fn().mockResolvedValue({ nodes: [{ id: 'label-1', name: 'Existing' }] });
    const issue = vi.fn().mockResolvedValue({ id: 'issue-1', labels: issueLabels });
    const teamLabels = vi.fn().mockResolvedValue({ nodes: [{ id: 'label-1', name: 'Existing' }] });
    const team = vi.fn().mockResolvedValue({ id: 'team-1', labels: teamLabels });
    const createIssueLabel = vi.fn().mockResolvedValue({ issueLabel: Promise.resolve({ id: 'label-2' }) });
    const updateIssue = vi.fn().mockResolvedValue(undefined);
    LinearClientMock.mockImplementation(function LinearClientMockImplementation() {
      return { issue, team, createIssueLabel, updateIssue };
    });

    await ensureLinearIssueHasLabel({ authToken: 'token', issueId: 'issue-1', teamId: 'team-1', labelName: 'Story' });

    expect(createIssueLabel).toHaveBeenCalledWith({ teamId: 'team-1', name: 'Story' });
    expect(updateIssue).toHaveBeenCalledWith('issue-1', { labelIds: ['label-1', 'label-2'] });
  });

  it('reuses an existing team label instead of creating a duplicate', async () => {
    const issueLabels = vi.fn().mockResolvedValue({ nodes: [] });
    const issue = vi.fn().mockResolvedValue({ id: 'issue-1', labels: issueLabels });
    const teamLabels = vi.fn().mockResolvedValue({ nodes: [{ id: 'label-9', name: 'Story' }] });
    const team = vi.fn().mockResolvedValue({ id: 'team-1', labels: teamLabels });
    const createIssueLabel = vi.fn();
    const updateIssue = vi.fn().mockResolvedValue(undefined);
    LinearClientMock.mockImplementation(function LinearClientMockImplementation() {
      return { issue, team, createIssueLabel, updateIssue };
    });

    await ensureLinearIssueHasLabel({ authToken: 'token', issueId: 'issue-1', teamId: 'team-1', labelName: 'Story' });

    expect(createIssueLabel).not.toHaveBeenCalled();
    expect(updateIssue).toHaveBeenCalledWith('issue-1', { labelIds: ['label-9'] });
  });

  it('finds an existing team label on a later page', async () => {
    const issueLabels = vi.fn().mockResolvedValue({ nodes: [] });
    const issue = vi.fn().mockResolvedValue({ id: 'issue-1', labels: issueLabels });
    const fetchNext = vi.fn().mockResolvedValue({
      nodes: [{ id: 'label-page-2', name: 'Story' }],
      pageInfo: { hasNextPage: false },
    });
    const teamLabels = vi.fn().mockResolvedValue({
      nodes: [{ id: 'label-page-1', name: 'Other' }],
      pageInfo: { hasNextPage: true },
      fetchNext,
    });
    const team = vi.fn().mockResolvedValue({ id: 'team-1', labels: teamLabels });
    const createIssueLabel = vi.fn();
    const updateIssue = vi.fn().mockResolvedValue(undefined);
    LinearClientMock.mockImplementation(function LinearClientMockImplementation() {
      return { issue, team, createIssueLabel, updateIssue };
    });

    await ensureLinearIssueHasLabel({ authToken: 'token', issueId: 'issue-1', teamId: 'team-1', labelName: 'Story' });

    expect(fetchNext).toHaveBeenCalled();
    expect(createIssueLabel).not.toHaveBeenCalled();
    expect(updateIssue).toHaveBeenCalledWith('issue-1', { labelIds: ['label-page-2'] });
  });
});
