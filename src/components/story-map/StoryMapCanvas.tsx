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
import { ArrowDown, ArrowUp, ChevronDown, ChevronRight, FileText, Pencil, Plus } from 'lucide-react';
import { useId, useMemo, useState } from 'react';
import { AddButton } from '@/components/story-map/AddButton';
import { AgentKickoffButton, buildReleaseKickoffPrompt } from '@/components/story-map/AgentKickoffButton';
import { ADD_BUTTON_WIDTH, CARD_GAP, CARD_HEIGHT, CARD_WIDTH, GROUP_GAP } from '@/components/story-map/constants';
import { MapCard } from '@/components/story-map/MapCard';
import {
  buildStoryMapIndex,
  type DragId,
  encodeDragId,
  moveStoryInStoryMap,
  moveTaskInStoryMap,
  parseDragId,
  reorderActivitiesInStoryMap,
} from '@/components/story-map/model';
import { STATUS_CLASS, STATUS_LABELS, STATUS_VARIANTS } from '@/components/story-map/story-status';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DeleteButton } from '@/components/ui/delete-button';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { errorMessage } from '@/lib/errors';
import { fetchJson } from '@/lib/http';
import type { Activity, Story, StoryMapFull, Task, TaskWithStories } from '@/types';

interface Props {
  storyMap: StoryMapFull;
  storyMapName: string;
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
  onEditReleaseContext?: (releaseId: string) => void;
  onError?: (message: string) => void;
  onStoryMapChange: React.Dispatch<React.SetStateAction<StoryMapFull | null>>;
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
  storyMapName,
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
  onEditReleaseContext,
  onError,
  onStoryMapChange,
}: Props) {
  const { releases } = storyMap;
  const [activeDrag, setActiveDrag] = useState<DragId | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const [dragError, setDragError] = useState<string | null>(null);
  const [collapsedReleases, setCollapsedReleases] = useState<Set<string>>(new Set());
  const dndContextId = useId();

  function toggleRelease(releaseId: string) {
    setCollapsedReleases((prev) => {
      const next = new Set(prev);
      if (next.has(releaseId)) {
        next.delete(releaseId);
      } else {
        next.add(releaseId);
      }
      return next;
    });
  }

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  const { sortedActivities, allTasksOrdered, sortedStories, getTasksForActivity, getStoriesForCell } = useMemo(
    () => buildStoryMapIndex(storyMap),
    [storyMap],
  );

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

  async function persistDragChange(
    optimisticStoryMap: StoryMapFull,
    url: string,
    body: unknown,
    fallbackMessage: string,
  ): Promise<void> {
    const previousStoryMap = storyMap;
    onStoryMapChange(optimisticStoryMap);

    try {
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
    } catch (error) {
      onStoryMapChange(previousStoryMap);
      throw error;
    }
  }

  async function handleActivityDrop(
    activeActivityId: string,
    overTarget: Extract<DragId, { type: 'activity' | 'activity-end' }>,
  ): Promise<void> {
    const targetId =
      overTarget.type === 'activity'
        ? overTarget.id
        : sortedActivities[sortedActivities.findIndex((activity) => activity.id === overTarget.afterActivityId) + 1]
            ?.id;

    const newOrder = reorderItems(
      sortedActivities.map((activity) => activity.id),
      activeActivityId,
      targetId,
    );

    await persistDragChange(
      reorderActivitiesInStoryMap(storyMap, newOrder),
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
      moveTaskInStoryMap(storyMap, activeTaskId, targetActivityId, newOrder),
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
      moveStoryInStoryMap(storyMap, activeStoryId, targetCell.task_id, targetCell.release_id, newOrder),
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
      if (activeParsed.type === 'activity' && (overParsed.type === 'activity' || overParsed.type === 'activity-end')) {
        await handleActivityDrop(activeParsed.id, overParsed);
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
    }
  }

  // Derive dragged item from state - no string parsing needed
  const draggedActivity =
    activeDrag?.type === 'activity' ? sortedActivities.find((activity) => activity.id === activeDrag.id) : null;
  const draggedTask = activeDrag?.type === 'task' ? allTasksOrdered.find((t) => t.id === activeDrag.id) : null;
  const draggedStory = activeDrag?.type === 'story' ? sortedStories.find((story) => story.id === activeDrag.id) : null;

  function isDropTarget(itemId: string): boolean {
    return dropTargetId === itemId;
  }

  return (
    <DndContext
      id={dndContextId}
      sensors={sensors}
      collisionDetection={rectIntersection}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
      <div className="inline-flex min-w-full flex-col px-4">
        {sortedActivities.length === 0 && (
          <div className="mb-6 flex flex-col items-center justify-center py-12 text-muted-foreground">
            <p className="mb-4">Add an activity to get started.</p>
            <Button variant="outline" onClick={onAddActivity}>
              <Plus className="mr-2 h-4 w-4" />
              Add Activity
            </Button>
          </div>
        )}
        {dragError && (
          <div className="mb-3 flex items-center justify-between rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            <span>{dragError}</span>
            <Button size="sm" variant="ghost" onClick={() => setDragError(null)}>
              Dismiss
            </Button>
          </div>
        )}
        {/* Backbone: Activities + Tasks — sticky so it stays visible while releases scroll */}
        <div className="sticky top-0 z-10 bg-background pt-4">
          {/* Activities Row */}
          <SortableContext
            items={sortedActivities.map((a) => encodeDragId({ type: 'activity', id: a.id }))}
            strategy={horizontalListSortingStrategy}
          >
            <div className="flex" style={{ gap: GROUP_GAP }}>
              {sortedActivities.map((activity) => {
                const tasks = getTasksForActivity(activity.id);

                return (
                  <div
                    key={activity.id}
                    className="group/actrow flex justify-between"
                    style={{ width: getGroupWidth(tasks.length) }}
                  >
                    <SortableActivity
                      activity={activity}
                      onClick={() => onEditActivity(activity)}
                      showIndicator={isDropTarget(encodeDragId({ type: 'activity', id: activity.id }))}
                    />
                    <AddActivityDropZone
                      afterActivityId={activity.id}
                      onAddActivity={onAddActivity}
                      showIndicator={isDropTarget(encodeDragId({ type: 'activity-end', afterActivityId: activity.id }))}
                      buttonClassName="opacity-0 group-hover/actrow:opacity-100 transition-opacity"
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
                  <div
                    key={activity.id}
                    className="group/taskrow flex"
                    style={{ width: getGroupWidth(tasks.length), gap: CARD_GAP }}
                  >
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
                      buttonClassName="opacity-0 group-hover/taskrow:opacity-100 transition-opacity"
                    />
                  </div>
                );
              })}
            </div>
          </SortableContext>
        </div>

        {sortedActivities.length > 0 && (
          <SortableContext
            items={sortedStories.map((s) => encodeDragId({ type: 'story', id: s.id }))}
            strategy={verticalListSortingStrategy}
          >
            <div className="space-y-2">
              {[...releases]
                .sort((a, b) => a.sort_order - b.sort_order)
                .map((release, index, arr) => (
                  <div key={release.id}>
                    <ReleaseRow
                      label={release.name}
                      releaseId={release.id}
                      storyMapId={storyMap.id}
                      storyMapName={storyMapName}
                      activities={sortedActivities}
                      getTasksForActivity={getTasksForActivity}
                      getStoriesForCell={getStoriesForCell}
                      onAddStory={onAddStory}
                      onEditStory={onEditStory}
                      onRename={() => onRenameRelease(release.id, release.name)}
                      onMoveUp={() => onMoveRelease(release.id, 'up')}
                      onMoveDown={() => onMoveRelease(release.id, 'down')}
                      onDelete={() => onDeleteRelease(release.id)}
                      onEditContext={onEditReleaseContext ? () => onEditReleaseContext(release.id) : undefined}
                      isFirst={index === 0}
                      isLast={index === arr.length - 1}
                      isCollapsed={collapsedReleases.has(release.id)}
                      onToggleCollapse={() => toggleRelease(release.id)}
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
                storyMapId={storyMap.id}
                storyMapName={storyMapName}
                activities={sortedActivities}
                getTasksForActivity={getTasksForActivity}
                getStoriesForCell={getStoriesForCell}
                onAddStory={onAddStory}
                onEditStory={onEditStory}
                isDropTarget={isDropTarget}
              />
            </div>
          </SortableContext>
        )}
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
            <div className="text-xs leading-4 line-clamp-2">{draggedStory.title}</div>
            {draggedStory.status !== 'backlog' && (
              <Badge
                variant={STATUS_VARIANTS[draggedStory.status]}
                className={`mt-auto text-[10px] self-start ${STATUS_CLASS[draggedStory.status] ?? ''}`}
              >
                {STATUS_LABELS[draggedStory.status]}
              </Badge>
            )}
          </MapCard>
        )}
      </DragOverlay>
    </DndContext>
  );
}

function AddActivityDropZone({
  afterActivityId,
  onAddActivity,
  showIndicator,
  buttonClassName,
}: {
  afterActivityId: string;
  onAddActivity: () => void;
  showIndicator: boolean;
  buttonClassName?: string;
}) {
  const { setNodeRef } = useDroppable({
    id: encodeDragId({ type: 'activity-end', afterActivityId }),
  });

  return (
    <div className="flex gap-1">
      {showIndicator && <DropLine direction="vertical" />}
      <AddButton
        ref={setNodeRef}
        label="Activity"
        orientation="vertical"
        style={{ width: ADD_BUTTON_WIDTH, height: CARD_HEIGHT }}
        onClick={onAddActivity}
        className={buttonClassName}
      />
    </div>
  );
}

function AddTaskDropZone({
  activityId,
  onAddTask,
  showIndicator,
  buttonClassName,
}: {
  activityId: string;
  onAddTask: (activityId: string) => void;
  showIndicator: boolean;
  buttonClassName?: string;
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
        className={buttonClassName}
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
  storyMapId: string;
  storyMapName: string;
  activities: Activity[];
  getTasksForActivity: (activityId: string) => (TaskWithStories & { activityId: string })[];
  getStoriesForCell: (taskId: string, releaseId: string | null) => Story[];
  onAddStory: (taskId: string, releaseId: string | null) => void;
  onEditStory: (story: Story) => void;
  onRename?: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  onDelete?: () => void;
  onEditContext?: () => void;
  isFirst?: boolean;
  isLast?: boolean;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
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
  storyMapId,
  storyMapName,
  activities,
  getTasksForActivity,
  getStoriesForCell,
  onAddStory,
  onEditStory,
  onRename,
  onMoveUp,
  onMoveDown,
  onDelete,
  onEditContext,
  isFirst,
  isLast,
  isCollapsed = false,
  onToggleCollapse,
  isDropTarget,
}: ReleaseRowProps) {
  const showActions = releaseId !== null;

  return (
    <div className="pt-4">
      <Separator className="mb-4" />
      <div className="group sticky left-4 w-fit flex items-center gap-2 mb-3">
        {onToggleCollapse && (
          <button
            type="button"
            onClick={onToggleCollapse}
            className="text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            aria-label={isCollapsed ? 'Expand release' : 'Collapse release'}
          >
            {isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
        )}
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
            {onDelete && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <DeleteButton onDelete={onDelete} iconOnly className="cursor-pointer" />
                </TooltipTrigger>
                <TooltipContent>Delete</TooltipContent>
              </Tooltip>
            )}
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
            {onEditContext && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-5 w-5 cursor-pointer" onClick={onEditContext}>
                    <FileText className="h-3 w-3" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Release context</TooltipContent>
              </Tooltip>
            )}
            {releaseId && (
              <AgentKickoffButton
                prompt={buildReleaseKickoffPrompt({
                  storyMapId,
                  storyMapName,
                  releaseId,
                  releaseName: label,
                })}
                tooltip="Copy agent kickoff prompt for this release"
                iconOnly
                variant="ghost"
                size="icon"
                className="h-5 w-5 cursor-pointer"
              />
            )}
          </div>
        )}
      </div>
      {!isCollapsed && (
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
      )}
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
    <div className="group/cell flex flex-col gap-2 min-h-[40px]" style={{ width: CARD_WIDTH }}>
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
        buttonClassName="opacity-0 group-hover/cell:opacity-100 transition-opacity"
      />
    </div>
  );
}

function AddStoryDropZone({
  taskId,
  releaseId,
  onAddStory,
  showIndicator,
  buttonClassName,
}: {
  taskId: string;
  releaseId: string | null;
  onAddStory: (taskId: string, releaseId: string | null) => void;
  showIndicator: boolean;
  buttonClassName?: string;
}) {
  const { setNodeRef } = useDroppable({
    id: encodeDragId({ type: 'story-end', taskId, releaseId }),
  });

  return (
    <div className="flex flex-col gap-1">
      {showIndicator && <DropLine direction="horizontal" />}
      <AddButton
        ref={setNodeRef}
        label="Story"
        className={`w-full h-8 ${buttonClassName ?? ''}`}
        onClick={() => onAddStory(taskId, releaseId)}
      />
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
        <div className="text-xs leading-4 line-clamp-2">{story.title}</div>
        {story.status !== 'backlog' && (
          <Badge
            variant={STATUS_VARIANTS[story.status]}
            className={`mt-auto text-[10px] self-start ${STATUS_CLASS[story.status] ?? ''}`}
          >
            {STATUS_LABELS[story.status]}
          </Badge>
        )}
      </MapCard>
    </div>
  );
}
