import { describe, expect, it } from 'vitest';
import { createOpenCodePluginStub, createOpenCodeSessionStub } from './stub';

describe('opencode plugin stub contracts', () => {
  it('returns null when integration flag is disabled', () => {
    expect(createOpenCodePluginStub(false)).toBeNull();
  });

  it('returns compaction context and keeps system prompt unchanged', async () => {
    const plugin = createOpenCodePluginStub(true);
    expect(plugin).not.toBeNull();
    if (!plugin) throw new Error('Expected plugin stub to be created');

    const compaction = await plugin.onCompacting({
      sessionId: 'session-1',
      context: {
        releaseId: 'release-1',
        storyId: 'story-1',
        storyTitle: 'Authentication flow',
        requirements: 'As a user...',
        acceptanceCriteria: '- [ ] Works',
        technicalGuidelines: null,
      },
    });
    const transformed = await plugin.onSystemTransform({
      sessionId: 'session-1',
      system: ['base-system-message'],
      context: {
        releaseId: 'release-1',
        storyId: 'story-1',
        storyTitle: 'Authentication flow',
        requirements: 'As a user...',
        acceptanceCriteria: '- [ ] Works',
        technicalGuidelines: null,
      },
    });

    expect(compaction.context).toContain('Release ID: release-1');
    expect(compaction.context).toContain('Story ID: story-1');
    expect(transformed.system).toEqual(['base-system-message']);
  });

  it('creates and reads session snapshots when enabled', async () => {
    const sessions = createOpenCodeSessionStub(true);
    expect(sessions).not.toBeNull();
    if (!sessions) throw new Error('Expected session stub to be created');

    const created = await sessions.createSession({
      releaseId: 'release-1',
      storyId: 'story-1',
      storyTitle: 'Authentication flow',
      linearIssueId: 'lin_1',
      linearIssueIdentifier: 'ENG-1',
      requirements: 'As a user...',
      acceptanceCriteria: '- [ ] Works',
      technicalGuidelines: null,
    });

    const fetched = await sessions.getSessionById(created.id);
    expect(fetched).toEqual(created);
    expect(created.url).toContain(created.id);
  });
});
