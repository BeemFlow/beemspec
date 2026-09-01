import { DbErrorCode } from '@/lib/errors';
import type { Supabase } from '@/lib/supabase/types';
import { listTeamsForUser } from '@/lib/teams';

function jsonText(value: unknown): string {
  return JSON.stringify(value);
}

export function successResult<T>(data: T) {
  const payload = { ok: true as const, data };
  return {
    content: [{ type: 'text' as const, text: jsonText(payload) }],
    structuredContent: payload,
  };
}

export function errorResult(error: string, details?: unknown) {
  const payload = {
    ok: false as const,
    error,
    ...(details ? { details } : {}),
  };
  return {
    isError: true,
    content: [{ type: 'text' as const, text: jsonText(payload) }],
    structuredContent: payload,
  };
}

function dbCode(error: unknown): string | null {
  if (typeof error !== 'object' || !error) return null;
  const code = Reflect.get(error, 'code');
  return typeof code === 'string' ? code : null;
}

export function isNotFound(error: unknown): boolean {
  return dbCode(error) === DbErrorCode.NOT_FOUND;
}

export function describeDbError(error: unknown): Record<string, unknown> {
  const code = dbCode(error);
  return code ? { code } : {};
}

type ToolCall<Input> = (args: Input) => Promise<ReturnType<typeof successResult> | ReturnType<typeof errorResult>>;

export function withToolErrorBoundary<Input>(name: string, handler: ToolCall<Input>): ToolCall<Input> {
  return async (args: Input) => {
    try {
      return await handler(args);
    } catch (error) {
      // biome-ignore lint/suspicious/noConsole: MCP tool runtime error logging
      console.error(`[mcp] ${name} failed`, error);
      return errorResult('Unexpected server error', describeDbError(error));
    }
  };
}

export const readAnnotations = {
  readOnlyHint: true,
  idempotentHint: true,
  openWorldHint: false,
} as const;

export const createAnnotations = {
  readOnlyHint: false,
  idempotentHint: false,
  destructiveHint: false,
  openWorldHint: false,
} as const;

export const updateAnnotations = {
  ...createAnnotations,
  idempotentHint: true,
} as const;

export const destructiveAnnotations = {
  ...updateAnnotations,
  destructiveHint: true,
} as const;

export async function resolveAccessibleTeamId(
  supabase: Supabase,
  userId: string,
  teamId: string | undefined,
): Promise<{ ok: true; teamId: string } | { ok: false; response: ReturnType<typeof errorResult> }> {
  if (teamId) {
    const teamsResult = await listTeamsForUser(supabase, userId);
    if (teamsResult.error || !teamsResult.data) {
      return { ok: false, response: errorResult('Failed to resolve team', describeDbError(teamsResult.error)) };
    }

    const isMember = teamsResult.data.some((team) => team.team_id === teamId);
    if (!isMember) {
      return { ok: false, response: errorResult('Provided team_id is not accessible to authenticated user') };
    }

    return { ok: true, teamId };
  }

  const teamsResult = await listTeamsForUser(supabase, userId);
  if (teamsResult.error || !teamsResult.data) {
    return { ok: false, response: errorResult('Failed to resolve team', describeDbError(teamsResult.error)) };
  }

  if (teamsResult.data.length === 0) {
    return { ok: false, response: errorResult('No accessible teams found for authenticated user') };
  }

  if (teamsResult.data.length > 1) {
    return {
      ok: false,
      response: errorResult('Multiple teams found. Pass team_id or call team_list first.', {
        teams: teamsResult.data,
      }),
    };
  }

  return { ok: true, teamId: teamsResult.data[0].team_id };
}

export async function resolveStoryMapIdByName(
  supabase: Supabase,
  storyMapName: string,
  teamId?: string,
): Promise<{ ok: true; storyMapId: string } | { ok: false; response: ReturnType<typeof errorResult> }> {
  let query = supabase.from('story_maps').select('id, name, team_id').eq('name', storyMapName);
  if (teamId) query = query.eq('team_id', teamId);

  const { data, error } = await query;
  if (error) {
    return { ok: false, response: errorResult('Failed to resolve story map by name', describeDbError(error)) };
  }

  const matches = data ?? [];
  if (matches.length === 0) {
    return { ok: false, response: errorResult('Story map not found by name') };
  }
  if (matches.length > 1) {
    return {
      ok: false,
      response: errorResult('Multiple story maps matched this name. Pass story_map_id or team_id.', {
        matches,
      }),
    };
  }

  return { ok: true, storyMapId: matches[0].id as string };
}

export async function resolveProcessFlowIdByName(
  supabase: Supabase,
  processFlowName: string,
  teamId?: string,
): Promise<{ ok: true; processFlowId: string } | { ok: false; response: ReturnType<typeof errorResult> }> {
  let query = supabase.from('process_flows').select('id, name, team_id').eq('name', processFlowName);
  if (teamId) query = query.eq('team_id', teamId);

  const { data, error } = await query;
  if (error) {
    return { ok: false, response: errorResult('Failed to resolve process flow by name', describeDbError(error)) };
  }

  const matches = data ?? [];
  if (matches.length === 0) {
    return { ok: false, response: errorResult('Process flow not found by name') };
  }
  if (matches.length > 1) {
    return {
      ok: false,
      response: errorResult('Multiple process flows matched this name. Pass process_flow_id or team_id.', {
        matches,
      }),
    };
  }

  return { ok: true, processFlowId: matches[0].id as string };
}
