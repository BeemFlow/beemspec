import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { z } from 'zod';
import { markStoryBlocked } from '@/build-runs/processor';
import { createAdminClient } from '@/lib/supabase/admin';
import { getStoryContext } from './queries';

interface McpRuntime {
  server: McpServer;
  transport: WebStandardStreamableHTTPServerTransport;
}

declare global {
  // eslint-disable-next-line no-var
  var __beemspecMcpRuntimePromise: Promise<McpRuntime> | undefined;
}

function jsonText(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function createMcpServer(): McpServer {
  const server = new McpServer({
    name: 'beemspec',
    version: '0.1.0',
  });

  server.registerTool(
    'story',
    {
      title: 'BeemSpec Story Context',
      description: 'Load story context from BeemSpec by story UUID',
      inputSchema: {
        storyId: z.string().uuid().describe('BeemSpec story UUID'),
      },
    },
    async ({ storyId }) => {
      const supabase = createAdminClient();
      const context = await getStoryContext(supabase, storyId);

      if (!context) {
        return {
          isError: true,
          content: [{ type: 'text', text: 'Story not found or not assigned to a release' }],
        };
      }

      return {
        content: [{ type: 'text', text: jsonText(context) }],
      };
    },
  );

  server.registerTool(
    'blocked',
    {
      title: 'BeemSpec Mark Blocked',
      description: 'Mark a BeemSpec story blocked with a reason',
      inputSchema: {
        storyId: z.string().uuid().describe('BeemSpec story UUID'),
        reason: z.string().min(1).max(2000).describe('Blocked reason'),
      },
    },
    async ({ storyId, reason }) => {
      const supabase = createAdminClient();
      const result = await markStoryBlocked(supabase, { storyId, reason });

      if (!result.ok) {
        return {
          isError: true,
          content: [{ type: 'text', text: result.error }],
        };
      }

      return {
        content: [{ type: 'text', text: jsonText({ ok: true }) }],
      };
    },
  );

  return server;
}

async function createMcpRuntime(): Promise<McpRuntime> {
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  const server = createMcpServer();
  await server.connect(transport);

  return { server, transport };
}

async function getMcpRuntime(): Promise<McpRuntime> {
  if (!globalThis.__beemspecMcpRuntimePromise) {
    globalThis.__beemspecMcpRuntimePromise = createMcpRuntime();
  }
  return globalThis.__beemspecMcpRuntimePromise;
}

export async function handleOpenCodeMcpRequest(request: Request): Promise<Response> {
  const runtime = await getMcpRuntime();
  return runtime.transport.handleRequest(request);
}
