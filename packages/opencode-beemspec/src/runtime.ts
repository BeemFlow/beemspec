import type { Plugin } from '@opencode-ai/plugin';
import { tool } from '@opencode-ai/plugin';
import type { OpenCodeSessionContext } from './contracts';
import { compactedContext, createBeemSpecNetworkTools } from './plugin';

export const BeemSpecPlugin: Plugin = async ({ client }) => {
  const baseUrl = process.env.BEEMSPEC_BASE_URL ?? process.env.BEEMSPEC_APP_URL;
  const token = process.env.BEEMSPEC_OPENCODE_TOKEN;
  const networkTools = baseUrl ? createBeemSpecNetworkTools({ baseUrl, token }) : null;

  const sessionContextBySessionId = new Map<string, OpenCodeSessionContext>();

  return {
    tool: {
      beemspec_story: tool({
        description: 'Load BeemSpec story context for the current task',
        args: {
          storyId: tool.schema.string().uuid(),
        },
        async execute(args, context) {
          if (!networkTools) throw new Error('BEEMSPEC_BASE_URL is required for beemspec_story tool');
          const storyContext = await networkTools.loadStoryById({ storyId: args.storyId });
          sessionContextBySessionId.set(context.sessionID, storyContext);
          return JSON.stringify(storyContext, null, 2);
        },
      }),
      beemspec_blocked: tool({
        description: 'Mark a BeemSpec story as blocked with a reason',
        args: {
          storyId: tool.schema.string().uuid(),
          reason: tool.schema.string().min(1),
        },
        async execute(args) {
          if (!networkTools) throw new Error('BEEMSPEC_BASE_URL is required for beemspec_blocked tool');
          await networkTools.markStoryBlocked({ storyId: args.storyId, reason: args.reason });
          return JSON.stringify({ ok: true });
        },
      }),
    },
    event: async ({ event }) => {
      if (
        event.type !== 'session.created' &&
        event.type !== 'session.updated' &&
        event.type !== 'session.idle' &&
        event.type !== 'session.error'
      ) {
        return;
      }

      await client.app.log({
        body: {
          service: 'opencode-beemspec',
          level: event.type === 'session.error' ? 'error' : 'info',
          message: `session lifecycle event: ${event.type}`,
          extra: event.properties,
        },
      });
    },
    'experimental.session.compacting': async (input, output) => {
      const sessionContext = sessionContextBySessionId.get(input.sessionID);
      if (!sessionContext) return;
      output.context.push(...compactedContext(sessionContext));
    },
    'experimental.chat.system.transform': async (input, output) => {
      const sessionContext = input.sessionID ? sessionContextBySessionId.get(input.sessionID) : null;
      if (!sessionContext) return;
      output.system = [
        ...output.system,
        'BeemSpec source-of-truth context is active for this session.',
        `Current story: ${sessionContext.storyTitle} (${sessionContext.storyId})`,
      ];
    },
  };
};

export default BeemSpecPlugin;
