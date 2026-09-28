import { describe, expect, it } from 'vitest';
import type { Story } from '@/types';
import { buildReleaseKickoffPrompt, buildStoryKickoffPrompt } from './AgentKickoffButton';

const map = { storyMapId: 'map-1', storyMapName: 'Checkout' };
const story: Story = {
  id: 'story-1',
  task_id: 'task-1',
  release_id: 'release-1',
  sort_order: 0,
  status: 'todo',
  title: 'Pay for an order',
  content: { _version: 1, user_story: 'As a shopper, I can pay.', acceptance_criteria: 'Payment succeeds.' },
};

describe('agent kickoff prompts', () => {
  it('starts release planning with server instructions and the available release read tool', () => {
    const prompt = buildReleaseKickoffPrompt({ ...map, releaseId: 'release-1', releaseName: 'First release' });

    expect(prompt).toContain('Follow the BeemSpec MCP server instructions.');
    expect(prompt).toContain('Call `release_get` with the target release_id below');
    expect(prompt).not.toContain('workflow_guide');
    expect(prompt.split('\n').slice(2)).toEqual([
      'Start with story_map_id: map-1',
      'Story map: Checkout',
      'Target release_id: release-1',
      'Target release: First release',
    ]);
  });

  it.each(['release-1', null])('loads story context and preserves placement for release %s', (releaseId) => {
    const prompt = buildStoryKickoffPrompt({ ...map, story: { ...story, release_id: releaseId } });

    expect(prompt).toContain('Follow the BeemSpec MCP server instructions.');
    expect(prompt).toContain('Call `story_context_get` with the target story_id below');
    expect(prompt).not.toContain('workflow_guide');
    expect(prompt.split('\n').slice(2)).toEqual([
      'Start with story_map_id: map-1',
      'Story map: Checkout',
      'Target story_id: story-1',
      'Target story: Pay for an order',
      `Current release_id: ${releaseId ?? 'backlog'}`,
    ]);
  });
});
