import { createOpencodeClient } from '@opencode-ai/sdk';
import { env } from '@/lib/env';
import type {
  OpenCodeSessionCreateInput,
  OpenCodeSessionPort,
  OpenCodeSessionSnapshot,
  OpenCodeSessionStoryAssignmentInput,
} from '../../../packages/opencode-beemspec/src/contracts';

export type OpenCodeSessions = OpenCodeSessionPort;

export function isAuthorizedByOpenCodeToken(request: Request): boolean {
  const token = env.openCodeToken();
  if (!token) return false;

  const authHeader = request.headers.get('authorization') ?? '';
  return authHeader === `Bearer ${token}`;
}

type OpenCodeClient = ReturnType<typeof createOpencodeClient>;

function getOpencodeBaseUrl(): string {
  return env.openCodeBaseUrl();
}

function getOpencodeSessionUrl(sessionId: string): string {
  const baseUrl = env.openCodeWebBaseUrl() ?? getOpencodeBaseUrl();
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

function buildSessionTitle(input: OpenCodeSessionCreateInput): string {
  if (input.storyTitle && input.linearIssueIdentifier) {
    return `${input.linearIssueIdentifier} ${input.storyTitle}`;
  }
  if (input.storyTitle) {
    return input.storyTitle;
  }
  if (input.runId) {
    return `Build run ${input.runId}`;
  }
  return `Release ${input.releaseId}`;
}

function buildSessionContextPrompt(input: OpenCodeSessionCreateInput): string {
  const hasStoryContext = Boolean(
    input.storyId && input.storyTitle && input.linearIssueIdentifier && input.requirements && input.acceptanceCriteria,
  );

  if (hasStoryContext) {
    return [
      '# BeemSpec Story Context',
      `Release ID: ${input.releaseId ?? 'none'}`,
      `Story ID: ${input.storyId}`,
      `Story Title: ${input.storyTitle}`,
      `Linear Issue: ${input.linearIssueIdentifier}`,
      '',
      '## Requirements',
      input.requirements as string,
      '',
      '## Acceptance Criteria',
      input.acceptanceCriteria as string,
      '',
      '## Technical Guidelines',
      input.technicalGuidelines?.trim() || 'None provided.',
    ].join('\n');
  }

  const stories = input.stories ?? [];
  const storyLines =
    stories.length > 0
      ? stories.map(
          (story) =>
            `- ${story.storyTitle} (${story.storyId})${story.linearIssueIdentifier ? ` [${story.linearIssueIdentifier}]` : ''}`,
        )
      : ['- No stories provided'];

  return [
    '# BeemSpec Build Run Context',
    `Release ID: ${input.releaseId ?? 'none'}`,
    `Run ID: ${input.runId ?? 'unknown'}`,
    '',
    '## Assigned Stories',
    ...storyLines,
    '',
    '## Technical Guidelines',
    input.technicalGuidelines?.trim() || 'None provided.',
  ].join('\n');
}

function buildStoryAssignmentPrompt(input: OpenCodeSessionStoryAssignmentInput): string {
  return [
    '# BeemSpec Story Assignment',
    `Run ID: ${input.runId}`,
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
      title: buildSessionTitle(input),
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

export function createOpenCodeSessions(enabled: boolean): OpenCodeSessions | null {
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
    async appendStoryAssignment(input: OpenCodeSessionStoryAssignmentInput): Promise<void> {
      const client = getClient();
      await client.session.prompt({
        path: { id: input.sessionId },
        body: {
          noReply: true,
          parts: [{ type: 'text', text: buildStoryAssignmentPrompt(input) }],
        },
      });
    },
  };
}

export function getOpenCodeSessions(): OpenCodeSessions | null {
  return createOpenCodeSessions(true);
}
