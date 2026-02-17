import type { Plugin } from '@opencode-ai/plugin';
import type { OpenCodeSessionContext } from './contracts';
import { compactedContext } from './plugin';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isSessionContext(value: unknown): value is OpenCodeSessionContext {
  if (!isRecord(value)) return false;

  return (
    typeof value.releaseId === 'string' &&
    typeof value.storyId === 'string' &&
    typeof value.storyTitle === 'string' &&
    typeof value.requirements === 'string' &&
    typeof value.acceptanceCriteria === 'string' &&
    (typeof value.technicalGuidelines === 'string' || value.technicalGuidelines === null)
  );
}

function shouldCaptureStoryContext(toolName: string): boolean {
  return toolName === 'beemspec_story';
}

function parseSessionContextFromToolOutput(output: string): OpenCodeSessionContext | null {
  const parse = (text: string): OpenCodeSessionContext | null => {
    try {
      const parsed = JSON.parse(text);
      return isSessionContext(parsed) ? parsed : null;
    } catch {
      return null;
    }
  };

  const direct = parse(output);
  if (direct) return direct;

  const objectMatch = output.match(/\{[\s\S]*\}/);
  if (!objectMatch) return null;

  try {
    const parsed = JSON.parse(objectMatch[0]);
    return isSessionContext(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export const BeemSpecPlugin: Plugin = async ({ client }) => {
  const sessionContextBySessionId = new Map<string, OpenCodeSessionContext>();

  return {
    'tool.execute.after': async (input, output) => {
      if (!shouldCaptureStoryContext(input.tool)) return;

      const sessionContext = parseSessionContextFromToolOutput(output.output);
      if (!sessionContext) return;

      sessionContextBySessionId.set(input.sessionID, sessionContext);
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
