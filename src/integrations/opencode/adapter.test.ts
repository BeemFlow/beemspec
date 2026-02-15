import { describe, expect, it } from 'vitest';
import { createOpenCodePluginAdapter } from './adapter';

describe('opencode plugin adapter', () => {
  it('returns null when disabled', () => {
    expect(createOpenCodePluginAdapter(false)).toBeNull();
  });

  it('returns package-backed plugin when enabled', async () => {
    const plugin = createOpenCodePluginAdapter(true);
    expect(plugin).not.toBeNull();
    if (!plugin) throw new Error('Expected plugin adapter');

    const compacted = await plugin.onCompacting({
      sessionId: 'session_1',
      context: {
        releaseId: 'release_1',
        storyId: 'story_1',
        storyTitle: 'Auth',
        requirements: 'Req',
        acceptanceCriteria: 'AC',
        technicalGuidelines: null,
      },
    });

    expect(compacted.context).toContain('Release ID: release_1');
  });
});
