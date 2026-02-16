import { createLinearIssueSync } from '@/integrations/linear/issue-sync';
import { env } from '@/lib/env';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  getLinearStorySyncTargetForStory,
  getLinearStorySyncTargetForStoryMap,
  getTeamIdForStory,
  getTeamIdForStoryMap,
} from './settings';
import type { LinearStorySyncTarget } from './story-sync';
import type { LinearIssueSync } from './types';

const LINEAR_OAUTH_CONNECTIONS_TABLE = 'linear_oauth_connections';
const LINEAR_OAUTH_AUTHORIZE_URL = 'https://linear.app/oauth/authorize';
const LINEAR_OAUTH_TOKEN_URL = 'https://api.linear.app/oauth/token';

export const DEFAULT_LINEAR_OAUTH_SCOPES = ['read', 'write'] as const;

type SupabaseLike = {
  from: (table: string) => unknown;
};

interface LinearOAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

interface LinearOAuthConnectionRow {
  team_id: string;
  access_token: string;
  refresh_token: string | null;
  token_type: string | null;
  scope: string | null;
  expires_at: string | null;
}

interface LinearOAuthConnectionStatusRow {
  team_id: string;
  scope: string | null;
  expires_at: string | null;
}

interface LinearOAuthTokenResponse {
  access_token?: unknown;
  refresh_token?: unknown;
  token_type?: unknown;
  scope?: unknown;
  expires_in?: unknown;
  error?: unknown;
  error_description?: unknown;
}

export interface LinearOAuthToken {
  accessToken: string;
  refreshToken: string | null;
  tokenType: string | null;
  scope: string | null;
  expiresIn: number | null;
}

export interface LinearOAuthConnection {
  teamId: string;
  accessToken: string;
  refreshToken: string | null;
  tokenType: string | null;
  scope: string | null;
  expiresAt: string | null;
}

export interface LinearOAuthConnectionStatus {
  teamId: string;
  scope: string | null;
  expiresAt: string | null;
}

export interface LinearSyncContext {
  teamId: string | null;
  target: LinearStorySyncTarget | null;
  targetConfigured: boolean;
  linearIssueSync: LinearIssueSync | null;
}

function getLinearOAuthConfig(): LinearOAuthConfig {
  const clientId = env.linearClientId();
  const clientSecret = env.linearClientSecret();
  const redirectUri = env.linearOAuthRedirectUri();

  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error('Missing Linear OAuth environment variables');
  }

  return { clientId, clientSecret, redirectUri };
}

function normalize(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function asPositiveNumber(value: unknown): number | null {
  if (typeof value !== 'number') return null;
  if (!Number.isFinite(value) || value <= 0) return null;
  return Math.floor(value);
}

function parseTokenPayload(payload: LinearOAuthTokenResponse): LinearOAuthToken {
  const accessToken = asNonEmptyString(payload.access_token);
  if (!accessToken) {
    const error =
      asNonEmptyString(payload.error_description) ?? asNonEmptyString(payload.error) ?? 'OAuth token missing';
    throw new Error(`Linear OAuth token exchange failed: ${error}`);
  }

  return {
    accessToken,
    refreshToken: asNonEmptyString(payload.refresh_token),
    tokenType: asNonEmptyString(payload.token_type),
    scope: asNonEmptyString(payload.scope),
    expiresIn: asPositiveNumber(payload.expires_in),
  };
}

function toConnection(row: LinearOAuthConnectionRow): LinearOAuthConnection {
  return {
    teamId: row.team_id,
    accessToken: row.access_token,
    refreshToken: normalize(row.refresh_token),
    tokenType: normalize(row.token_type),
    scope: normalize(row.scope),
    expiresAt: normalize(row.expires_at),
  };
}

function toConnectionStatus(row: LinearOAuthConnectionStatusRow): LinearOAuthConnectionStatus {
  return {
    teamId: row.team_id,
    scope: normalize(row.scope),
    expiresAt: normalize(row.expires_at),
  };
}

function isExpired(expiresAt: string | null): boolean {
  if (!expiresAt) return false;
  const parsed = new Date(expiresAt);
  if (Number.isNaN(parsed.getTime())) return false;
  return parsed.getTime() <= Date.now() + 60_000;
}

function toExpiresAt(expiresInSeconds: number | null): string | null {
  if (!expiresInSeconds || expiresInSeconds <= 0) return null;
  return new Date(Date.now() + expiresInSeconds * 1000).toISOString();
}

async function requestToken(params: URLSearchParams): Promise<LinearOAuthToken> {
  const response = await fetch(LINEAR_OAUTH_TOKEN_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      accept: 'application/json',
    },
    body: params,
    cache: 'no-store',
  });

  let payload: LinearOAuthTokenResponse = {};
  try {
    payload = (await response.json()) as LinearOAuthTokenResponse;
  } catch {}

  if (!response.ok) {
    const description =
      asNonEmptyString(payload.error_description) ?? asNonEmptyString(payload.error) ?? `status ${response.status}`;
    throw new Error(`Linear OAuth token request failed: ${description}`);
  }

  return parseTokenPayload(payload);
}

async function resolveOAuthLinearIssueSync(teamId: string): Promise<LinearIssueSync | null> {
  try {
    const connection = await getLinearOAuthConnectionForTeam(teamId);
    if (!connection) return null;

    if (!isExpired(connection.expiresAt)) {
      return createLinearIssueSync(true, { accessToken: connection.accessToken });
    }

    if (!connection.refreshToken) {
      return null;
    }

    const refreshed = await refreshLinearOAuthAccessToken(connection.refreshToken);
    await upsertLinearOAuthConnection({
      teamId,
      accessToken: refreshed.accessToken,
      refreshToken: refreshed.refreshToken ?? connection.refreshToken,
      tokenType: refreshed.tokenType,
      scope: refreshed.scope,
      expiresAt: toExpiresAt(refreshed.expiresIn),
    });

    return createLinearIssueSync(true, { accessToken: refreshed.accessToken });
  } catch {
    return null;
  }
}

async function resolveContextFromStoryMap(
  supabase: SupabaseLike,
  storyMapId: string,
  fallbackLinearIssueSync: LinearIssueSync | null,
): Promise<LinearSyncContext> {
  const [target, teamId] = await Promise.all([
    getLinearStorySyncTargetForStoryMap(supabase, storyMapId),
    getTeamIdForStoryMap(supabase, storyMapId),
  ]);

  if (!target) {
    return { teamId, target: null, targetConfigured: false, linearIssueSync: null };
  }

  if (teamId) {
    const oauthSync = await resolveOAuthLinearIssueSync(teamId);
    if (oauthSync) {
      return { teamId, target, targetConfigured: true, linearIssueSync: oauthSync };
    }
  }

  return {
    teamId,
    target,
    targetConfigured: true,
    linearIssueSync: fallbackLinearIssueSync,
  };
}

export function createLinearOAuthAuthorizeUrl(input: { state: string; scopes?: readonly string[] }): string {
  const config = getLinearOAuthConfig();
  const scopes = input.scopes && input.scopes.length > 0 ? input.scopes : DEFAULT_LINEAR_OAUTH_SCOPES;

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    scope: scopes.join(','),
    state: input.state,
  });

  return `${LINEAR_OAUTH_AUTHORIZE_URL}?${params.toString()}`;
}

export async function exchangeLinearOAuthCode(code: string): Promise<LinearOAuthToken> {
  const config = getLinearOAuthConfig();
  const params = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: config.redirectUri,
    client_id: config.clientId,
    client_secret: config.clientSecret,
  });

  return requestToken(params);
}

export async function refreshLinearOAuthAccessToken(refreshToken: string): Promise<LinearOAuthToken> {
  const config = getLinearOAuthConfig();
  const params = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: config.clientId,
    client_secret: config.clientSecret,
  });

  return requestToken(params);
}

export async function getLinearOAuthConnectionForTeam(teamId: string): Promise<LinearOAuthConnection | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from(LINEAR_OAUTH_CONNECTIONS_TABLE)
    .select('team_id, access_token, refresh_token, token_type, scope, expires_at')
    .eq('team_id', teamId)
    .maybeSingle<LinearOAuthConnectionRow>();

  if (error) throw error;
  if (!data) return null;
  return toConnection(data);
}

export async function hasLinearOAuthConnectionForTeam(teamId: string): Promise<boolean> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from(LINEAR_OAUTH_CONNECTIONS_TABLE)
    .select('team_id')
    .eq('team_id', teamId)
    .maybeSingle<{ team_id: string }>();

  if (error) throw error;
  return Boolean(data?.team_id);
}

export async function getLinearOAuthConnectionStatusForTeam(
  teamId: string,
): Promise<LinearOAuthConnectionStatus | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from(LINEAR_OAUTH_CONNECTIONS_TABLE)
    .select('team_id, scope, expires_at')
    .eq('team_id', teamId)
    .maybeSingle<LinearOAuthConnectionStatusRow>();

  if (error) throw error;
  if (!data) return null;
  return toConnectionStatus(data);
}

export async function upsertLinearOAuthConnection(input: {
  teamId: string;
  accessToken: string;
  refreshToken: string | null;
  tokenType: string | null;
  scope: string | null;
  expiresAt: string | null;
  userId?: string | null;
}): Promise<void> {
  const supabase = createAdminClient();
  const { error } = await supabase.from(LINEAR_OAUTH_CONNECTIONS_TABLE).upsert(
    {
      team_id: input.teamId,
      access_token: input.accessToken,
      refresh_token: input.refreshToken,
      token_type: input.tokenType,
      scope: input.scope,
      expires_at: input.expiresAt,
      created_by: input.userId ?? undefined,
    },
    { onConflict: 'team_id' },
  );

  if (error) throw error;
}

export async function deleteLinearOAuthConnectionForTeam(teamId: string): Promise<void> {
  const supabase = createAdminClient();
  const { error } = await supabase.from(LINEAR_OAUTH_CONNECTIONS_TABLE).delete().eq('team_id', teamId);
  if (error) throw error;
}

export async function resolveLinearSyncContextForStoryMap(
  supabase: SupabaseLike,
  input: {
    storyMapId: string;
    fallbackLinearIssueSync: LinearIssueSync | null;
  },
): Promise<LinearSyncContext> {
  try {
    return await resolveContextFromStoryMap(supabase, input.storyMapId, input.fallbackLinearIssueSync);
  } catch {
    return {
      teamId: null,
      target: null,
      targetConfigured: false,
      linearIssueSync: input.fallbackLinearIssueSync,
    };
  }
}

export async function resolveLinearSyncContextForStory(
  supabase: SupabaseLike,
  input: {
    storyId: string;
    fallbackLinearIssueSync: LinearIssueSync | null;
  },
): Promise<LinearSyncContext> {
  try {
    const [target, teamId] = await Promise.all([
      getLinearStorySyncTargetForStory(supabase, input.storyId),
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
      const oauthSync = await resolveOAuthLinearIssueSync(teamId);
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
      linearIssueSync: input.fallbackLinearIssueSync,
    };
  } catch {
    return {
      teamId: null,
      target: null,
      targetConfigured: false,
      linearIssueSync: input.fallbackLinearIssueSync,
    };
  }
}

export async function isLinearSyncAvailableForStoryMap(
  supabase: SupabaseLike,
  input: {
    storyMapId: string;
    fallbackLinearIssueSync: LinearIssueSync | null;
  },
): Promise<boolean> {
  if (input.fallbackLinearIssueSync) return true;

  try {
    const teamId = await getTeamIdForStoryMap(supabase, input.storyMapId);
    if (!teamId) return false;
    return hasLinearOAuthConnectionForTeam(teamId);
  } catch {
    return false;
  }
}
