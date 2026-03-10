import {
  getLinearWorkspaceOptions,
  type LinearProjectOption,
  type LinearStateOption,
  type LinearTeamOption,
  type LinearWorkspaceOptions,
} from '@beemspec/linear';
import type { StoryStatus } from '@beemspec/storymap';
import { normalize } from '@/lib/strings';

const STORY_STATUSES: StoryStatus[] = ['backlog', 'todo', 'in_progress', 'in_review', 'done'];

export type LinearStatusMapping = Partial<Record<StoryStatus, string>>;

export interface LinearSettingsSnapshot {
  linearWorkspaceId: string | null;
  linearTeamId: string | null;
  linearStatusMapping?: LinearStatusMapping | null;
}

export interface LinearResolvedOptions {
  workspaceId: string | null;
  teams: LinearTeamOption[];
  projects: LinearProjectOption[];
  states: LinearStateOption[];
}

export interface SuggestedLinearSettings extends LinearSettingsSnapshot {
  changed: boolean;
}

function chooseDefaultTeamId(options: LinearResolvedOptions): string | null {
  if (options.teams.length !== 1) return null;
  return options.teams[0]?.id ?? null;
}

function normalizeStateName(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase().replaceAll(/\s+/g, '_');
}

function chooseDefaultStatusMapping(options: LinearResolvedOptions, teamId: string | null): LinearStatusMapping {
  if (!teamId) return {};
  const states = options.states.filter((state) => state.teamId === teamId);
  if (states.length === 0) return {};

  const byType = new Map<string, LinearStateOption>();
  const byName = new Map<string, LinearStateOption>();
  for (const state of states) {
    const type = normalizeStateName(state.type);
    const name = normalizeStateName(state.name);
    if (type && !byType.has(type)) byType.set(type, state);
    if (name && !byName.has(name)) byName.set(name, state);
  }

  const pick = (...candidates: string[]): string | undefined => {
    for (const candidate of candidates) {
      const normalized = normalizeStateName(candidate);
      const match = byType.get(normalized) ?? byName.get(normalized);
      if (match?.id) return match.id;
    }
    return undefined;
  };

  const mapping: LinearStatusMapping = {};
  mapping.backlog = pick('backlog');
  mapping.todo = pick('todo', 'unstarted');
  mapping.in_progress = pick('in_progress', 'started');
  mapping.in_review = pick('in_review', 'review');
  mapping.done = pick('done', 'completed');

  for (const status of STORY_STATUSES) {
    if (!mapping[status]) delete mapping[status];
  }
  return mapping;
}

function normalizeStatusMapping(input: LinearStatusMapping | null | undefined): LinearStatusMapping {
  if (!input) return {};
  const result: LinearStatusMapping = {};
  for (const status of STORY_STATUSES) {
    const value = normalize(input[status]);
    if (value) result[status] = value;
  }
  return result;
}

function withFallback(current: string | null, fallback: string | null): string | null {
  return normalize(current) ?? normalize(fallback);
}

export async function resolveLinearOptions(accessToken: string): Promise<LinearResolvedOptions> {
  const options: LinearWorkspaceOptions = await getLinearWorkspaceOptions(accessToken);
  return {
    workspaceId: normalize(options.organizationId),
    teams: options.teams,
    projects: options.projects,
    states: options.states,
  };
}

export function applySuggestedLinearSettings(
  current: LinearSettingsSnapshot,
  options: LinearResolvedOptions,
): SuggestedLinearSettings {
  const defaultTeamId = chooseDefaultTeamId(options);
  const linearTeamId = withFallback(current.linearTeamId, defaultTeamId);

  const defaultStatusMapping = chooseDefaultStatusMapping(options, linearTeamId);
  const currentStatusMapping = normalizeStatusMapping(current.linearStatusMapping);
  const linearStatusMapping: LinearStatusMapping = { ...defaultStatusMapping, ...currentStatusMapping };

  const linearWorkspaceId = withFallback(current.linearWorkspaceId, options.workspaceId);

  const changed =
    linearWorkspaceId !== normalize(current.linearWorkspaceId) ||
    linearTeamId !== normalize(current.linearTeamId) ||
    JSON.stringify(linearStatusMapping) !== JSON.stringify(currentStatusMapping);

  return {
    linearWorkspaceId,
    linearTeamId,
    linearStatusMapping,
    changed,
  };
}
