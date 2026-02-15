import { createOpencodeClient } from '@opencode-ai/sdk';
import type {
  OpenCodeSessionCreateInput,
  OpenCodeSessionPort,
  OpenCodeSessionSnapshot,
} from '@/integrations/opencode/contracts';

type OpenCodeClient = ReturnType<typeof createOpencodeClient>;

function getOpencodeBaseUrl(): string {
  return process.env.BEEMSPEC_OPENCODE_BASE_URL ?? 'http://127.0.0.1:4096';
}

function getOpencodeSessionUrl(sessionId: string): string {
  const baseUrl = process.env.BEEMSPEC_OPENCODE_WEB_BASE_URL ?? getOpencodeBaseUrl();
  return `${baseUrl.replace(/\/$/, '')}/session/${sessionId}`;
}

function readData<T>(value: unknown): T {
  if (value && typeof value === 'object' && 'data' in value) {
    return (value as { data: T }).data;
  }
  return value as T;
}

function toSessionState(status: unknown): OpenCodeSessionSnapshot['state'] {
  if (status === 'error') return 'failed';
  if (status === 'idle' || status === 'completed') return 'completed';
  return 'active';
}

function buildSessionContextPrompt(input: OpenCodeSessionCreateInput): string {
  return [
    '# BeemSpec Story Context',
    `Release ID: ${input.releaseId}`,
    `Story ID: ${input.storyId}`,
    `Story Title: ${input.storyTitle}`,
    `Linear Issue: ${input.linearIssueIdentifier}`,
    '',
    '## Requirements',
    input.requirements,
    '',
    '## Acceptance Criteria',
    input.acceptanceCriteria,
    '',
    '## Technical Guidelines',
    input.technicalGuidelines?.trim() || 'None provided.',
  ].join('\n');
}

async function createAndSeedSession(
  client: OpenCodeClient,
  input: OpenCodeSessionCreateInput,
): Promise<OpenCodeSessionSnapshot> {
  const created = await client.session.create({
    body: {
      title: `${input.linearIssueIdentifier} ${input.storyTitle}`,
    },
  });

  const session = readData<{ id: string; createdAt?: string; status?: string }>(created);
  await client.session.prompt({
    path: { id: session.id },
    body: {
      noReply: true,
      parts: [{ type: 'text', text: buildSessionContextPrompt(input) }],
    },
  });

  return {
    id: session.id,
    url: getOpencodeSessionUrl(session.id),
    state: toSessionState(session.status),
    createdAt: session.createdAt ?? new Date().toISOString(),
  };
}

let cachedClient: OpenCodeClient | null = null;

function getClient(): OpenCodeClient {
  if (cachedClient) return cachedClient;
  cachedClient = createOpencodeClient({ baseUrl: getOpencodeBaseUrl() });
  return cachedClient;
}

export function createOpenCodeSessionPort(enabled: boolean): OpenCodeSessionPort | null {
  if (!enabled) return null;

  return {
    async createSession(input: OpenCodeSessionCreateInput): Promise<OpenCodeSessionSnapshot> {
      const client = getClient();
      return createAndSeedSession(client, input);
    },
    async getSessionById(sessionId: string): Promise<OpenCodeSessionSnapshot | null> {
      const client = getClient();
      try {
        const result = await client.session.get({ path: { id: sessionId } });
        const session = readData<{ id: string; createdAt?: string; status?: string }>(result);
        return {
          id: session.id,
          url: getOpencodeSessionUrl(session.id),
          state: toSessionState(session.status),
          createdAt: session.createdAt ?? new Date().toISOString(),
        };
      } catch {
        return null;
      }
    },
  };
}
