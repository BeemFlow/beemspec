import { createMcpHandler, McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';
import { getMcpAuthContext } from '@/integrations/mcp/auth';
import type { AuthenticatedUser } from '@/lib/auth';
import type { Supabase } from '@/lib/supabase/types';
import { listTeamsForUser } from '@/lib/teams';
import { mcpUuidSchema, successOutputSchema } from './output-schemas';
import { describeDbError, errorResult, readAnnotations, successResult, withToolErrorBoundary } from './tool-support';
import { registerPersonaTools } from './tools/personas';
import { registerPlanningTools } from './tools/planning';
import { registerProcessFlowTools } from './tools/process-flows';
import { registerStoryTools } from './tools/stories';
import { registerStoryMapTools } from './tools/story-maps';

const MCP_SERVER_INSTRUCTIONS = [
  'Use team_list when team context is unknown.',
  'For story-map work, use storymap_list to discover maps, storymap_get before structural edits, release_get for release scope, and story_context_get before implementing one story.',
  'Use story_update for content or status, story_move and task_move for placement, and reorder tools only with the complete final ID order.',
  'For process-flow work, use processflow_list to discover flows and processflow_get before structural edits.',
  'Prefer processflow_nodes_mutate and processflow_edges_mutate for related atomic graph changes; use single-item tools for isolated edits, then processflow_autolayout and processflow_validation_get after material structural changes.',
  'Preserve observed product and operational intent. Do not invent scope, systems, approvals, ownership, constraints, or UI behavior when stored context or a focused user clarification should decide them.',
].join(' ');

const teamSummarySchema = z
  .object({
    team_id: mcpUuidSchema.describe('Team UUID.'),
    role: z.string().describe('Authenticated user role in the team.'),
    name: z.string().nullable().describe('Human-readable team name.'),
  })
  .strict();

function createMcpServer(supabase: Supabase, user: AuthenticatedUser): McpServer {
  const server = new McpServer(
    {
      name: 'beemspec',
      version: '0.1.0',
    },
    { instructions: MCP_SERVER_INSTRUCTIONS },
  );

  server.registerTool(
    'team_list',
    {
      title: 'List Teams',
      description: 'List teams available to the authenticated user. Use this when team_id is unknown.',
      outputSchema: successOutputSchema(z.array(teamSummarySchema)),
      annotations: readAnnotations,
    },
    withToolErrorBoundary('team_list', async () => {
      const { data, error } = await listTeamsForUser(supabase, user.id);
      if (error || !data) return errorResult('Failed to load teams', describeDbError(error));
      return successResult(data);
    }),
  );

  registerProcessFlowTools(server, supabase, user);
  registerStoryMapTools(server, supabase, user);
  registerPlanningTools(server, supabase);
  registerStoryTools(server, supabase);
  registerPersonaTools(server, supabase);

  return server;
}

export function createBeemspecMcpHandler() {
  return createMcpHandler(
    ({ authInfo }) => {
      const { supabase, user } = getMcpAuthContext(authInfo);
      return createMcpServer(supabase, user);
    },
    { responseMode: 'json' },
  );
}

export const mcpHandler = createBeemspecMcpHandler();
