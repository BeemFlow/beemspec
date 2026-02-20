import type { OpenCodeClient, OpenCodeClientConfig } from './client';
import { buildAuthorizationHeader, buildSessionUrl, createOpenCodeClient } from './client';
import {
  buildSessionContextPrompt,
  buildSessionTitle,
  buildStartSessionPrompt,
  buildStoryAssignmentPrompt,
} from './prompts';
import type {
  OpenCodeSessionCreateInput,
  OpenCodeSessionService,
  OpenCodeSessionSnapshot,
  OpenCodeSessionStoryAssignmentInput,
} from './types';

interface OpenCodeMessage {
  info?: {
    role?: string;
    finish?: string;
    time?: { completed?: number };
  };
}

function readData<T>(value: unknown): T {
  if (value && typeof value === 'object' && 'data' in value) {
    return (value as { data: T }).data;
  }
  return value as T;
}

/**
 * Determine session state by inspecting the last assistant message's `finish` field.
 * OpenCode sessions don't have a lifecycle state on the session object itself.
 * - `finish: 'stop'` -> agent stopped (completed)
 * - `finish: 'tool-calls'` -> agent is mid-turn (active)
 * - No assistant messages -> hasn't started yet (active)
 */
async function detectSessionState(
  config: OpenCodeClientConfig,
  sessionId: string,
): Promise<OpenCodeSessionSnapshot['state']> {
  const authorization = buildAuthorizationHeader(config);
  const headers: Record<string, string> = {};
  if (authorization) headers.authorization = authorization;

  try {
    const res = await fetch(`${config.baseUrl}/session/${encodeURIComponent(sessionId)}/message`, {
      cache: 'no-store',
      headers,
    });
    if (!res.ok) return 'active';

    const messages: OpenCodeMessage[] = await res.json();
    if (!Array.isArray(messages) || messages.length === 0) return 'active';

    // Walk backwards to find the last assistant message
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];
      if (msg.info?.role === 'assistant') {
        return msg.info.finish === 'stop' ? 'completed' : 'active';
      }
    }

    return 'active';
  } catch {
    return 'active';
  }
}

async function createAndSeedSession(
  client: OpenCodeClient,
  config: OpenCodeClientConfig,
  input: OpenCodeSessionCreateInput,
): Promise<OpenCodeSessionSnapshot> {
  const directory = input.workingDirectory;
  const created = await client.session.create({
    body: {
      title: buildSessionTitle(input),
    },
    ...(directory ? { query: { directory } } : {}),
  });

  const session = readData<{ id: string; time?: { created?: number } }>(created);
  await client.session.prompt({
    path: { id: session.id },
    body: {
      noReply: true,
      parts: [{ type: 'text', text: buildSessionContextPrompt(input) }],
    },
  });

  return {
    id: session.id,
    url: buildSessionUrl(config, session.id, directory),
    state: 'active' as const,
    createdAt: session.time?.created ? new Date(session.time.created).toISOString() : new Date().toISOString(),
  };
}

/**
 * Create an OpenCodeSessionService implementation.
 * Config is injected — no env vars are read.
 *
 * Returns null when `enabled` is false.
 */
export function createOpenCodeSessionService(
  enabled: boolean,
  config: OpenCodeClientConfig,
): OpenCodeSessionService | null {
  if (!enabled) return null;

  let cachedClient: OpenCodeClient | null = null;

  function getClient(): OpenCodeClient {
    if (cachedClient) return cachedClient;
    cachedClient = createOpenCodeClient(config);
    return cachedClient;
  }

  return {
    async createSession(input: OpenCodeSessionCreateInput): Promise<OpenCodeSessionSnapshot> {
      const client = getClient();
      return createAndSeedSession(client, config, input);
    },

    async getSessionById(sessionId: string): Promise<OpenCodeSessionSnapshot | null> {
      const authorization = buildAuthorizationHeader(config);
      const headers: Record<string, string> = {};
      if (authorization) headers.authorization = authorization;

      const res = await fetch(`${config.baseUrl}/session/${encodeURIComponent(sessionId)}`, {
        cache: 'no-store',
        headers,
      });

      if (res.status === 404) return null;
      if (!res.ok) {
        throw new Error(`OpenCode session lookup failed (${res.status})`);
      }

      const session = (await res.json()) as { id: string; time?: { created?: number } };
      const state = await detectSessionState(config, sessionId);
      return {
        id: session.id,
        url: buildSessionUrl(config, session.id),
        state,
        createdAt: session.time?.created ? new Date(session.time.created).toISOString() : new Date().toISOString(),
      };
    },

    async appendStoryAssignment(input: OpenCodeSessionStoryAssignmentInput): Promise<void> {
      const client = getClient();
      await client.session.prompt({
        path: { id: input.sessionId },
        ...(input.workingDirectory ? { query: { directory: input.workingDirectory } } : {}),
        body: {
          noReply: true,
          parts: [{ type: 'text', text: buildStoryAssignmentPrompt(input) }],
        },
      });
    },

    async startSession(sessionId: string, storyCount: number, workingDirectory?: string | null): Promise<void> {
      const client = getClient();
      await client.session.promptAsync({
        path: { id: sessionId },
        ...(workingDirectory ? { query: { directory: workingDirectory } } : {}),
        body: {
          parts: [
            {
              type: 'text',
              text: buildStartSessionPrompt(storyCount, workingDirectory),
            },
          ],
        },
      });
    },
  };
}
