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

async function resolveOAuthIssueSync(teamId: string): Promise<IssueSync | null> {
  const admin = createAdminClient();
  try {
    const connection = await getLinearOAuthConnectionForTeam(admin, teamId);
    if (!connection) return null;

    if (!isExpired(connection.expiresAt)) {
      return createLinearClient(true, { accessToken: connection.accessToken });
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

    return createLinearClient(true, { accessToken: refreshed.accessToken });
  } catch {
    return null;
  }
}

async function resolveContextFromStoryMap(
  supabase: SupabaseLike,
  storyMapId: string,
  fallbackIssueSync: IssueSync | null,
): Promise<LinearSyncContext> {
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

  return {
    teamId,
    target,
    targetConfigured: true,
    linearIssueSync: fallbackIssueSync,
  };
}

export async function resolveLinearSyncContextForStoryMap(
  supabase: SupabaseLike,
  input: {
    storyMapId: string;
    fallbackIssueSync: IssueSync | null;
  },
): Promise<LinearSyncContext> {
  try {
    return await resolveContextFromStoryMap(supabase, input.storyMapId, input.fallbackIssueSync);
  } catch {
    return {
      teamId: null,
      target: null,
      targetConfigured: false,
      linearIssueSync: input.fallbackIssueSync,
    };
  }
}

export async function resolveLinearSyncContextForStory(
  supabase: SupabaseLike,
  input: {
    storyId: string;
    fallbackIssueSync: IssueSync | null;
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

    return {
      teamId,
      target,
      targetConfigured: true,
      linearIssueSync: input.fallbackIssueSync,
    };
  } catch {
    return {
      teamId: null,
      target: null,
      targetConfigured: false,
      linearIssueSync: input.fallbackIssueSync,
    };
  }
}

export async function isLinearSyncAvailableForStoryMap(
  supabase: SupabaseLike,
  input: {
    storyMapId: string;
    fallbackIssueSync: IssueSync | null;
  },
): Promise<boolean> {
  if (input.fallbackIssueSync) return true;

  try {
    const teamId = await getTeamIdForStoryMap(supabase, input.storyMapId);
    if (!teamId) return false;
    const admin = createAdminClient();
    return hasLinearOAuthConnectionForTeam(admin, teamId);
  } catch {
    return false;
  }
}
