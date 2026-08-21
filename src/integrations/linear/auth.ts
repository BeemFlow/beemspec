import { createLinearClient } from '@beemspec/linear';
import type { IssueSync, SyncTarget } from '@beemspec/sync';
import { createAdminClient } from '@/lib/supabase/admin';
import type { SupabaseLike } from '@/lib/supabase/types';
import {
  getLinearOAuthConnectionForTeam,
  hasLinearOAuthConnectionForTeam,
  isExpired,
  toExpiresAt,
  upsertLinearOAuthConnection,
} from './connections';
import { refreshLinearOAuthAccessToken } from './oauth-token';
import { getSyncTargetForStory, getSyncTargetForStoryMap, getTeamIdForStory, getTeamIdForStoryMap } from './settings';

export interface LinearSyncContext {
  status: 'ready' | 'not_configured' | 'not_connected' | 'auth_unavailable' | 'error';
  teamId: string | null;
  target: SyncTarget | null;
  targetConfigured: boolean;
  linearIssueSync: IssueSync | null;
  accessToken?: string | null;
  error?: unknown;
}

export type LinearAuthTokenResult =
  | { status: 'ready'; accessToken: string }
  | { status: 'not_connected' }
  | { status: 'auth_unavailable' }
  | { status: 'error'; error: unknown };

export async function resolveLinearAuthTokenForTeamResult(teamId: string): Promise<LinearAuthTokenResult> {
  try {
    const admin = createAdminClient();
    const connection = await getLinearOAuthConnectionForTeam(admin, teamId);
    if (!connection) return { status: 'not_connected' };

    if (!isExpired(connection.expiresAt)) {
      return { status: 'ready', accessToken: connection.accessToken };
    }

    if (!connection.refreshToken) {
      return { status: 'auth_unavailable' };
    }

    const refreshed = await refreshLinearOAuthAccessToken(connection.refreshToken);
    await upsertLinearOAuthConnection(admin, {
      teamId,
      accessToken: refreshed.accessToken,
      refreshToken: refreshed.refreshToken ?? connection.refreshToken,
      tokenType: refreshed.tokenType,
      scope: refreshed.scope,
      expiresAt: toExpiresAt(refreshed.expiresIn),
    });

    return { status: 'ready', accessToken: refreshed.accessToken };
  } catch (error) {
    return { status: 'error', error };
  }
}

export async function resolveLinearAuthTokenForTeam(teamId: string): Promise<string | null> {
  const result = await resolveLinearAuthTokenForTeamResult(teamId);
  return result.status === 'ready' ? result.accessToken : null;
}

async function resolveOAuthIssueSync(
  teamId: string,
): Promise<
  | { status: 'ready'; issueSync: IssueSync; accessToken: string }
  | { status: 'not_connected' | 'auth_unavailable' }
  | { status: 'error'; error: unknown }
> {
  const result = await resolveLinearAuthTokenForTeamResult(teamId);
  if (result.status !== 'ready') return result;
  const issueSync = createLinearClient(true, { accessToken: result.accessToken });
  return issueSync ? { status: 'ready', issueSync, accessToken: result.accessToken } : { status: 'auth_unavailable' };
}

async function resolveContextFromStoryMap(supabase: SupabaseLike, storyMapId: string): Promise<LinearSyncContext> {
  const [target, teamId] = await Promise.all([
    getSyncTargetForStoryMap(supabase, storyMapId),
    getTeamIdForStoryMap(supabase, storyMapId),
  ]);

  if (!target) {
    return { status: 'not_configured', teamId, target: null, targetConfigured: false, linearIssueSync: null };
  }

  if (teamId) {
    const oauthSync = await resolveOAuthIssueSync(teamId);
    if (oauthSync.status === 'ready') {
      return {
        status: 'ready',
        teamId,
        target,
        targetConfigured: true,
        linearIssueSync: oauthSync.issueSync,
        accessToken: oauthSync.accessToken,
      };
    }
    if (oauthSync.status === 'error') {
      return {
        status: 'error',
        teamId,
        target,
        targetConfigured: true,
        linearIssueSync: null,
        error: oauthSync.error,
      };
    }
    return { status: oauthSync.status, teamId, target, targetConfigured: true, linearIssueSync: null };
  }

  return { status: 'not_connected', teamId, target, targetConfigured: true, linearIssueSync: null };
}

export async function resolveLinearSyncContextForStoryMap(
  supabase: SupabaseLike,
  input: {
    storyMapId: string;
  },
): Promise<LinearSyncContext> {
  try {
    return await resolveContextFromStoryMap(supabase, input.storyMapId);
  } catch (error) {
    return {
      status: 'error',
      teamId: null,
      target: null,
      targetConfigured: false,
      linearIssueSync: null,
      error,
    };
  }
}

export async function resolveLinearSyncContextForStory(
  supabase: SupabaseLike,
  input: {
    storyId: string;
  },
): Promise<LinearSyncContext> {
  try {
    const [target, teamId] = await Promise.all([
      getSyncTargetForStory(supabase, input.storyId),
      getTeamIdForStory(supabase, input.storyId),
    ]);

    if (!target) {
      return {
        status: 'not_configured',
        teamId,
        target: null,
        targetConfigured: false,
        linearIssueSync: null,
      };
    }

    if (teamId) {
      const oauthSync = await resolveOAuthIssueSync(teamId);
      if (oauthSync.status === 'ready') {
        return {
          status: 'ready',
          teamId,
          target,
          targetConfigured: true,
          linearIssueSync: oauthSync.issueSync,
          accessToken: oauthSync.accessToken,
        };
      }
      if (oauthSync.status === 'error') {
        return {
          status: 'error',
          teamId,
          target,
          targetConfigured: true,
          linearIssueSync: null,
          error: oauthSync.error,
        };
      }
      return { status: oauthSync.status, teamId, target, targetConfigured: true, linearIssueSync: null };
    }

    return { status: 'not_connected', teamId, target, targetConfigured: true, linearIssueSync: null };
  } catch (error) {
    return {
      status: 'error',
      teamId: null,
      target: null,
      targetConfigured: false,
      linearIssueSync: null,
      error,
    };
  }
}

export async function isLinearSyncAvailableForStoryMap(
  supabase: SupabaseLike,
  input: {
    storyMapId: string;
  },
): Promise<boolean> {
  try {
    const teamId = await getTeamIdForStoryMap(supabase, input.storyMapId);
    if (!teamId) return false;
    const admin = createAdminClient();
    return hasLinearOAuthConnectionForTeam(admin, teamId);
  } catch {
    return false;
  }
}
