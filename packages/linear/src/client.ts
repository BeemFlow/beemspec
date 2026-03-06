import {
  type Issue,
  type IssuePayload,
  LinearClient,
  LinearError,
  NetworkLinearError,
  RatelimitedLinearError,
} from '@linear/sdk';
import type { IssueSnapshot, IssueSync, IssueUpsertInput } from '@/integrations/sync';

const DEFAULT_MAX_RETRIES = 2;
const BASE_BACKOFF_MS = 250;

type SleepFn = (ms: number) => Promise<void>;

type LinearClientLike = Pick<LinearClient, 'issue' | 'createIssue' | 'updateIssue'>;

/** Options for creating a Linear IssueSync client. Credentials are injected. */
export interface LinearClientOptions {
  apiKey?: string;
  accessToken?: string;
  maxRetries?: number;
  sleep?: SleepFn;
  client?: LinearClientLike;
}

function sleepMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

function toSnapshot(issue: Issue): IssueSnapshot {
  return {
    id: issue.id,
    identifier: issue.identifier,
    title: issue.title,
    description: issue.description ?? null,
    stateId: issue.stateId ?? null,
    updatedAt: issue.updatedAt.toISOString(),
  };
}

function createMissingAuthError(): Error {
  return new Error('Linear issue sync enabled but no auth credentials are configured');
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

/** Information about the authenticated Linear user's organization. */
export interface LinearViewerInfo {
  organizationId: string | undefined;
}

export interface LinearTeamOption {
  id: string;
  name: string;
  key: string | null;
}

export interface LinearProjectOption {
  id: string;
  name: string;
  teamIds: string[];
}

export interface LinearStateOption {
  id: string;
  name: string;
  type: string | null;
  teamId: string;
}

export interface LinearWorkspaceOptions {
  organizationId: string | undefined;
  teams: LinearTeamOption[];
  projects: LinearProjectOption[];
  states: LinearStateOption[];
}

interface LinearConnection<T> {
  nodes?: Array<T | null> | null;
}

interface LinearProjectLike {
  id?: string | null;
  name?: string | null;
}

interface LinearStateLike {
  id?: string | null;
  name?: string | null;
  type?: string | null;
}

interface LinearTeamLike {
  id?: string | null;
  name?: string | null;
  key?: string | null;
  projects?: () => Promise<LinearConnection<LinearProjectLike>>;
  states?: () => Promise<LinearConnection<LinearStateLike>>;
}

/**
 * Fetch the authenticated user's organization from Linear.
 * Access token is injected — no env vars are read.
 */
export async function getLinearViewerInfo(accessToken: string): Promise<LinearViewerInfo> {
  const client = new LinearClient({ accessToken });
  const viewer = await client.viewer;
  const organization = await viewer.organization;
  return { organizationId: organization?.id };
}

export async function getLinearWorkspaceOptions(accessToken: string): Promise<LinearWorkspaceOptions> {
  const client = new LinearClient({ accessToken });
  const viewer = await client.viewer;
  const organization = await viewer.organization;

  const teamsConnection = (await client.teams()) as unknown as LinearConnection<LinearTeamLike>;
  const teamNodes = teamsConnection.nodes ?? [];

  const teams: LinearTeamOption[] = [];
  const projectsById = new Map<string, LinearProjectOption>();
  const statesById = new Map<string, LinearStateOption>();

  for (const node of teamNodes) {
    const team = node as LinearTeamLike | null;
    const teamId = typeof team?.id === 'string' ? team.id : null;
    const teamName = typeof team?.name === 'string' ? team.name.trim() : '';
    if (!teamId || !teamName) continue;

    teams.push({
      id: teamId,
      name: teamName,
      key: typeof team?.key === 'string' && team.key.trim().length > 0 ? team.key : null,
    });

    const projectsConnection = team?.projects ? await team.projects() : { nodes: [] };
    for (const projectNode of projectsConnection.nodes ?? []) {
      const projectId = typeof projectNode?.id === 'string' ? projectNode.id : null;
      const projectName = typeof projectNode?.name === 'string' ? projectNode.name.trim() : '';
      if (!projectId || !projectName) continue;

      const existing = projectsById.get(projectId);
      if (existing) {
        if (!existing.teamIds.includes(teamId)) {
          existing.teamIds.push(teamId);
        }
        continue;
      }

      projectsById.set(projectId, {
        id: projectId,
        name: projectName,
        teamIds: [teamId],
      });
    }

    const statesConnection = team?.states ? await team.states() : { nodes: [] };
    for (const stateNode of statesConnection.nodes ?? []) {
      const stateId = typeof stateNode?.id === 'string' ? stateNode.id : null;
      const stateName = typeof stateNode?.name === 'string' ? stateNode.name.trim() : '';
      if (!stateId || !stateName) continue;

      if (!statesById.has(stateId)) {
        statesById.set(stateId, {
          id: stateId,
          name: stateName,
          teamId,
          type: typeof stateNode?.type === 'string' && stateNode.type.trim().length > 0 ? stateNode.type : null,
        });
      }
    }
  }

  teams.sort((a, b) => a.name.localeCompare(b.name));

  const projects = [...projectsById.values()].sort((a, b) => a.name.localeCompare(b.name));
  const states = [...statesById.values()].sort((a, b) => a.name.localeCompare(b.name));

  return {
    organizationId: organization?.id,
    teams,
    projects,
    states,
  };
}

/**
 * Create an IssueSync implementation backed by the Linear SDK.
 * Credentials are injected via options -- no env vars are read.
 *
 * Returns null when `enabled` is false (feature-gated at the app layer).
 */
export function createLinearClient(enabled: boolean, options: LinearClientOptions = {}): IssueSync | null {
  if (!enabled) return null;

  const accessToken = options.accessToken ?? null;
  const apiKey = options.apiKey ?? '';
  if (!accessToken && !apiKey && !options.client) throw createMissingAuthError();

  const client = options.client ?? new LinearClient(accessToken ? { accessToken } : { apiKey });

  const maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
  const sleep = options.sleep ?? sleepMs;

  return {
    async getIssueById(issueId: string): Promise<IssueSnapshot | null> {
      const issue = await withRetry(() => client.issue(issueId), maxRetries, sleep);
      if (!issue?.id) return null;
      return toSnapshot(issue);
    },

    async createIssue(input: IssueUpsertInput): Promise<IssueSnapshot> {
      const payload = await withRetry(() => client.createIssue(input), maxRetries, sleep);
      const issue = await getIssueFromPayload(payload, 'createIssue');
      return toSnapshot(issue);
    },

    async updateIssue(issueId: string, input: Partial<IssueUpsertInput>): Promise<IssueSnapshot> {
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
