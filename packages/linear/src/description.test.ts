import { describe, expect, it } from 'vitest';
import { mapStoryToLinearIssueInput, parseLinearDescriptionToStoryFields } from './description';
import { mapLinearStatusToStoryStatus } from './status-map';

const story = {
  id: 'story_1',
  title: 'Login',
  content: {
    _version: 1 as const,
    requirements: 'As a user, I can log in.',
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
      stateId: 'state_1',
    });

    expect(input.title).toBe('Login');
    expect(input.teamId).toBe('team_1');
    expect(input.stateId).toBe('state_1');
    expect(input.description).toContain('## Requirements');
    expect(input.description).toContain('## Acceptance Criteria');
    expect(input.description).toContain('## BeemSpec Story ID');
  });

  it('parses mirrored story fields from linear description', () => {
    const parsed = parseLinearDescriptionToStoryFields(
      [
        '## Requirements',
        'As a user...',
        '',
        '## Acceptance Criteria',
        '- [ ] Works',
        '',
        '## Status',
        'In Progress',
      ].join('\n'),
    );

    expect(parsed).toMatchObject({
      requirements: 'As a user...',
      acceptance_criteria: '- [ ] Works',
      status: 'in_progress',
    });
  });
});

describe('linear status mapping', () => {
  it('normalizes linear status names into story status', () => {
    expect(mapLinearStatusToStoryStatus('In Progress')).toBe('in_progress');
    expect(mapLinearStatusToStoryStatus('completed')).toBe('done');
    expect(mapLinearStatusToStoryStatus('unknown')).toBeNull();
  });
});
