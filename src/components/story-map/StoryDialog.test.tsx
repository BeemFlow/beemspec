/* @vitest-environment jsdom */

import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StoryDialog } from './StoryDialog';

vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ open, children }: { open: boolean; children: React.ReactNode }) => (open ? <div>{children}</div> : null),
  DialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <h1>{children}</h1>,
}));

vi.mock('@/components/ui/select', () => ({
  Select: ({ value, onValueChange, disabled, children }: any) => (
    <div data-value={value} data-disabled={disabled} data-onchange={onValueChange ? 'yes' : 'no'}>
      {children}
    </div>
  ),
  SelectTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectValue: () => null,
  SelectContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectItem: ({ value, children }: { value: string; children: React.ReactNode }) => (
    <div data-value={value}>{children}</div>
  ),
}));

vi.mock('@/components/ui/delete-button', () => ({
  DeleteButton: ({ onDelete }: { onDelete: () => void }) => (
    <button type="button" onClick={onDelete}>
      Delete Story
    </button>
  ),
}));

vi.mock('@/components/story-map/AgentKickoffButton', () => ({
  AgentKickoffButton: () => <button type="button">Copy Agent Prompt</button>,
  buildStoryKickoffPrompt: () => 'prompt',
}));

describe('StoryDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('submits a new story with structured content and default release fallback', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(undefined);

    render(
      <StoryDialog
        open
        onOpenChange={vi.fn()}
        story={null}
        releases={[
          {
            id: 'release-1',
            story_map_id: 'map-1',
            name: 'Release 1',
            description: null,
            context_markdown: null,
            sort_order: 0,
          },
        ]}
        storyMapId="map-1"
        storyMapName="Core Platform"
        defaultReleaseId="release-1"
        onSave={onSave}
      />,
    );

    await user.type(screen.getByLabelText('Title *'), ' OAuth login ');
    await user.type(screen.getByLabelText(/User Story/i), 'As a user, I want Google login.');
    await user.click(screen.getByLabelText(/Acceptance Criteria/i));
    await user.paste('- [ ] OAuth works');
    await user.type(screen.getByLabelText('Figma Link'), 'https://figma.example.com');
    await user.click(screen.getByRole('button', { name: 'Save Story' }));

    expect(onSave).toHaveBeenCalledWith({
      title: 'OAuth login',
      content: {
        _version: 1,
        user_story: 'As a user, I want Google login.',
        acceptance_criteria: '- [ ] OAuth works',
        figma_link: 'https://figma.example.com',
        edge_cases: null,
        technical_guidelines: null,
      },
      status: 'backlog',
      release_id: 'release-1',
    });
  });

  it('loads an existing story and allows delete/cancel actions', async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn().mockResolvedValue(undefined);
    const onOpenChange = vi.fn();

    render(
      <StoryDialog
        open
        onOpenChange={onOpenChange}
        story={{
          id: 'story-1',
          task_id: 'task-1',
          release_id: null,
          sort_order: 0,
          status: 'done',
          title: 'Existing story',
          content: {
            _version: 1,
            user_story: 'Existing user story',
            acceptance_criteria: 'Existing criteria',
            figma_link: null,
            edge_cases: 'Edge case',
            technical_guidelines: 'Guideline',
          },
        }}
        releases={[]}
        storyMapId="map-1"
        storyMapName="Core Platform"
        onSave={vi.fn()}
        onDelete={onDelete}
      />,
    );

    expect(screen.getByDisplayValue('Existing story')).toBeTruthy();
    expect(screen.getByDisplayValue('Existing user story')).toBeTruthy();
    expect(screen.getAllByRole('button', { name: 'Copy Agent Prompt' }).length).toBeGreaterThan(0);

    await user.click(screen.getByRole('button', { name: 'Delete Story' }));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
