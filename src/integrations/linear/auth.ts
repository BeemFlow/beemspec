import { createLinearClient } from '@beemspec/linear';
import type { IssueSync, SyncTarget } from '@/integrations/sync';
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
  teamId: string | null;
  target: SyncTarget | null;
  targetConfigured: boolean;
  linearIssueSync: IssueSync | null;
}

export async function resolveLinearAuthTokenForTeam(teamId: string): Promise<string | null> {
  const admin = createAdminClient();

  try {
    const connection = await getLinearOAuthConnectionForTeam(admin, teamId);
    if (!connection) return null;

    if (!isExpired(connection.expiresAt)) {
      return connection.accessToken;
    }

    if (!connection.refreshToken) {
      return null;
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

    return refreshed.accessToken;
  } catch {
    return null;
  }
}

async function resolveOAuthIssueSync(teamId: string): Promise<IssueSync | null> {
  const accessToken = await resolveLinearAuthTokenForTeam(teamId);
  if (!accessToken) return null;
  return createLinearClient(true, { accessToken });
}

async function resolveContextFromStoryMap(supabase: SupabaseLike, storyMapId: string): Promise<LinearSyncContext> {
  const [target, teamId] = await Promise.all([
    getSyncTargetForStoryMap(supabase, storyMapId),
    getTeamIdForStoryMap(supabase, storyMapId),
  ]);

  if (!target) {
    return { teamId, target: null, targetConfigured: false, linearIssueSync: null };
  }

  if (teamId) {
    const oauthSync = await resolveOAuthIssueSync(teamId);
    if (oauthSync) {
      return { teamId, target, targetConfigured: true, linearIssueSync: oauthSync };
    }
  }

  return { teamId, target, targetConfigured: true, linearIssueSync: null };
}

export async function resolveLinearSyncContextForStoryMap(
  supabase: SupabaseLike,
  input: {
    storyMapId: string;
  },
): Promise<LinearSyncContext> {
  try {
    return await resolveContextFromStoryMap(supabase, input.storyMapId);
  } catch {
    return {
      teamId: null,
      target: null,
      targetConfigured: false,
      linearIssueSync: null,
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
        teamId,
        target: null,
        targetConfigured: false,
        linearIssueSync: null,
      };
    }

    if (teamId) {
      const oauthSync = await resolveOAuthIssueSync(teamId);
      if (oauthSync) {
        return {
          teamId,
          target,
          targetConfigured: true,
          linearIssueSync: oauthSync,
        };
      }
    }

    return { teamId, target, targetConfigured: true, linearIssueSync: null };
  } catch {
    return {
      teamId: null,
      target: null,
      targetConfigured: false,
      linearIssueSync: null,
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
