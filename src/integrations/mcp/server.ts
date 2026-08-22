import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
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

async function handleMcpRequestOnce(request: Request, supabase: Supabase, user: AuthenticatedUser): Promise<Response> {
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  const server = createMcpServer(supabase, user);
  await server.connect(transport);

  try {
    return await transport.handleRequest(request);
  } finally {
    await server.close().catch(() => {
      // no-op on cleanup failures
    });
  }
}

export async function handleMcpRequest(
  request: Request,
  supabase: Supabase,
  user: AuthenticatedUser,
): Promise<Response> {
  return handleMcpRequestOnce(request, supabase, user);
}
