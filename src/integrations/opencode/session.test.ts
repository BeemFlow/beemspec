import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createOpenCodeSessions } from './session';

const { createOpencodeClientMock, create, prompt, get } = vi.hoisted(() => ({
  createOpencodeClientMock: vi.fn(),
  create: vi.fn(),
  prompt: vi.fn(),
  get: vi.fn(),
}));

vi.mock('@opencode-ai/sdk', () => ({
  createOpencodeClient: createOpencodeClientMock.mockImplementation(() => ({
    session: {
      create,
      prompt,
      get,
    },
  })),
}));

describe('opencode session service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.BEEMSPEC_OPENCODE_BASE_URL;
    delete process.env.BEEMSPEC_OPENCODE_WEB_BASE_URL;
    delete process.env.BEEMSPEC_OPENCODE_SERVER_USERNAME;
    delete process.env.BEEMSPEC_OPENCODE_SERVER_PASSWORD;
    delete process.env.OPENCODE_SERVER_USERNAME;
    delete process.env.OPENCODE_SERVER_PASSWORD;
  });

  it('returns null when disabled', () => {
    expect(createOpenCodeSessions(false)).toBeNull();
  });

  it('creates session and injects story context via SDK', async () => {
    const service = createOpenCodeSessions(true);
    if (!service) throw new Error('Expected session service');

    create.mockResolvedValue({ data: { id: 'session_1', status: 'active', createdAt: '2026-02-15T00:00:00.000Z' } });
    prompt.mockResolvedValue({ data: {} });

    const session = await service.createSession({
      releaseId: 'release_1',
      storyId: 'story_1',
      storyTitle: 'Authentication flow',
      linearIssueId: 'lin_1',
      linearIssueIdentifier: 'ENG-1',
      requirements: 'User can sign in',
      acceptanceCriteria: 'Given credentials then login works',
      technicalGuidelines: null,
    });

    expect(create).toHaveBeenCalledWith({ body: { title: 'ENG-1 Authentication flow' } });
    expect(createOpencodeClientMock).toHaveBeenCalledWith({
      baseUrl: 'http://127.0.0.1:4096',
      directory: undefined,
      headers: undefined,
    });
    expect(prompt).toHaveBeenCalledWith(
      expect.objectContaining({
        path: { id: 'session_1' },
        body: expect.objectContaining({ noReply: true }),
      }),
    );
    expect(session).toMatchObject({ id: 'session_1', state: 'active' });
  });

  it('reads existing session by id and detects completed state from messages', async () => {
    const service = createOpenCodeSessions(true);
    if (!service) throw new Error('Expected session service');

    // 1) session details endpoint
    // 2) messages endpoint — last assistant message has finish: 'stop'
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: 'session_2', time: { created: 1700000000000 } }), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify([{ info: { role: 'assistant', finish: 'stop' } }]), { status: 200 }),
      );

    const session = await service.getSessionById('session_2');

    expect(fetchSpy).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('/session/session_2'),
      expect.objectContaining({ cache: 'no-store' }),
    );
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining('/session/session_2/message'),
      expect.objectContaining({ cache: 'no-store' }),
    );
    expect(session).toMatchObject({ id: 'session_2', state: 'completed' });

    fetchSpy.mockRestore();
  });

  it('appends story assignment prompt to existing session', async () => {
    const service = createOpenCodeSessions(true);
    if (!service) throw new Error('Expected session service');

    prompt.mockResolvedValue({ data: {} });

    await service.appendStoryAssignment({
      sessionId: 'session_3',
      runId: 'run_1',
      storyId: 'story_1',
      storyTitle: 'Authentication flow',
      linearIssueIdentifier: 'ENG-1',
      requirements: 'User can sign in',
      acceptanceCriteria: 'Given valid credentials, sign-in succeeds',
      technicalGuidelines: null,
    });

    expect(prompt).toHaveBeenCalledWith(
      expect.objectContaining({
        path: { id: 'session_3' },
        body: expect.objectContaining({ noReply: true }),
      }),
    );
  });

  it('uses basic auth header when OpenCode server password is configured', async () => {
    process.env.BEEMSPEC_OPENCODE_BASE_URL = 'http://127.0.0.1:5000';
    process.env.BEEMSPEC_OPENCODE_SERVER_USERNAME = 'automation';
    process.env.BEEMSPEC_OPENCODE_SERVER_PASSWORD = 'secret';

    const service = createOpenCodeSessions(true);
    if (!service) throw new Error('Expected session service');

    create.mockResolvedValue({ data: { id: 'session_4', status: 'active', createdAt: '2026-02-15T00:00:00.000Z' } });
    prompt.mockResolvedValue({ data: {} });

    await service.createSession({
      releaseId: 'release_1',
      storyId: 'story_1',
      storyTitle: 'Authentication flow',
      linearIssueId: 'lin_1',
      linearIssueIdentifier: 'ENG-1',
      requirements: 'User can sign in',
      acceptanceCriteria: 'Given credentials then login works',
      technicalGuidelines: null,
    });

    expect(createOpencodeClientMock).toHaveBeenCalledWith({
      baseUrl: 'http://127.0.0.1:5000',
      directory: undefined,
      headers: { authorization: 'Basic YXV0b21hdGlvbjpzZWNyZXQ=' },
    });
  });
});
