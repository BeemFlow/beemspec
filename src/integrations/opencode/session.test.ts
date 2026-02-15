import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createOpenCodeSessions } from './session';

const create = vi.fn();
const prompt = vi.fn();
const get = vi.fn();

vi.mock('@opencode-ai/sdk', () => ({
  createOpencodeClient: vi.fn(() => ({
    session: {
      create,
      prompt,
      get,
    },
  })),
}));

describe('opencode session port', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.BEEMSPEC_OPENCODE_BASE_URL;
    delete process.env.BEEMSPEC_OPENCODE_WEB_BASE_URL;
  });

  it('returns null when disabled', () => {
    expect(createOpenCodeSessions(false)).toBeNull();
  });

  it('creates session and injects story context via SDK', async () => {
    const port = createOpenCodeSessions(true);
    if (!port) throw new Error('Expected session port');

    create.mockResolvedValue({ data: { id: 'session_1', status: 'active', createdAt: '2026-02-15T00:00:00.000Z' } });
    prompt.mockResolvedValue({ data: {} });

    const session = await port.createSession({
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
    expect(prompt).toHaveBeenCalledWith(
      expect.objectContaining({
        path: { id: 'session_1' },
        body: expect.objectContaining({ noReply: true }),
      }),
    );
    expect(session).toMatchObject({ id: 'session_1', state: 'active' });
  });

  it('reads existing session by id', async () => {
    const port = createOpenCodeSessions(true);
    if (!port) throw new Error('Expected session port');

    get.mockResolvedValue({ data: { id: 'session_2', status: 'idle', createdAt: '2026-02-15T00:00:00.000Z' } });
    const session = await port.getSessionById('session_2');

    expect(get).toHaveBeenCalledWith({ path: { id: 'session_2' } });
    expect(session).toMatchObject({ id: 'session_2', state: 'completed' });
  });

  it('appends story assignment prompt to existing session', async () => {
    const port = createOpenCodeSessions(true);
    if (!port) throw new Error('Expected session port');

    prompt.mockResolvedValue({ data: {} });

    await port.appendStoryAssignment({
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
});
