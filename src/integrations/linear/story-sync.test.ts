import { describe, expect, it, vi } from 'vitest';
import { mapStoryToLinearIssueInput, syncNewStoryToLinear, syncStoryToLinear } from './story-sync';

const story = {
  id: 'story_1',
  title: 'Login',
  requirements: 'As a user, I can log in.',
  acceptance_criteria: '- [ ] Can submit credentials',
  edge_cases: 'Locked account',
  technical_guidelines: 'Use existing auth API',
  figma_link: 'https://figma.com/file/abc',
  status: 'backlog',
};

describe('linear story sync mapping', () => {
  const target = { teamId: 'team_1', projectId: 'project_1' };

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

  it('skips sync when team target not configured', async () => {
    const createIssue = vi.fn();
    const result = await syncNewStoryToLinear(
      story,
      {
        getIssueById: vi.fn(),
        createIssue,
        updateIssue: vi.fn(),
      },
      null,
    );

    expect(result).toBeNull();
    expect(createIssue).not.toHaveBeenCalled();
  });

  it('calls createIssue when configured', async () => {
    const createIssue = vi.fn().mockResolvedValue({ id: 'lin_1' });

    await syncNewStoryToLinear(
      story,
      {
        getIssueById: vi.fn(),
        createIssue,
        updateIssue: vi.fn(),
      },
      target,
    );

    expect(createIssue).toHaveBeenCalledTimes(1);
  });

  it('calls updateIssue when story already has a link', async () => {
    const updateIssue = vi.fn().mockResolvedValue({ id: 'lin_1' });

    await syncStoryToLinear(
      story,
      {
        getIssueById: vi.fn(),
        createIssue: vi.fn(),
        updateIssue,
      },
      'lin_1',
      target,
    );

    expect(updateIssue).toHaveBeenCalledTimes(1);
    expect(updateIssue).toHaveBeenCalledWith(
      'lin_1',
      expect.objectContaining({
        title: story.title,
      }),
    );
    expect(updateIssue).toHaveBeenCalledWith('lin_1', expect.not.objectContaining({ teamId: 'team_1' }));
  });
});
