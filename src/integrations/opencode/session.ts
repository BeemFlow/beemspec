import { createOpencodeClient } from '@opencode-ai/sdk';
import { env } from '@/lib/env';
import type {
  OpenCodeSessionCreateInput,
  OpenCodeSessionService,
  OpenCodeSessionSnapshot,
  OpenCodeSessionStoryAssignmentInput,
} from '../../../packages/opencode-beemspec/src/types';

export type OpenCodeSessions = OpenCodeSessionService;

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

function getOpencodeAuthorizationHeader(): string | null {
  const password = env.openCodeServerPassword();
  if (!password) return null;

  const username = env.openCodeServerUsername() ?? 'opencode';
  const encoded = Buffer.from(`${username}:${password}`).toString('base64');
  return `Basic ${encoded}`;
}

function getOpencodeSessionUrl(sessionId: string, workingDirectory?: string): string {
  const baseUrl = env.openCodeWebBaseUrl() ?? getOpencodeBaseUrl();
  const dir = workingDirectory ?? env.openCodeWorkingDirectory();
  if (dir) {
    const encodedDir = Buffer.from(dir).toString('base64').replace(/=+$/, '');
    return `${baseUrl.replace(/\/$/, '')}/${encodedDir}/session/${sessionId}`;
  }
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
  const hasStoryContext = Boolean(input.storyId && input.storyTitle && input.requirements && input.acceptanceCriteria);

  if (hasStoryContext) {
    return [
      '# BeemSpec Story Context',
      `Release ID: ${input.releaseId ?? 'none'}`,
      `Story ID: ${input.storyId}`,
      `Story Title: ${input.storyTitle}`,
      ...(input.linearIssueIdentifier ? [`Linear Issue: ${input.linearIssueIdentifier}`] : []),
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
    ...(input.linearIssueIdentifier ? [`Linear Issue: ${input.linearIssueIdentifier}`] : []),
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
  const directory = input.workingDirectory;
  const created = await client.session.create({
    body: {
      title: buildSessionTitle(input),
    },
    ...(directory ? { query: { directory } } : {}),
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
    url: getOpencodeSessionUrl(session.id, directory),
    state: toSessionState(session.status),
    createdAt: session.createdAt ?? new Date().toISOString(),
  };
}

let cachedClient: OpenCodeClient | null = null;

export function resetOpenCodeClientForTests(): void {
  cachedClient = null;
}

function getClient(): OpenCodeClient {
  if (cachedClient) return cachedClient;

  const authorization = getOpencodeAuthorizationHeader();
  cachedClient = createOpencodeClient({
    baseUrl: getOpencodeBaseUrl(),
    headers: authorization ? { authorization } : undefined,
  });

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
    async startSession(sessionId: string, storyCount: number): Promise<void> {
      const client = getClient();
      const noun = storyCount === 1 ? 'story' : 'stories';
      await client.session.prompt({
        path: { id: sessionId },
        body: {
          parts: [
            {
              type: 'text',
              text: [
                `You have been assigned ${storyCount} ${noun} above.`,
                '',
                'IMPORTANT: Implement them now. Do NOT stop after exploring the codebase.',
                'Do NOT present a plan and wait for confirmation.',
                'Do NOT ask clarifying questions — use your best judgment.',
                '',
                'Your workflow should be:',
                '1. Read the relevant source files to understand the codebase',
                '2. Write the code changes to fulfill the requirements and acceptance criteria',
                '3. Run any existing tests or linters if available',
                '4. Verify your implementation is complete',
                '',
                'Complete the full implementation in this session. Follow any technical guidelines provided in the context above.',
              ].join('\n'),
            },
          ],
        },
      });
    },
  };
}
