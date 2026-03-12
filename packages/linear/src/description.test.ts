import { describe, expect, it } from 'vitest';
import { mapStoryToLinearIssueInput, parseLinearDescriptionToStoryFields } from './description';
import { mapLinearStatusToStoryStatus } from './status-map';

const story = {
  id: 'story_1',
  title: 'Login',
  content: {
    _version: 1 as const,
    user_story: 'As a user, I can log in.',
    acceptance_criteria: '- [ ] Can submit credentials',
    edge_cases: 'Locked account',
    technical_guidelines: 'Use existing auth API',
    figma_link: 'https://figma.com/file/abc',
  },
  status: 'backlog',
};

describe('linear description formatting', () => {
  it('maps story into linear issue input', () => {
    const input = mapStoryToLinearIssueInput(story, {
      teamId: 'team_1',
    });

    expect(input.title).toBe('Login');
    expect(input.teamId).toBe('team_1');
    expect(input.description).toContain('## User Story');
    expect(input.description).toContain('## Acceptance Criteria');
    expect(input.description).toContain('## BeemSpec Story ID');
  });

  it('parses mirrored story fields from linear description', () => {
    const parsed = parseLinearDescriptionToStoryFields(
      ['## User Story', 'As a user...', '', '## Acceptance Criteria', '- [ ] Works'].join('\n'),
    );

    expect(parsed).toMatchObject({
      user_story: 'As a user...',
      acceptance_criteria: '- [ ] Works',
    });
  });

  it('normalizes figma markdown links to raw url', () => {
    const parsed = parseLinearDescriptionToStoryFields(
      ['## Figma', '[https://figma.com/design/abc?node-id=1-2](<https://figma.com/design/abc?node-id=1-2>)'].join('\n'),
    );

    expect(parsed.figma_link).toBe('https://figma.com/design/abc?node-id=1-2');
  });
});

describe('linear status mapping', () => {
  it('normalizes linear status names into story status', () => {
    expect(mapLinearStatusToStoryStatus('In Progress')).toBe('in_progress');
    expect(mapLinearStatusToStoryStatus('completed')).toBe('done');
    expect(mapLinearStatusToStoryStatus('unknown')).toBeNull();
  });
});
