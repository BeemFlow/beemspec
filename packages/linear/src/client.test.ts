import { type Issue, type IssuePayload, type LinearClient, RatelimitedLinearError } from '@linear/sdk';
import { describe, expect, it, vi } from 'vitest';
import { createLinearClient, listLinearProjectIssuesForImport } from './client';

function makeIssue(overrides: Partial<Issue> = {}): Issue {
  return {
    id: 'lin_issue_1',
    identifier: 'ENG-101',
    title: 'Implement release sync',
    description: 'Story mapped from BeemSpec',
    stateId: 'state_1',
    updatedAt: new Date('2026-02-13T10:00:00.000Z'),
    ...overrides,
  } as Issue;
}

function makePayload(issue: Issue): IssuePayload {
  return {
    issue: Promise.resolve(issue),
  } as unknown as IssuePayload;
}

function makeClient(
  overrides: Partial<
    Pick<LinearClient, 'issue' | 'createIssue' | 'updateIssue'> & { deleteIssue: (issueId: string) => Promise<unknown> }
  > = {},
) {
  return {
    issue: vi.fn(async () => makeIssue()),
    createIssue: vi.fn(async () => makePayload(makeIssue())),
    updateIssue: vi.fn(async () => makePayload(makeIssue())),
    deleteIssue: vi.fn(async () => ({ success: true })),
    ...overrides,
  } as Pick<LinearClient, 'issue' | 'createIssue' | 'updateIssue'> & {
    deleteIssue: (issueId: string) => Promise<unknown>;
  };
}

describe('linear client (issue sync port)', () => {
  it('returns null when feature is disabled', () => {
    expect(createLinearClient(false)).toBeNull();
  });

  it('creates issue via sdk client', async () => {
    const client = makeClient();
    const sync = createLinearClient(true, {
      apiKey: 'linear_api_key',
      client,
    });

    const created = await sync?.createIssue({
      title: 'Implement release sync',
      description: 'Story mapped from BeemSpec',
      teamId: 'team_1',
      stateId: 'state_1',
    });

    expect(created).toEqual({
      id: 'lin_issue_1',
      identifier: 'ENG-101',
      title: 'Implement release sync',
      description: 'Story mapped from BeemSpec',
      updatedAt: '2026-02-13T10:00:00.000Z',
      stateId: 'state_1',
    });

    expect(client.createIssue).toHaveBeenCalledTimes(1);
  });

  it('retries once on SDK ratelimited error before succeeding', async () => {
    const sleep = vi.fn().mockResolvedValue(undefined);
    const client = makeClient({
      issue: vi
        .fn()
        .mockRejectedValueOnce(new RatelimitedLinearError())
        .mockResolvedValueOnce(makeIssue({ id: 'lin_issue_2', identifier: 'ENG-102' })),
    });

    const sync = createLinearClient(true, {
      apiKey: 'linear_api_key',
      client,
      sleep,
      maxRetries: 2,
    });

    const result = await sync?.getIssueById('lin_issue_2');

    expect(result?.id).toBe('lin_issue_2');
    expect(client.issue).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledTimes(1);
  });

  it('throws clear error when enabled without API key', () => {
    expect(() => createLinearClient(true, { apiKey: '' })).toThrow(
      'Linear issue sync enabled but no auth credentials are configured',
    );
  });

  it('supports OAuth access token authentication', async () => {
    const client = makeClient();
    const sync = createLinearClient(true, {
      accessToken: 'linear_oauth_access_token',
      client,
    });

    const issue = await sync?.getIssueById('lin_issue_1');

    expect(issue?.id).toBe('lin_issue_1');
    expect(client.issue).toHaveBeenCalledTimes(1);
  });

  it('deletes issue via sdk client', async () => {
    const client = makeClient();
    const sync = createLinearClient(true, {
      apiKey: 'linear_api_key',
      client,
    });

    await sync?.deleteIssue('lin_issue_1');

    expect(client.deleteIssue).toHaveBeenCalledWith('lin_issue_1');
  });
});

describe('listLinearProjectIssuesForImport', () => {
  it('paginates project issues and maps label/state names via team metadata', async () => {
    const issueA = {
      id: 'lin_1',
      identifier: 'BEE-1',
      title: 'Issue A',
      description: 'desc A',
      updatedAt: new Date('2026-03-08T01:00:00.000Z'),
      teamId: 'team_1',
      projectId: 'project_1',
      stateId: 'state_todo',
      labelIds: ['label_story'],
      archivedAt: null,
    } as unknown as Issue;

    const issueB = {
      id: 'lin_2',
      identifier: 'BEE-2',
      title: 'Issue B',
      description: 'desc B',
      updatedAt: new Date('2026-03-08T02:00:00.000Z'),
      teamId: 'team_1',
      projectId: 'project_1',
      stateId: 'state_done',
      labelIds: ['label_story', 'label_bug'],
      archivedAt: null,
    } as unknown as Issue;

    const page2 = {
      nodes: [issueB],
      pageInfo: { hasNextPage: false },
      fetchNext: vi.fn(),
    };

    const page1 = {
      nodes: [issueA],
      pageInfo: { hasNextPage: true },
      fetchNext: vi.fn(async () => page2),
    };

    const project = {
      id: 'project_1',
      issues: vi.fn(async () => page1),
    };

    const team = {
      id: 'team_1',
      labels: vi.fn(async () => ({
        nodes: [
          { id: 'label_story', name: 'Story' },
          { id: 'label_bug', name: 'Bug' },
        ],
        pageInfo: { hasNextPage: false },
        fetchNext: vi.fn(),
      })),
      states: vi.fn(async () => ({
        nodes: [
          { id: 'state_todo', name: 'Todo' },
          { id: 'state_done', name: 'Done' },
        ],
        pageInfo: { hasNextPage: false },
        fetchNext: vi.fn(),
      })),
    };

    const client = {
      project: vi.fn(async () => project),
      team: vi.fn(async () => team),
    };

    const results = await listLinearProjectIssuesForImport('token', 'project_1', { client: client as never });

    expect(client.project).toHaveBeenCalledWith('project_1');
    expect(client.team).toHaveBeenCalledWith('team_1');
    expect(project.issues).toHaveBeenCalledTimes(1);
    expect(page1.fetchNext).toHaveBeenCalledTimes(1);
    expect(results).toEqual([
      {
        id: 'lin_1',
        identifier: 'BEE-1',
        title: 'Issue A',
        description: 'desc A',
        stateName: 'Todo',
        updatedAt: '2026-03-08T01:00:00.000Z',
        teamId: 'team_1',
        projectId: 'project_1',
        labelNames: ['Story'],
      },
      {
        id: 'lin_2',
        identifier: 'BEE-2',
        title: 'Issue B',
        description: 'desc B',
        stateName: 'Done',
        updatedAt: '2026-03-08T02:00:00.000Z',
        teamId: 'team_1',
        projectId: 'project_1',
        labelNames: ['Story', 'Bug'],
      },
    ]);
  });

  it('skips archived and malformed issues', async () => {
    const project = {
      id: 'project_1',
      issues: vi.fn(async () => ({
        nodes: [
          { id: 'lin_archived', archivedAt: new Date(), updatedAt: new Date(), teamId: 'team_1', labelIds: [] },
          { id: 'lin_missing_updated_at', teamId: 'team_1', labelIds: [] },
        ],
        pageInfo: { hasNextPage: false },
        fetchNext: vi.fn(),
      })),
    };

    const client = {
      project: vi.fn(async () => project),
      team: vi.fn(async () => ({
        id: 'team_1',
        labels: vi.fn(async () => ({ nodes: [], pageInfo: { hasNextPage: false }, fetchNext: vi.fn() })),
        states: vi.fn(async () => ({ nodes: [], pageInfo: { hasNextPage: false }, fetchNext: vi.fn() })),
      })),
    };

    const results = await listLinearProjectIssuesForImport('token', 'project_1', { client: client as never });
    expect(results).toEqual([]);
  });
});
