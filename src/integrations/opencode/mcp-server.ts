import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';

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
      const { data: story, error } = await supabase
        .from('stories')
        .select('id, release_id, title, requirements, acceptance_criteria, technical_guidelines')
        .eq('id', storyId)
        .single();

      if (error || !story) {
        return {
          isError: true,
          content: [{ type: 'text', text: 'Story not found' }],
        };
      }

      if (!story.release_id) {
        return {
          isError: true,
          content: [{ type: 'text', text: 'Story is not assigned to a release' }],
        };
      }

      const context = {
        releaseId: story.release_id,
        storyId: story.id,
        storyTitle: story.title,
        requirements: story.requirements,
        acceptanceCriteria: story.acceptance_criteria,
        technicalGuidelines: story.technical_guidelines,
      };

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
      const blockedReason = `Blocked: ${reason}`;

      const { data: latestItem, error: latestItemError } = await supabase
        .from('build_run_items')
        .select('id')
        .eq('story_id', storyId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (latestItemError) {
        return {
          isError: true,
          content: [{ type: 'text', text: 'Failed to locate build run item' }],
        };
      }

      if (!latestItem) {
        return {
          isError: true,
          content: [{ type: 'text', text: 'No build run item found for story' }],
        };
      }

      const { error: updateError } = await supabase
        .from('build_run_items')
        .update({ status: 'failed', error: blockedReason, last_retry_at: new Date().toISOString() })
        .eq('id', latestItem.id);

      if (updateError) {
        return {
          isError: true,
          content: [{ type: 'text', text: 'Failed to mark story blocked' }],
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
