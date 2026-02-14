import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getLinearStorySyncTargetFromEnv, mapStoryToLinearIssueInput, syncNewStoryToLinear } from './story-sync';

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
  beforeEach(() => {
    delete process.env.BEEMSPEC_LINEAR_DEFAULT_TEAM_ID;
    delete process.env.BEEMSPEC_LINEAR_DEFAULT_PROJECT_ID;
    delete process.env.BEEMSPEC_LINEAR_DEFAULT_STATE_ID;
  });

  it('reads sync target from env', () => {
    process.env.BEEMSPEC_LINEAR_DEFAULT_TEAM_ID = 'team_1';
    process.env.BEEMSPEC_LINEAR_DEFAULT_PROJECT_ID = 'project_1';

    expect(getLinearStorySyncTargetFromEnv()).toEqual({
      teamId: 'team_1',
      projectId: 'project_1',
      stateId: undefined,
    });
  });

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
    const result = await syncNewStoryToLinear(story, {
      getIssueById: vi.fn(),
      createIssue,
      updateIssue: vi.fn(),
    });

    expect(result).toBeNull();
    expect(createIssue).not.toHaveBeenCalled();
  });

  it('calls createIssue when configured', async () => {
    process.env.BEEMSPEC_LINEAR_DEFAULT_TEAM_ID = 'team_1';
    const createIssue = vi.fn().mockResolvedValue({ id: 'lin_1' });

    await syncNewStoryToLinear(story, {
      getIssueById: vi.fn(),
      createIssue,
      updateIssue: vi.fn(),
    });

    expect(createIssue).toHaveBeenCalledTimes(1);
  });
});
