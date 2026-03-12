'use client';

import { reorderItems } from '@beemspec/storymap';
import {
  DndContext,
  type DragEndEvent,
  type DragOverEvent,
  DragOverlay,
  type DragStartEvent,
  PointerSensor,
  rectIntersection,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  horizontalListSortingStrategy,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { ArrowDown, ArrowUp, Pencil, Plus } from 'lucide-react';
import { useState } from 'react';
import { AddButton } from '@/components/story-map/AddButton';
import { ADD_BUTTON_WIDTH, CARD_GAP, CARD_HEIGHT, CARD_WIDTH, GROUP_GAP } from '@/components/story-map/constants';
import { MapCard } from '@/components/story-map/MapCard';
import { STATUS_LABELS, STATUS_VARIANTS } from '@/components/story-map/story-status';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DeleteButton } from '@/components/ui/delete-button';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { assertNever, errorMessage } from '@/lib/errors';
import { fetchJson } from '@/lib/http';
import type { Activity, Story, StoryMapFull, Task, TaskWithStories } from '@/types';

/**
 * Type-safe drag ID system using discriminated unions
 * Replaces error-prone string parsing with proper types
 */
type DragId =
  | { type: 'activity'; id: string }
  | { type: 'task'; id: string }
  | { type: 'story'; id: string }
  | { type: 'task-end'; activityId: string }
  | { type: 'story-end'; taskId: string; releaseId: string | null };

const BACKLOG_MARKER = 'backlog' as const;

function encodeDragId(dragId: DragId): string {
  switch (dragId.type) {
    case 'activity':
      return `activity:${dragId.id}`;
    case 'task':
      return `task:${dragId.id}`;
    case 'story':
      return `story:${dragId.id}`;
    case 'task-end':
      return `task-end:${dragId.activityId}`;
    case 'story-end':
      return `story-end:${dragId.taskId}:${dragId.releaseId ?? BACKLOG_MARKER}`;
    default:
      assertNever(dragId);
  }
}

function parseDragId(encoded: string): DragId | null {
  const parts = encoded.split(':');
  const type = parts[0];

  switch (type) {
    case 'activity':
      return parts[1] ? { type: 'activity', id: parts[1] } : null;
    case 'task':
      return parts[1] ? { type: 'task', id: parts[1] } : null;
    case 'story':
      return parts[1] ? { type: 'story', id: parts[1] } : null;
    case 'task-end':
      return parts[1] ? { type: 'task-end', activityId: parts[1] } : null;
    case 'story-end': {
      const taskId = parts[1];
      const releaseMarker = parts[2];
      if (!taskId || !releaseMarker) return null;
      return {
        type: 'story-end',
        taskId,
        releaseId: releaseMarker === BACKLOG_MARKER ? null : releaseMarker,
      };
    }
    default:
      return null;
  }
}

interface Props {
  storyMap: StoryMapFull;
  onAddStory: (taskId: string, releaseId: string | null) => void;
  onEditStory: (story: Story) => void;
  onAddActivity: () => void;
  onEditActivity: (activity: Activity) => void;
  onAddTask: (activityId: string) => void;
  onEditTask: (task: Task) => void;
  onAddRelease: () => void;
  onRenameRelease: (releaseId: string, currentName: string) => void;
  onMoveRelease: (releaseId: string, direction: 'up' | 'down') => void;
  onDeleteRelease: (releaseId: string) => void;
  onRefresh: () => void;
  onError?: (message: string) => void;
}

function getGroupWidth(taskCount: number): number {
  // Ensure minimum width of 1 card space even when no tasks exist
  return Math.max(taskCount, 1) * (CARD_WIDTH + CARD_GAP) + ADD_BUTTON_WIDTH;
}

function DropLine({ direction }: { direction: 'vertical' | 'horizontal' }) {
  if (direction === 'vertical') {
    return <div className="w-0.5 h-full bg-primary min-h-[96px]" />;
  }
  return <div className="h-0.5 w-full bg-primary" />;
}

export function StoryMapCanvas({
  storyMap,
  onAddStory,
  onEditStory,
  onAddActivity,
  onEditActivity,
  onAddTask,
  onEditTask,
  onAddRelease,
  onRenameRelease,
  onMoveRelease,
  onDeleteRelease,
  onRefresh,
  onError,
}: Props) {
  const { activities, releases } = storyMap;
  const [activeDrag, setActiveDrag] = useState<DragId | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const [dragError, setDragError] = useState<string | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  const sortedActivities = [...activities].sort((a, b) => a.sort_order - b.sort_order);

  const allTasksOrdered: (TaskWithStories & { activityId: string })[] = [];
  for (const activity of sortedActivities) {
    const tasks = [...(activity.tasks || [])].sort((a, b) => a.sort_order - b.sort_order);
    for (const task of tasks) {
      allTasksOrdered.push({ ...task, activityId: activity.id });
    }
  }

  const allStories = allTasksOrdered.flatMap((t) => t.stories);
  const sortedStories = [...allStories].sort((a, b) => a.sort_order - b.sort_order);

  function getTasksForActivity(activityId: string) {
    return allTasksOrdered.filter((t) => t.activityId === activityId);
  }

  function getStoriesForCell(taskId: string, releaseId: string | null): Story[] {
    return sortedStories.filter(
      (s) => s.task_id === taskId && (releaseId ? s.release_id === releaseId : !s.release_id),
    );
  }

  function handleDragStart(event: DragStartEvent) {
    const parsed = parseDragId(String(event.active.id));
    setActiveDrag(parsed);
    setDragError(null);
  }

  function handleDragOver(event: DragOverEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) {
      setDropTargetId(null);
      return;
    }
    setDropTargetId(String(over.id));
  }

  async function performRequest(url: string, init: RequestInit, fallbackMessage: string): Promise<void> {
    await fetchJson(url, init, fallbackMessage);
  }

  async function persistDragChange(url: string, body: unknown, fallbackMessage: string): Promise<void> {
    await performRequest(
      url,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      },
      fallbackMessage,
    );

    setDragError(null);
    onRefresh();
  }

  async function handleActivityDrop(activeActivityId: string, overActivityId: string): Promise<void> {
    const newOrder = reorderItems(
      sortedActivities.map((activity) => activity.id),
      activeActivityId,
      overActivityId,
    );

    await persistDragChange(
      '/api/activities',
      { story_map_id: storyMap.id, order: newOrder },
      'Failed to reorder activities',
    );
  }

  async function handleTaskDrop(
    activeTaskId: string,
    overTarget: Extract<DragId, { type: 'task' | 'task-end' }>,
  ): Promise<void> {
    const targetActivityId =
      overTarget.type === 'task'
        ? allTasksOrdered.find((task) => task.id === overTarget.id)?.activityId
        : overTarget.activityId;
    if (!targetActivityId) return;

    const newOrder = reorderItems(
      getTasksForActivity(targetActivityId).map((task) => task.id),
      activeTaskId,
      overTarget.type === 'task' ? overTarget.id : undefined,
    );

    await persistDragChange(
      `/api/tasks/${activeTaskId}/move`,
      { target_activity_id: targetActivityId, target_order: newOrder },
      'Failed to move task',
    );
  }

  async function handleStoryDrop(
    activeStoryId: string,
    overTarget: Extract<DragId, { type: 'story' | 'story-end' }>,
  ): Promise<void> {
    const targetCell =
      overTarget.type === 'story'
        ? sortedStories.find((story) => story.id === overTarget.id)
        : { task_id: overTarget.taskId, release_id: overTarget.releaseId };
    if (!targetCell) return;

    const newOrder = reorderItems(
      getStoriesForCell(targetCell.task_id, targetCell.release_id).map((story) => story.id),
      activeStoryId,
      overTarget.type === 'story' ? overTarget.id : undefined,
    );

    await persistDragChange(
      `/api/stories/${activeStoryId}/move`,
      {
        target_task_id: targetCell.task_id,
        target_release_id: targetCell.release_id,
        target_order: newOrder,
      },
      'Failed to move story',
    );
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveDrag(null);
    setDropTargetId(null);
    if (!over) return;

    const activeId = String(active.id);
    const overId = String(over.id);
    if (activeId === overId) return;

    const activeParsed = parseDragId(activeId);
    const overParsed = parseDragId(overId);
    if (!activeParsed || !overParsed) return;

    try {
      if (activeParsed.type === 'activity' && overParsed.type === 'activity') {
        await handleActivityDrop(activeParsed.id, overParsed.id);
        return;
      }

      if (activeParsed.type === 'task' && (overParsed.type === 'task' || overParsed.type === 'task-end')) {
        await handleTaskDrop(activeParsed.id, overParsed);
        return;
      }

      if (activeParsed.type === 'story' && (overParsed.type === 'story' || overParsed.type === 'story-end')) {
        await handleStoryDrop(activeParsed.id, overParsed);
        return;
      }
    } catch (err) {
      const message = errorMessage(err);
      setDragError(message);
      onError?.(message);
      onRefresh();
    }
  }

  // Derive dragged item from state - no string parsing needed
  const draggedActivity = activeDrag?.type === 'activity' ? activities.find((a) => a.id === activeDrag.id) : null;
  const draggedTask = activeDrag?.type === 'task' ? allTasksOrdered.find((t) => t.id === activeDrag.id) : null;
  const draggedStory = activeDrag?.type === 'story' ? allStories.find((s) => s.id === activeDrag.id) : null;

  function isDropTarget(itemId: string): boolean {
    return dropTargetId === itemId;
  }

  if (activities.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
        <p className="mb-4">Add an activity to get started.</p>
        <Button variant="outline" onClick={onAddActivity}>
          <Plus className="mr-2 h-4 w-4" />
          Add Activity
        </Button>
      </div>
    );
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={rectIntersection}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
      <div className="inline-flex flex-col">
        {dragError && (
          <div className="mb-3 flex items-center justify-between rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            <span>{dragError}</span>
            <Button size="sm" variant="ghost" onClick={() => setDragError(null)}>
              Dismiss
            </Button>
          </div>
        )}
        {/* Activities Row */}
        <SortableContext
          items={sortedActivities.map((a) => encodeDragId({ type: 'activity', id: a.id }))}
          strategy={horizontalListSortingStrategy}
        >
          <div className="flex" style={{ gap: GROUP_GAP }}>
            {sortedActivities.map((activity) => {
              const tasks = getTasksForActivity(activity.id);

              return (
                <div key={activity.id} className="flex justify-between" style={{ width: getGroupWidth(tasks.length) }}>
                  <SortableActivity
                    activity={activity}
                    onClick={() => onEditActivity(activity)}
                    showIndicator={isDropTarget(encodeDragId({ type: 'activity', id: activity.id }))}
                  />
                  <AddButton
                    label="Activity"
                    orientation="vertical"
                    style={{ width: ADD_BUTTON_WIDTH, height: CARD_HEIGHT }}
                    onClick={onAddActivity}
                  />
                </div>
              );
            })}
          </div>
        </SortableContext>

        {/* Tasks Row */}
        <SortableContext
          items={allTasksOrdered.map((t) => encodeDragId({ type: 'task', id: t.id }))}
          strategy={horizontalListSortingStrategy}
        >
          <div className="flex mt-2" style={{ gap: GROUP_GAP }}>
            {sortedActivities.map((activity) => {
              const tasks = getTasksForActivity(activity.id);

              return (
                <div key={activity.id} className="flex" style={{ width: getGroupWidth(tasks.length), gap: CARD_GAP }}>
                  {tasks.map((task) => (
                    <SortableTask
                      key={task.id}
                      task={task}
                      onClick={() => onEditTask(task)}
                      showIndicator={isDropTarget(encodeDragId({ type: 'task', id: task.id }))}
                    />
                  ))}
                  <AddTaskDropZone
                    activityId={activity.id}
                    onAddTask={onAddTask}
                    showIndicator={isDropTarget(encodeDragId({ type: 'task-end', activityId: activity.id }))}
                  />
                </div>
              );
            })}
          </div>
        </SortableContext>

        {/* Release Rows */}
        <SortableContext
          items={sortedStories.map((s) => encodeDragId({ type: 'story', id: s.id }))}
          strategy={verticalListSortingStrategy}
        >
          <div className="mt-6 space-y-2">
            {[...releases]
              .sort((a, b) => a.sort_order - b.sort_order)
              .map((release, index, arr) => (
                <div key={release.id}>
                  <ReleaseRow
                    label={release.name}
                    releaseId={release.id}
                    activities={sortedActivities}
                    getTasksForActivity={getTasksForActivity}
                    getStoriesForCell={getStoriesForCell}
                    onAddStory={onAddStory}
                    onEditStory={onEditStory}
                    onRename={() => onRenameRelease(release.id, release.name)}
                    onMoveUp={() => onMoveRelease(release.id, 'up')}
                    onMoveDown={() => onMoveRelease(release.id, 'down')}
                    onDelete={() => onDeleteRelease(release.id)}
                    isFirst={index === 0}
                    isLast={index === arr.length - 1}
                    isDropTarget={isDropTarget}
                  />
                  <AddReleaseZone onAddRelease={onAddRelease} />
                </div>
              ))}

            {releases.length === 0 && <AddReleaseZone onAddRelease={onAddRelease} alwaysVisible />}

            <ReleaseRow
              label="Backlog"
              labelMuted
              releaseId={null}
              activities={sortedActivities}
              getTasksForActivity={getTasksForActivity}
              getStoriesForCell={getStoriesForCell}
              onAddStory={onAddStory}
              onEditStory={onEditStory}
              isDropTarget={isDropTarget}
            />
          </div>
        </SortableContext>
      </div>

      <DragOverlay>
        {draggedActivity && (
          <MapCard variant="activity" className="shadow-lg cursor-grabbing">
            <div className="font-medium text-sm line-clamp-3">{draggedActivity.name}</div>
          </MapCard>
        )}
        {draggedTask && (
          <MapCard variant="task" className="shadow-lg cursor-grabbing">
            <div className="text-sm line-clamp-3">{draggedTask.name}</div>
          </MapCard>
        )}
        {draggedStory && (
          <MapCard variant="story" className="shadow-lg cursor-grabbing">
            <div className="text-xs line-clamp-3">{draggedStory.title}</div>
            {draggedStory.status !== 'backlog' && (
              <Badge variant={STATUS_VARIANTS[draggedStory.status]} className="mt-auto text-[10px] self-start">
                {STATUS_LABELS[draggedStory.status]}
              </Badge>
            )}
          </MapCard>
        )}
      </DragOverlay>
    </DndContext>
  );
}

function AddTaskDropZone({
  activityId,
  onAddTask,
  showIndicator,
}: {
  activityId: string;
  onAddTask: (activityId: string) => void;
  showIndicator: boolean;
}) {
  const { setNodeRef } = useDroppable({
    id: encodeDragId({ type: 'task-end', activityId }),
  });

  return (
    <div className="flex gap-1">
      {showIndicator && <DropLine direction="vertical" />}
      <AddButton
        ref={setNodeRef}
        label="Task"
        orientation="vertical"
        style={{ width: ADD_BUTTON_WIDTH, height: CARD_HEIGHT }}
        onClick={() => onAddTask(activityId)}
      />
    </div>
  );
}

function SortableActivity({
  activity,
  onClick,
  showIndicator,
}: {
  activity: Activity;
  onClick: () => void;
  showIndicator: boolean;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useSortable({
    id: encodeDragId({ type: 'activity', id: activity.id }),
  });

  return (
    <div className="flex items-stretch gap-1">
      {showIndicator && <DropLine direction="vertical" />}
      <MapCard
        ref={setNodeRef}
        variant="activity"
        isDragging={isDragging}
        {...attributes}
        {...listeners}
        onClick={() => {
          if (!isDragging) onClick();
        }}
      >
        <div className="font-medium text-sm line-clamp-3">{activity.name}</div>
      </MapCard>
    </div>
  );
}

function SortableTask({ task, onClick, showIndicator }: { task: Task; onClick: () => void; showIndicator: boolean }) {
  const { attributes, listeners, setNodeRef, isDragging } = useSortable({
    id: encodeDragId({ type: 'task', id: task.id }),
  });

  return (
    <div className="flex items-stretch gap-1">
      {showIndicator && <DropLine direction="vertical" />}
      <MapCard
        ref={setNodeRef}
        variant="task"
        isDragging={isDragging}
        {...attributes}
        {...listeners}
        onClick={() => {
          if (!isDragging) onClick();
        }}
      >
        <div className="text-sm line-clamp-3">{task.name}</div>
      </MapCard>
    </div>
  );
}

interface ReleaseRowProps {
  label: string;
  labelMuted?: boolean;
  releaseId: string | null;
  activities: Activity[];
  getTasksForActivity: (activityId: string) => (TaskWithStories & { activityId: string })[];
  getStoriesForCell: (taskId: string, releaseId: string | null) => Story[];
  onAddStory: (taskId: string, releaseId: string | null) => void;
  onEditStory: (story: Story) => void;
  onRename?: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  onDelete?: () => void;
  isFirst?: boolean;
  isLast?: boolean;
  isDropTarget: (itemId: string) => boolean;
}

function AddReleaseZone({ onAddRelease, alwaysVisible }: { onAddRelease: () => void; alwaysVisible?: boolean }) {
  return (
    <div className="group/addzone h-6 mt-4 relative">
      <AddButton
        label="Release"
        className={`absolute inset-x-0 top-0 h-8 transition-opacity px-3 bg-background z-10 justify-start ${
          alwaysVisible ? '' : 'opacity-100 sm:opacity-0 sm:group-hover/addzone:opacity-100'
        }`}
        onClick={onAddRelease}
      />
    </div>
  );
}

function ReleaseRow({
  label,
  labelMuted,
  releaseId,
  activities,
  getTasksForActivity,
  getStoriesForCell,
  onAddStory,
  onEditStory,
  onRename,
  onMoveUp,
  onMoveDown,
  onDelete,
  isFirst,
  isLast,
  isDropTarget,
}: ReleaseRowProps) {
  const showActions = releaseId !== null;

  return (
    <div className="pt-4">
      <Separator className="mb-4" />
      <div className="group flex items-center gap-2 mb-3">
        <div className={`text-sm font-medium ${labelMuted ? 'text-muted-foreground' : ''}`}>{label}</div>
        {showActions && (
          <div className="flex items-center gap-0.5 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="h-5 w-5 cursor-pointer" onClick={onRename}>
                  <Pencil className="h-3 w-3" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Rename</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-5 w-5 cursor-pointer"
                  onClick={onMoveUp}
                  disabled={isFirst}
                >
                  <ArrowUp className="h-3 w-3" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Move up</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-5 w-5 cursor-pointer"
                  onClick={onMoveDown}
                  disabled={isLast}
                >
                  <ArrowDown className="h-3 w-3" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Move down</TooltipContent>
            </Tooltip>
            {onDelete && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <DeleteButton
                    onDelete={onDelete}
                    iconOnly
                    confirmTitle="Delete release?"
                    confirmDescription="All stories in this release will be permanently deleted."
                  />
                </TooltipTrigger>
                <TooltipContent>Delete</TooltipContent>
              </Tooltip>
            )}
          </div>
        )}
      </div>
      <div className="flex items-start" style={{ gap: GROUP_GAP }}>
        {activities.map((activity) => {
          const tasks = getTasksForActivity(activity.id);

          return (
            <div key={activity.id} className="flex" style={{ width: getGroupWidth(tasks.length), gap: CARD_GAP }}>
              {tasks.map((task) => (
                <StoryCell
                  key={task.id}
                  taskId={task.id}
                  releaseId={releaseId}
                  stories={getStoriesForCell(task.id, releaseId)}
                  onAddStory={onAddStory}
                  onEditStory={onEditStory}
                  isDropTarget={isDropTarget}
                />
              ))}
              <div style={{ width: ADD_BUTTON_WIDTH }} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function StoryCell({
  taskId,
  releaseId,
  stories,
  onAddStory,
  onEditStory,
  isDropTarget,
}: {
  taskId: string;
  releaseId: string | null;
  stories: Story[];
  onAddStory: (taskId: string, releaseId: string | null) => void;
  onEditStory: (story: Story) => void;
  isDropTarget: (itemId: string) => boolean;
}) {
  return (
    <div className="flex flex-col gap-2 min-h-[40px]" style={{ width: CARD_WIDTH }}>
      {stories.map((story) => (
        <SortableStory
          key={story.id}
          story={story}
          onClick={() => onEditStory(story)}
          showIndicator={isDropTarget(encodeDragId({ type: 'story', id: story.id }))}
        />
      ))}
      <AddStoryDropZone
        taskId={taskId}
        releaseId={releaseId}
        onAddStory={onAddStory}
        showIndicator={isDropTarget(encodeDragId({ type: 'story-end', taskId, releaseId }))}
      />
    </div>
  );
}

function AddStoryDropZone({
  taskId,
  releaseId,
  onAddStory,
  showIndicator,
}: {
  taskId: string;
  releaseId: string | null;
  onAddStory: (taskId: string, releaseId: string | null) => void;
  showIndicator: boolean;
}) {
  const { setNodeRef } = useDroppable({
    id: encodeDragId({ type: 'story-end', taskId, releaseId }),
  });

  return (
    <div className="flex flex-col gap-1">
      {showIndicator && <DropLine direction="horizontal" />}
      <AddButton ref={setNodeRef} label="Story" className="w-full h-8" onClick={() => onAddStory(taskId, releaseId)} />
    </div>
  );
}

function SortableStory({
  story,
  onClick,
  showIndicator,
}: {
  story: Story;
  onClick: () => void;
  showIndicator: boolean;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useSortable({
    id: encodeDragId({ type: 'story', id: story.id }),
  });

  return (
    <div className="flex flex-col gap-1">
      {showIndicator && <DropLine direction="horizontal" />}
      <MapCard
        ref={setNodeRef}
        variant="story"
        isDragging={isDragging}
        {...attributes}
        {...listeners}
        onClick={() => {
          if (!isDragging) onClick();
        }}
      >
        <div className="text-xs line-clamp-3">{story.title}</div>
        {story.status !== 'backlog' && (
          <Badge variant={STATUS_VARIANTS[story.status]} className="mt-auto text-[10px] self-start">
            {STATUS_LABELS[story.status]}
          </Badge>
        )}
      </MapCard>
    </div>
  );
}
