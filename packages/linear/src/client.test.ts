import { type Issue, type IssuePayload, type LinearClient, RatelimitedLinearError } from '@linear/sdk';
import { describe, expect, it, vi } from 'vitest';
import { createLinearClient } from './client';

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

function makeClient(overrides: Partial<Pick<LinearClient, 'issue' | 'createIssue' | 'updateIssue'>> = {}) {
  return {
    issue: vi.fn(async () => makeIssue()),
    createIssue: vi.fn(async () => makePayload(makeIssue())),
    updateIssue: vi.fn(async () => makePayload(makeIssue())),
    ...overrides,
  } as Pick<LinearClient, 'issue' | 'createIssue' | 'updateIssue'>;
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
});
