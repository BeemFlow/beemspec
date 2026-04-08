/* @vitest-environment jsdom */

import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { StoryMapFull } from '@/types';
import { StoryMapCanvas } from './StoryMapCanvas';

const { dndCallbacks, fetchJsonMock } = vi.hoisted(() => ({
  dndCallbacks: {
    onDragEnd: null as null | ((event: { active: { id: string }; over: { id: string } | null }) => Promise<void>),
  },
  fetchJsonMock: vi.fn(),
}));

vi.mock('@/lib/http', () => ({ fetchJson: fetchJsonMock }));

vi.mock('@dnd-kit/core', () => ({
  DndContext: ({ children, onDragEnd }: { children: React.ReactNode; onDragEnd: typeof dndCallbacks.onDragEnd }) => {
    dndCallbacks.onDragEnd = onDragEnd;
    return <div>{children}</div>;
  },
  DragOverlay: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  PointerSensor: class {},
  rectIntersection: () => null,
  useDroppable: () => ({ setNodeRef: () => {} }),
  useSensor: () => ({}),
  useSensors: () => [],
}));

vi.mock('@dnd-kit/sortable', () => ({
  SortableContext: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  horizontalListSortingStrategy: {},
  verticalListSortingStrategy: {},
  useSortable: () => ({ attributes: {}, listeners: {}, setNodeRef: () => {}, isDragging: false }),
}));

vi.mock('@/components/story-map/AgentKickoffButton', () => ({
  AgentKickoffButton: () => null,
  buildReleaseKickoffPrompt: () => 'prompt',
}));

function createStoryMap(): StoryMapFull {
  return {
    id: 'map-1',
    name: 'Core Platform',
    description: null,
    context_markdown: null,
    activities: [
      {
        id: 'activity-1',
        story_map_id: 'map-1',
        name: 'Finance intake',
        description: null,
        sort_order: 0,
        tasks: [
          {
            id: 'task-1',
            activity_id: 'activity-1',
            name: 'Invoice submission',
            description: null,
            sort_order: 0,
            stories: [
              {
                id: 'story-1',
                task_id: 'task-1',
                release_id: 'release-1',
                title: 'Customer can submit invoice',
                status: 'todo',
                content: { _version: 1, user_story: 'As a user...', acceptance_criteria: '- [ ] Works' },
                sort_order: 0,
              },
            ],
          },
        ],
      },
    ],
    releases: [
      {
        id: 'release-1',
        story_map_id: 'map-1',
        name: 'Release 1',
        description: null,
        context_markdown: null,
        sort_order: 0,
      },
    ],
  };
}

function createStoryMapWithMovableItems(): StoryMapFull {
  return {
    id: 'map-1',
    name: 'Core Platform',
    description: null,
    context_markdown: null,
    activities: [
      {
        id: 'activity-1',
        story_map_id: 'map-1',
        name: 'Finance intake',
        description: null,
        sort_order: 0,
        tasks: [
          {
            id: 'task-1',
            activity_id: 'activity-1',
            name: 'Invoice submission',
            description: null,
            sort_order: 0,
            stories: [
              {
                id: 'story-1',
                task_id: 'task-1',
                release_id: 'release-1',
                title: 'Customer can submit invoice',
                status: 'todo',
                content: { _version: 1, user_story: 'As a user...', acceptance_criteria: '- [ ] Works' },
                sort_order: 0,
              },
              {
                id: 'story-2',
                task_id: 'task-1',
                release_id: null,
                title: 'Backlog story',
                status: 'backlog',
                content: { _version: 1, user_story: 'As a user...', acceptance_criteria: '- [ ] Works' },
                sort_order: 0,
              },
            ],
          },
        ],
      },
      {
        id: 'activity-2',
        story_map_id: 'map-1',
        name: 'Review',
        description: null,
        sort_order: 1,
        tasks: [
          {
            id: 'task-2',
            activity_id: 'activity-2',
            name: 'Manager review',
            description: null,
            sort_order: 0,
            stories: [
              {
                id: 'story-3',
                task_id: 'task-2',
                release_id: 'release-1',
                title: 'Manager approves invoice',
                status: 'in_review',
                content: { _version: 1, user_story: 'As a manager...', acceptance_criteria: '- [ ] Approves' },
                sort_order: 0,
              },
            ],
          },
        ],
      },
    ],
    releases: [
      {
        id: 'release-1',
        story_map_id: 'map-1',
        name: 'Release 1',
        description: null,
        context_markdown: null,
        sort_order: 0,
      },
      {
        id: 'release-2',
        story_map_id: 'map-1',
        name: 'Release 2',
        description: null,
        context_markdown: null,
        sort_order: 1,
      },
    ],
  };
}

function StoryMapHarness({ storyMap }: { storyMap: StoryMapFull }) {
  const [currentStoryMap, setCurrentStoryMap] = useState<StoryMapFull | null>(storyMap);

  return (
    <>
      <StoryMapCanvas
        storyMap={currentStoryMap as StoryMapFull}
        storyMapName="Core Platform"
        onAddStory={vi.fn()}
        onEditStory={vi.fn()}
        onAddActivity={vi.fn()}
        onEditActivity={vi.fn()}
        onAddTask={vi.fn()}
        onEditTask={vi.fn()}
        onAddRelease={vi.fn()}
        onRenameRelease={vi.fn()}
        onMoveRelease={vi.fn()}
        onDeleteRelease={vi.fn()}
        onStoryMapChange={setCurrentStoryMap}
      />
      <pre data-testid="storymap-state">{JSON.stringify(currentStoryMap)}</pre>
    </>
  );
}

describe('StoryMapCanvas', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dndCallbacks.onDragEnd = null;
  });

  afterEach(() => {
    cleanup();
  });

  it('shows the empty state and lets the user start by adding an activity', async () => {
    const user = userEvent.setup();
    const onAddActivity = vi.fn();

    render(
      <StoryMapCanvas
        storyMap={{ ...createStoryMap(), activities: [], releases: [] }}
        storyMapName="Core Platform"
        onAddStory={vi.fn()}
        onEditStory={vi.fn()}
        onAddActivity={onAddActivity}
        onEditActivity={vi.fn()}
        onAddTask={vi.fn()}
        onEditTask={vi.fn()}
        onAddRelease={vi.fn()}
        onRenameRelease={vi.fn()}
        onMoveRelease={vi.fn()}
        onDeleteRelease={vi.fn()}
        onStoryMapChange={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Add Activity' }));
    expect(onAddActivity).toHaveBeenCalledTimes(1);
  });

  it('supports release collapse and add buttons for user-facing story map controls', async () => {
    const user = userEvent.setup();
    const onAddStory = vi.fn();
    const onAddTask = vi.fn();
    const onAddRelease = vi.fn();

    render(
      <StoryMapCanvas
        storyMap={createStoryMap()}
        storyMapName="Core Platform"
        onAddStory={onAddStory}
        onEditStory={vi.fn()}
        onAddActivity={vi.fn()}
        onEditActivity={vi.fn()}
        onAddTask={onAddTask}
        onEditTask={vi.fn()}
        onAddRelease={onAddRelease}
        onRenameRelease={vi.fn()}
        onMoveRelease={vi.fn()}
        onDeleteRelease={vi.fn()}
        onEditReleaseContext={vi.fn()}
        onStoryMapChange={vi.fn()}
      />,
    );

    expect(screen.getByText('Customer can submit invoice')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Collapse release' }));
    expect(screen.queryByText('Customer can submit invoice')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Expand release' }));
    expect(screen.getByText('Customer can submit invoice')).toBeTruthy();

    await user.click(screen.getAllByRole('button', { name: /Story/i })[0]);
    await user.click(screen.getAllByRole('button', { name: /Task/i })[0]);
    await user.click(screen.getAllByRole('button', { name: /^Release$/i })[0]);

    expect(onAddStory).toHaveBeenCalledWith('task-1', 'release-1');
    expect(onAddTask).toHaveBeenCalledWith('activity-1');
    expect(onAddRelease).toHaveBeenCalledTimes(1);
  });

  it('shows a drag error and rolls back optimistic state when move persistence fails', async () => {
    fetchJsonMock.mockRejectedValue(new Error('Failed to move story'));
    const onError = vi.fn();
    const onStoryMapChange = vi.fn();

    render(
      <StoryMapCanvas
        storyMap={createStoryMap()}
        storyMapName="Core Platform"
        onAddStory={vi.fn()}
        onEditStory={vi.fn()}
        onAddActivity={vi.fn()}
        onEditActivity={vi.fn()}
        onAddTask={vi.fn()}
        onEditTask={vi.fn()}
        onAddRelease={vi.fn()}
        onRenameRelease={vi.fn()}
        onMoveRelease={vi.fn()}
        onDeleteRelease={vi.fn()}
        onStoryMapChange={onStoryMapChange}
        onError={onError}
      />,
    );

    await act(async () => {
      await dndCallbacks.onDragEnd?.({
        active: { id: 'story:story-1' },
        over: { id: 'story-end:task-1:backlog' },
      });
    });

    expect(fetchJsonMock).toHaveBeenCalledWith(
      '/api/stories/story-1/move',
      expect.objectContaining({ method: 'PUT' }),
      'Failed to move story',
    );
    expect(onStoryMapChange).toHaveBeenCalledTimes(2);
    expect(onError).toHaveBeenCalledWith('Failed to move story');
    expect(screen.getByText('Failed to move story')).toBeTruthy();
  });

  it('moves a story across tasks and releases on successful persistence', async () => {
    fetchJsonMock.mockResolvedValue({ success: true });

    render(<StoryMapHarness storyMap={createStoryMapWithMovableItems()} />);

    await act(async () => {
      await dndCallbacks.onDragEnd?.({
        active: { id: 'story:story-1' },
        over: { id: 'story-end:task-2:release-2' },
      });
    });

    expect(fetchJsonMock).toHaveBeenCalledWith(
      '/api/stories/story-1/move',
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({
          target_task_id: 'task-2',
          target_release_id: 'release-2',
          target_order: ['story-1'],
        }),
      }),
      'Failed to move story',
    );

    const state = JSON.parse(screen.getByTestId('storymap-state').textContent ?? '{}');
    const sourceTaskStories = state.activities[0].tasks[0].stories.map((story: { id: string }) => story.id);
    const targetTaskStories = state.activities[1].tasks[0].stories.map(
      (story: { id: string; release_id: string | null }) => ({
        id: story.id,
        release_id: story.release_id,
      }),
    );

    expect(sourceTaskStories).toEqual(['story-2']);
    expect(targetTaskStories).toEqual([
      { id: 'story-3', release_id: 'release-1' },
      { id: 'story-1', release_id: 'release-2' },
    ]);
  });

  it('moves a task into a different activity on successful persistence', async () => {
    fetchJsonMock.mockResolvedValue({ success: true });

    render(<StoryMapHarness storyMap={createStoryMapWithMovableItems()} />);

    await act(async () => {
      await dndCallbacks.onDragEnd?.({
        active: { id: 'task:task-1' },
        over: { id: 'task-end:activity-2' },
      });
    });

    expect(fetchJsonMock).toHaveBeenCalledWith(
      '/api/tasks/task-1/move',
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({
          target_activity_id: 'activity-2',
          target_order: ['task-2', 'task-1'],
        }),
      }),
      'Failed to move task',
    );

    const state = JSON.parse(screen.getByTestId('storymap-state').textContent ?? '{}');
    expect(state.activities[0].tasks).toEqual([]);
    expect(
      state.activities[1].tasks.map((task: { id: string; activity_id: string; sort_order: number }) => task),
    ).toEqual([
      expect.objectContaining({ id: 'task-2', activity_id: 'activity-2', sort_order: 0 }),
      expect.objectContaining({ id: 'task-1', activity_id: 'activity-2', sort_order: 1 }),
    ]);
  });
});
