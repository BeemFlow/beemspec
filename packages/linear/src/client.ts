import type { StoryStatus } from '@beemspec/storymap';
import type { IssueSnapshot, IssueSync, IssueUpsertInput } from '@beemspec/sync';
import {
  type Issue,
  type IssuePayload,
  LinearClient,
  LinearError,
  NetworkLinearError,
  RatelimitedLinearError,
} from '@linear/sdk';

const DEFAULT_MAX_RETRIES = 2;
const BASE_BACKOFF_MS = 250;

type SleepFn = (ms: number) => Promise<void>;

type LinearClientLike = Pick<LinearClient, 'issue' | 'createIssue' | 'updateIssue'> & {
  deleteIssue?: (issueId: string) => Promise<unknown>;
};

/** Options for creating a Linear IssueSync client. Credentials are injected. */
export interface LinearClientOptions {
  accessToken?: string;
  maxRetries?: number;
  sleep?: SleepFn;
  client?: LinearClientLike;
}

function sleepMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function createSdkClient(options: LinearClientOptions): LinearClientLike {
  if (options.client) return options.client;

  const accessToken = options.accessToken ?? null;
  if (!accessToken) throw createMissingAuthError();

  return new LinearClient({ accessToken });
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
  organizationName: string | undefined;
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
  organizationName: string | undefined;
  teams: LinearTeamOption[];
  projects: LinearProjectOption[];
  states: LinearStateOption[];
}

export interface LinearProjectIssueImportOption {
  id: string;
  identifier: string | null;
  title: string | null;
  description: string | null;
  stateName: string | null;
  updatedAt: string;
  teamId: string;
  projectId: string | null;
  labelNames: string[];
}

interface LinearConnection<T> {
  nodes?: Array<T | null> | null;
}

interface LinearConnectionPage<T> extends LinearConnection<T> {
  pageInfo?: { hasNextPage?: boolean | null } | null;
  fetchNext?: () => Promise<LinearConnectionPage<T>>;
}

type LinearProjectIssueImportClientLike = Pick<LinearClient, 'project' | 'team'>;

async function fetchAllConnectionNodes<T>(initial: LinearConnectionPage<T>): Promise<T[]> {
  const results: T[] = [];
  let page: LinearConnectionPage<T> | null = initial;

  for (;;) {
    if (!page) break;

    for (const node of page.nodes ?? []) {
      if (node) results.push(node);
    }

    if (!page.pageInfo?.hasNextPage || typeof page.fetchNext !== 'function') break;
    page = await page.fetchNext();
  }

  return results;
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
  projects?: (variables?: unknown) => Promise<LinearConnectionPage<LinearProjectLike>>;
  states?: (variables?: unknown) => Promise<LinearConnectionPage<LinearStateLike>>;
}

function toTeamOption(team: LinearTeamLike | null): LinearTeamOption | null {
  const id = typeof team?.id === 'string' ? team.id : null;
  const name = typeof team?.name === 'string' ? team.name.trim() : '';
  if (!id || !name) return null;

  return {
    id,
    name,
    key: typeof team?.key === 'string' && team.key.trim().length > 0 ? team.key : null,
  };
}

async function collectTeamProjects(
  team: LinearTeamLike,
  teamId: string,
  projectsById: Map<string, LinearProjectOption>,
) {
  const connection = team.projects ? await team.projects({ first: 100 }) : { nodes: [] };
  const projects = await fetchAllConnectionNodes(connection);

  for (const project of projects) {
    const id = typeof project?.id === 'string' ? project.id : null;
    const name = typeof project?.name === 'string' ? project.name.trim() : '';
    if (!id || !name) continue;

    const existing = projectsById.get(id);
    if (existing) {
      if (!existing.teamIds.includes(teamId)) existing.teamIds.push(teamId);
    } else {
      projectsById.set(id, { id, name, teamIds: [teamId] });
    }
  }
}

async function collectTeamStates(team: LinearTeamLike, teamId: string, statesById: Map<string, LinearStateOption>) {
  const connection = team.states ? await team.states({ first: 100 }) : { nodes: [] };
  const states = await fetchAllConnectionNodes(connection);

  for (const state of states) {
    const id = typeof state?.id === 'string' ? state.id : null;
    const name = typeof state?.name === 'string' ? state.name.trim() : '';
    if (!id || !name || statesById.has(id)) continue;

    statesById.set(id, {
      id,
      name,
      teamId,
      type: typeof state?.type === 'string' && state.type.trim().length > 0 ? state.type : null,
    });
  }
}

interface LinearStateForResolution {
  id?: string | null;
  name?: string | null;
  type?: string | null;
}

function normalizeStateText(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase().replaceAll(/\s+/g, '_');
}

function findStateByNames(states: LinearStateForResolution[], names: string[]): string | null {
  for (const name of names) {
    const normalized = normalizeStateText(name);
    const match = states.find((state) => normalizeStateText(state.name) === normalized);
    if (typeof match?.id === 'string' && match.id) return match.id;
  }
  return null;
}

function findStateByTypes(states: LinearStateForResolution[], types: string[]): string | null {
  for (const type of types) {
    const normalized = normalizeStateText(type);
    const match = states.find((state) => normalizeStateText(state.type) === normalized);
    if (typeof match?.id === 'string' && match.id) return match.id;
  }
  return null;
}

export function selectLinearStateIdForStoryStatus(
  states: LinearStateForResolution[],
  storyStatus: StoryStatus,
  fallbackStateId?: string,
): string | null {
  if (storyStatus === 'backlog') {
    return (
      findStateByTypes(states, ['backlog', 'unstarted']) ??
      findStateByNames(states, ['Backlog', 'Todo']) ??
      fallbackStateId ??
      null
    );
  }

  if (storyStatus === 'todo') {
    return (
      findStateByNames(states, ['Ready', 'Todo']) ??
      findStateByTypes(states, ['unstarted', 'backlog']) ??
      fallbackStateId ??
      null
    );
  }

  if (storyStatus === 'in_progress') {
    return (
      findStateByNames(states, ['In Progress']) ?? findStateByTypes(states, ['started']) ?? fallbackStateId ?? null
    );
  }

  if (storyStatus === 'in_review') {
    return (
      findStateByNames(states, ['In Review', 'Review']) ??
      findStateByTypes(states, ['started']) ??
      fallbackStateId ??
      null
    );
  }

  return (
    findStateByNames(states, ['Done', 'Completed']) ??
    findStateByTypes(states, ['completed']) ??
    fallbackStateId ??
    null
  );
}

export async function resolveLinearStateIdForStoryStatus(
  accessToken: string,
  teamId: string,
  storyStatus: StoryStatus,
  fallbackStateId?: string,
): Promise<string | null> {
  const client = new LinearClient({ accessToken });
  const team = await client.team(teamId);
  if (!team?.id) return fallbackStateId ?? null;

  const statesConnection = (await team.states({
    first: 100,
  } as never)) as LinearConnectionPage<LinearStateForResolution>;
  const states = await fetchAllConnectionNodes(statesConnection);
  if (states.length === 0) return fallbackStateId ?? null;

  return selectLinearStateIdForStoryStatus(states, storyStatus, fallbackStateId);
}

/**
 * Fetch the authenticated user's organization from Linear.
 * Access token is injected — no env vars are read.
 */
export async function getLinearViewerInfo(accessToken: string): Promise<LinearViewerInfo> {
  const client = new LinearClient({ accessToken });
  const viewer = await client.viewer;
  const organization = await viewer.organization;
  return { organizationId: organization?.id, organizationName: organization?.name ?? undefined };
}

export async function getLinearWorkspaceOptions(
  accessToken: string,
  options: { client?: LinearClient } = {},
): Promise<LinearWorkspaceOptions> {
  const client = options.client ?? new LinearClient({ accessToken });
  const viewer = await client.viewer;
  const organization = await viewer.organization;

  const teamsConnection = (await client.teams({ first: 100 })) as unknown as LinearConnectionPage<LinearTeamLike>;
  const teamNodes = await fetchAllConnectionNodes(teamsConnection);

  const teams: LinearTeamOption[] = [];
  const projectsById = new Map<string, LinearProjectOption>();
  const statesById = new Map<string, LinearStateOption>();

  for (const team of teamNodes) {
    const option = toTeamOption(team);
    if (!option) continue;

    teams.push(option);
    await collectTeamProjects(team, option.id, projectsById);
    await collectTeamStates(team, option.id, statesById);
  }

  teams.sort((a, b) => a.name.localeCompare(b.name));

  const projects = [...projectsById.values()].sort((a, b) => a.name.localeCompare(b.name));
  const states = [...statesById.values()].sort((a, b) => a.name.localeCompare(b.name));

  return {
    organizationId: organization?.id,
    organizationName: organization?.name ?? undefined,
    teams,
    projects,
    states,
  };
}

export async function listLinearProjectIssuesForImport(
  accessToken: string,
  projectId: string,
  options: { client?: LinearProjectIssueImportClientLike } = {},
): Promise<LinearProjectIssueImportOption[]> {
  const client = options.client ?? new LinearClient({ accessToken });
  const project = await client.project(projectId);
  if (!project?.id) return [];

  const issuePage = (await project.issues({ first: 100 } as never)) as LinearConnectionPage<Issue>;
  const issues = await fetchAllConnectionNodes(issuePage);

  const teamIds = [
    ...new Set(issues.map((issue) => issue.teamId).filter((teamId): teamId is string => Boolean(teamId))),
  ];
  const labelNameById = new Map<string, string>();
  const stateNameById = new Map<string, string>();

  for (const teamId of teamIds) {
    const team = await client.team(teamId);
    if (!team?.id) continue;

    const labelsPage = (await team.labels({ first: 100 } as never)) as LinearConnectionPage<{
      id?: string;
      name?: string;
    }>;
    const labels = await fetchAllConnectionNodes(labelsPage);
    for (const label of labels) {
      if (typeof label.id === 'string' && typeof label.name === 'string' && label.name.trim().length > 0) {
        labelNameById.set(label.id, label.name.trim());
      }
    }

    const statesPage = (await team.states({ first: 100 } as never)) as LinearConnectionPage<{
      id?: string;
      name?: string;
    }>;
    const states = await fetchAllConnectionNodes(statesPage);
    for (const state of states) {
      if (typeof state.id === 'string' && typeof state.name === 'string' && state.name.trim().length > 0) {
        stateNameById.set(state.id, state.name.trim());
      }
    }
  }

  const results: LinearProjectIssueImportOption[] = [];
  for (const issue of issues) {
    if (!issue?.id || !issue.updatedAt || !issue.teamId || issue.archivedAt) continue;

    const labelNames = issue.labelIds
      .map((labelId) => labelNameById.get(labelId) ?? '')
      .filter((name) => name.length > 0);

    results.push({
      id: issue.id,
      identifier: issue.identifier ?? null,
      title: issue.title ?? null,
      description: issue.description ?? null,
      stateName: issue.stateId ? (stateNameById.get(issue.stateId) ?? null) : null,
      updatedAt: issue.updatedAt.toISOString(),
      teamId: issue.teamId,
      projectId: issue.projectId ?? null,
      labelNames,
    });
  }

  return results;
}

/**
 * Create an IssueSync implementation backed by the Linear SDK.
 * Credentials are injected via options -- no env vars are read.
 *
 * Returns null when `enabled` is false (feature-gated at the app layer).
 */
export function createLinearClient(enabled: boolean, options: LinearClientOptions = {}): IssueSync | null {
  if (!enabled) return null;
  const client = createSdkClient(options);

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

    async deleteIssue(issueId: string): Promise<void> {
      const deleteIssue = client.deleteIssue?.bind(client);
      if (!deleteIssue) {
        throw new Error('Linear client does not support deleteIssue');
      }
      await withRetry(() => deleteIssue(issueId), maxRetries, sleep);
    },
  };
}
