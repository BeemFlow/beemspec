import { createMcpHandler, McpServer } from '@modelcontextprotocol/server';
import { getMcpAuthContext } from '@/integrations/mcp/auth';
import type { AuthenticatedUser } from '@/lib/auth';
import type { Supabase } from '@/lib/supabase/types';
import { listTeamsForUser } from '@/lib/teams';
import { describeDbError, errorResult, readAnnotations, successResult, withToolErrorBoundary } from './tool-support';
import { registerPersonaTools } from './tools/personas';
import { registerPlanningTools } from './tools/planning';
import { registerProcessFlowTools } from './tools/process-flows';
import { registerStoryTools } from './tools/stories';
import { registerStoryMapTools } from './tools/story-maps';

function createMcpServer(supabase: Supabase, user: AuthenticatedUser): McpServer {
  const server = new McpServer({
    name: 'beemspec',
    version: '0.1.0',
  });

  server.registerTool(
    'team_list',
    {
      title: 'List Teams',
      description: 'List teams available to the authenticated user. Use this when team_id is unknown.',
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
