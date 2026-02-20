import { normalize } from '@/lib/strings';
import type { SupabaseLike } from '@/lib/supabase/types';

const LINEAR_OAUTH_CONNECTIONS_TABLE = 'linear_oauth_connections';

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

interface ConnectionsTable {
  select(columns: string): {
    eq(
      column: string,
      value: string,
    ): {
      maybeSingle<T>(): Promise<{ data: T | null; error: unknown }>;
    };
  };
  upsert(row: Record<string, unknown>, options: { onConflict: string }): Promise<{ error: unknown }>;
  delete(): {
    eq(column: string, value: string): Promise<{ error: unknown }>;
  };
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

export function isExpired(expiresAt: string | null): boolean {
  if (!expiresAt) return false;
  const parsed = new Date(expiresAt);
  if (Number.isNaN(parsed.getTime())) return false;
  return parsed.getTime() <= Date.now() + 60_000;
}

export function toExpiresAt(expiresInSeconds: number | null): string | null {
  if (!expiresInSeconds || expiresInSeconds <= 0) return null;
  return new Date(Date.now() + expiresInSeconds * 1000).toISOString();
}

export async function getLinearOAuthConnectionForTeam(
  supabase: SupabaseLike,
  teamId: string,
): Promise<LinearOAuthConnection | null> {
  const table = supabase.from(LINEAR_OAUTH_CONNECTIONS_TABLE) as ConnectionsTable;
  const { data, error } = await table
    .select('team_id, access_token, refresh_token, token_type, scope, expires_at')
    .eq('team_id', teamId)
    .maybeSingle<LinearOAuthConnectionRow>();

  if (error) throw error;
  if (!data) return null;
  return toConnection(data);
}

export async function hasLinearOAuthConnectionForTeam(supabase: SupabaseLike, teamId: string): Promise<boolean> {
  const table = supabase.from(LINEAR_OAUTH_CONNECTIONS_TABLE) as ConnectionsTable;
  const { data, error } = await table.select('team_id').eq('team_id', teamId).maybeSingle<{ team_id: string }>();

  if (error) throw error;
  return Boolean(data?.team_id);
}

export async function getLinearOAuthConnectionStatusForTeam(
  supabase: SupabaseLike,
  teamId: string,
): Promise<LinearOAuthConnectionStatus | null> {
  const table = supabase.from(LINEAR_OAUTH_CONNECTIONS_TABLE) as ConnectionsTable;
  const { data, error } = await table
    .select('team_id, scope, expires_at')
    .eq('team_id', teamId)
    .maybeSingle<LinearOAuthConnectionStatusRow>();

  if (error) throw error;
  if (!data) return null;
  return toConnectionStatus(data);
}

export async function upsertLinearOAuthConnection(
  supabase: SupabaseLike,
  input: {
    teamId: string;
    accessToken: string;
    refreshToken: string | null;
    tokenType: string | null;
    scope: string | null;
    expiresAt: string | null;
    userId?: string | null;
  },
): Promise<void> {
  const table = supabase.from(LINEAR_OAUTH_CONNECTIONS_TABLE) as ConnectionsTable;
  const { error } = await table.upsert(
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

export async function deleteLinearOAuthConnectionForTeam(supabase: SupabaseLike, teamId: string): Promise<void> {
  const table = supabase.from(LINEAR_OAUTH_CONNECTIONS_TABLE) as ConnectionsTable;
  const { error } = await table.delete().eq('team_id', teamId);
  if (error) throw error;
}
