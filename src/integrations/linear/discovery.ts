import {
  getLinearWorkspaceOptions,
  type LinearProjectOption,
  type LinearStateOption,
  type LinearTeamOption,
  type LinearWorkspaceOptions,
} from '@beemspec/linear';
import { normalize } from '@/lib/strings';

const PREFERRED_STATE_TYPES = ['unstarted', 'backlog', 'triage'];

export interface LinearSettingsSnapshot {
  linearWorkspaceId: string | null;
  linearTeamId: string | null;
  linearProjectId: string | null;
  linearStateId: string | null;
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

function chooseDefaultProjectId(options: LinearResolvedOptions, teamId: string | null): string | null {
  if (!teamId) return null;
  const candidates = options.projects.filter((project) => project.teamIds.includes(teamId));
  if (candidates.length !== 1) return null;
  return candidates[0]?.id ?? null;
}

function chooseDefaultStateId(options: LinearResolvedOptions, teamId: string | null): string | null {
  if (!teamId) return null;
  const candidates = options.states.filter((state) => state.teamId === teamId);
  if (candidates.length === 1) return candidates[0]?.id ?? null;

  for (const type of PREFERRED_STATE_TYPES) {
    const match = candidates.find((state) => state.type?.toLowerCase() === type);
    if (match) return match.id;
  }

  return null;
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

  const defaultProjectId = chooseDefaultProjectId(options, linearTeamId);
  const linearProjectId = withFallback(current.linearProjectId, defaultProjectId);

  const defaultStateId = chooseDefaultStateId(options, linearTeamId);
  const linearStateId = withFallback(current.linearStateId, defaultStateId);

  const linearWorkspaceId = withFallback(current.linearWorkspaceId, options.workspaceId);

  const changed =
    linearWorkspaceId !== normalize(current.linearWorkspaceId) ||
    linearTeamId !== normalize(current.linearTeamId) ||
    linearProjectId !== normalize(current.linearProjectId) ||
    linearStateId !== normalize(current.linearStateId);

  return {
    linearWorkspaceId,
    linearTeamId,
    linearProjectId,
    linearStateId,
    changed,
  };
}
