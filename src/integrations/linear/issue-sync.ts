import {
  type Issue,
  type IssuePayload,
  LinearClient,
  LinearError,
  NetworkLinearError,
  RatelimitedLinearError,
} from '@linear/sdk';
import type { LinearIssueSnapshot, LinearIssueSync, LinearIssueUpsertInput } from '@/integrations/linear/types';
import { env } from '@/lib/env';

const DEFAULT_MAX_RETRIES = 2;
const BASE_BACKOFF_MS = 250;

type SleepFn = (ms: number) => Promise<void>;

type LinearClientLike = Pick<LinearClient, 'issue' | 'createIssue' | 'updateIssue'>;

export interface LinearIssueSyncOptions {
  apiKey?: string;
  maxRetries?: number;
  sleep?: SleepFn;
  client?: LinearClientLike;
}

function sleepMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getConfiguredApiKey(): string | null {
  return env.linearApiKey();
}

function getBackoffMs(attempt: number): number {
  return BASE_BACKOFF_MS * 2 ** attempt;
}

function toRetryDelayMs(error: unknown, attempt: number): number {
  if (error instanceof RatelimitedLinearError && typeof error.retryAfter === 'number' && error.retryAfter >= 0) {
    return Math.ceil(error.retryAfter * 1000);
  }

  return getBackoffMs(attempt);
}

function isRetryable(error: unknown): boolean {
  if (error instanceof RatelimitedLinearError) return true;
  if (error instanceof NetworkLinearError) return true;
  if (error instanceof LinearError && (error.status === 429 || (error.status ?? 0) >= 500)) return true;
  return false;
}

function toSnapshot(issue: Issue): LinearIssueSnapshot {
  return {
    id: issue.id,
    identifier: issue.identifier,
    title: issue.title,
    description: issue.description ?? null,
    stateId: issue.stateId ?? null,
    updatedAt: issue.updatedAt.toISOString(),
  };
}

function createMissingKeyError(): Error {
  return new Error('Linear issue sync enabled but API key is missing (LINEAR_API_KEY)');
}

async function withRetry<T>(run: () => Promise<T>, maxRetries: number, sleep: SleepFn): Promise<T> {
  const retries = Math.max(0, maxRetries);

  for (let attempt = 0; ; attempt += 1) {
    try {
      return await run();
    } catch (error) {
      const canRetry = attempt < retries && isRetryable(error);
      if (!canRetry) throw error;
      await sleep(toRetryDelayMs(error, attempt));
    }
  }
}

function getIssueFromPayload(payload: IssuePayload, operation: string): Promise<Issue> {
  if (!payload.issue) {
    throw new Error(`Linear ${operation} returned no issue`);
  }

  return payload.issue;
}

export function createLinearIssueSync(enabled: boolean, options: LinearIssueSyncOptions = {}): LinearIssueSync | null {
  if (!enabled) return null;

  const apiKey = options.apiKey ?? getConfiguredApiKey() ?? '';
  if (!apiKey && !options.client) throw createMissingKeyError();

  const client =
    options.client ??
    new LinearClient({
      apiKey,
    });

  const maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
  const sleep = options.sleep ?? sleepMs;

  return {
    async getIssueById(issueId: string): Promise<LinearIssueSnapshot | null> {
      const issue = await withRetry(() => client.issue(issueId), maxRetries, sleep);
      if (!issue?.id) return null;
      return toSnapshot(issue);
    },

    async createIssue(input: LinearIssueUpsertInput): Promise<LinearIssueSnapshot> {
      const payload = await withRetry(() => client.createIssue(input), maxRetries, sleep);
      const issue = await getIssueFromPayload(payload, 'createIssue');
      return toSnapshot(issue);
    },

    async updateIssue(issueId: string, input: Partial<LinearIssueUpsertInput>): Promise<LinearIssueSnapshot> {
      const payload = await withRetry(
        () => client.updateIssue(issueId, input as Parameters<LinearClientLike['updateIssue']>[1]),
        maxRetries,
        sleep,
      );
      const issue = await getIssueFromPayload(payload, 'updateIssue');
      return toSnapshot(issue);
    },
  };
}
