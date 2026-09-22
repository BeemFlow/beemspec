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

// Exact, application-owned messages only; never return arbitrary database diagnostics.
const publicOperationErrors = new Set([
  'Order array cannot be empty',
  'Order array contains duplicate ids',
  'Order array must contain all sibling ids',
  'Order array includes ids outside target siblings',
  'Target order must include moved task id',
  'Target order must include moved story id',
  'Task not found',
  'Story not found',
  'Target activity not found',
  'Target task not found',
  'Task for story not found',
  'Release for story not found',
  'Task target activity must belong to the same story map',
  'Story target task must belong to the same story map',
  'Story task and release must belong to the same story map',
  'Source and target nodes must belong to the same process flow',
]);

const uuidPattern = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const missingFlowEntity = new RegExp(
  `^Process flow (node|edge) (${uuidPattern}) not found in flow (${uuidPattern})$`,
  'i',
);
const staleFlowLayout = new RegExp(
  `^Layout update expected [0-9]+ nodes but updated [0-9]+ nodes for flow ${uuidPattern}$`,
  'i',
);
const publicConstraintErrors: Record<string, string> = {
  '23514:new row for relation "process_flow_edges" violates check constraint "chk_process_flow_edges_source_target_distinct"':
    'An edge cannot connect a node to itself. Choose distinct source and target nodes.',
  '23505:duplicate key value violates unique constraint "uq_process_flow_edges_unique_connection"':
    'An edge with this type, source, and target already exists. Reload with processflow_get and use the existing edge.',
  '23503:insert or update on table "process_flow_edges" violates foreign key constraint "fk_process_flow_edges_source_in_flow"':
    'The source node is not available in this process flow. Reload with processflow_get and use a current node ID.',
  '23503:insert or update on table "process_flow_edges" violates foreign key constraint "fk_process_flow_edges_target_in_flow"':
    'The target node is not available in this process flow. Reload with processflow_get and use a current node ID.',
};

export function describeDbError(error: unknown): Record<string, unknown> {
  const code = dbCode(error);
  const details = code ? { code } : {};
  const message = typeof error === 'object' && error ? Reflect.get(error, 'message') : undefined;
  if (typeof message === 'string') {
    if (publicOperationErrors.has(message)) return { ...details, message };

    if (code === 'P0001') {
      const missing = missingFlowEntity.exec(message);
      if (missing) {
        const [, entity, id, flowId] = missing;
        return {
          ...details,
          message: `Process flow ${entity} ${id} is not available in flow ${flowId}. Reload with processflow_get and retry using current IDs; the batch was not applied.`,
        };
      }
      if (staleFlowLayout.test(message)) {
        return {
          ...details,
          message: 'The process flow changed during layout. Reload with processflow_get and retry autolayout.',
        };
      }
    }

    const constraintMessage = publicConstraintErrors[`${code}:${message}`];
    if (constraintMessage) return { ...details, message: constraintMessage };
  }

  if (error) {
    // biome-ignore lint/suspicious/noConsole: retain private diagnostics only in server logs
    console.error('[mcp] Database operation failed', error);
  }
  return details;
}

type ToolCall<Input> = (args: Input) => Promise<ReturnType<typeof successResult> | ReturnType<typeof errorResult>>;

export function withToolErrorBoundary<Input>(name: string, handler: ToolCall<Input>): ToolCall<Input> {
  return async (args: Input) => {
    try {
      return await handler(args);
    } catch (error) {
      // biome-ignore lint/suspicious/noConsole: MCP tool runtime error logging
      console.error(`[mcp] ${name} failed`, error);
      return errorResult('Unexpected server error');
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
  destructiveHint: true,
} as const;

export const destructiveAnnotations = updateAnnotations;

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
