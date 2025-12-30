'use client'

import { useState } from 'react'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DndContext,
  DragEndEvent,
  DragOverEvent,
  DragOverlay,
  DragStartEvent,
  rectIntersection,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
} from '@dnd-kit/core'
import {
  SortableContext,
  horizontalListSortingStrategy,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable'
import type { StoryMapFull, Story, Activity, Task, TaskWithStories } from '@/types'

interface Props {
  storyMap: StoryMapFull
  onAddStory: (taskId: string, releaseId: string | null) => void
  onEditStory: (story: Story) => void
  onAddActivity: () => void
  onAddTask: (activityId: string) => void
  onAddRelease: () => void
  onRefresh: () => void
}

const CARD_WIDTH = 140
const CARD_HEIGHT = 96
const CARD_GAP = 8
const GROUP_GAP = 24
const ADD_BUTTON_WIDTH = 28

// Shared subtle button style for all "Add X" buttons
const ADD_BUTTON_CLASS =
  'border border-dashed border-slate-300 rounded text-slate-400 hover:text-slate-600 hover:border-slate-400 transition-colors text-xs flex items-center justify-center'

// Group width = task columns + add button column
function getGroupWidth(taskCount: number) {
  return taskCount * (CARD_WIDTH + CARD_GAP) + ADD_BUTTON_WIDTH
}

type DragType = 'activity' | 'task' | 'story'
type ActiveDrag = { type: DragType; id: string } | null

// Drop indicator line component
function DropLine({ direction }: { direction: 'vertical' | 'horizontal' }) {
  if (direction === 'vertical') {
    return <div className="w-0.5 h-full bg-blue-500 rounded-full min-h-[96px]" />
  }
  return <div className="h-0.5 w-full bg-blue-500 rounded-full" />
}

export function StoryMapCanvas({
  storyMap,
  onAddStory,
  onEditStory,
  onAddActivity,
  onAddTask,
  onAddRelease,
  onRefresh,
}: Props) {
  const { activities, releases } = storyMap
  const [activeDrag, setActiveDrag] = useState<ActiveDrag>(null)
  const [dropTargetId, setDropTargetId] = useState<string | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  )

  const sortedActivities = [...activities].sort((a, b) => a.sort_order - b.sort_order)

  const allTasksOrdered: (TaskWithStories & { activityId: string })[] = []
  for (const activity of sortedActivities) {
    const tasks = [...(activity.tasks || [])].sort((a, b) => a.sort_order - b.sort_order)
    for (const task of tasks) {
      allTasksOrdered.push({ ...task, activityId: activity.id })
    }
  }

  const allStories = allTasksOrdered.flatMap((t) => t.stories)
  const sortedStories = [...allStories].sort((a, b) => a.sort_order - b.sort_order)

  function getTasksForActivity(activityId: string) {
    return allTasksOrdered.filter((t) => t.activityId === activityId)
  }

  function getStoriesForCell(taskId: string, releaseId: string | null): Story[] {
    return sortedStories.filter(
      (s) => s.task_id === taskId && (releaseId ? s.release_id === releaseId : !s.release_id)
    )
  }

  function handleDragStart(event: DragStartEvent) {
    const id = event.active.id as string
    const [type] = id.split(':')
    setActiveDrag({ type: type as DragType, id })
  }

  function handleDragOver(event: DragOverEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) {
      setDropTargetId(null)
      return
    }
    // Simple: track which item we're over. Always insert BEFORE that item.
    // Drop on "Add X" button or cell to insert at end.
    setDropTargetId(over.id as string)
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    setActiveDrag(null)
    setDropTargetId(null)
    if (!over) return

    const activeId = active.id as string
    const overId = over.id as string
    if (activeId === overId) return

    const [activeType, activeItemId] = activeId.split(':')
    const [overType, ...overParts] = overId.split(':')
    const overItemId = overParts[0]

    // Activity reordering
    if (activeType === 'activity' && overType === 'activity') {
      const newOrder = sortedActivities.map((a) => a.id)
      const fromIndex = newOrder.indexOf(activeItemId)
      const toIndex = newOrder.indexOf(overItemId)
      newOrder.splice(fromIndex, 1)
      newOrder.splice(toIndex, 0, activeItemId)

      await fetch('/api/activities', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ story_map_id: storyMap.id, order: newOrder }),
      })
      onRefresh()
    }

    // Task movement
    if (activeType === 'task') {
      const activeTask = allTasksOrdered.find((t) => t.id === activeItemId)
      if (!activeTask) return

      if (overType === 'task') {
        const overTask = allTasksOrdered.find((t) => t.id === overItemId)
        if (!overTask) return

        const targetActivityId = overTask.activityId
        const tasksInTarget = getTasksForActivity(targetActivityId)
        const newOrder = tasksInTarget.filter((t) => t.id !== activeItemId).map((t) => t.id)
        const toIndex = newOrder.indexOf(overItemId)
        newOrder.splice(toIndex, 0, activeItemId)

        // If moving to a different activity, update the task's activity_id first
        if (activeTask.activityId !== targetActivityId) {
          await fetch(`/api/tasks/${activeItemId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ activity_id: targetActivityId }),
          })
        }

        await fetch('/api/tasks', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ activity_id: targetActivityId, order: newOrder }),
        })
        onRefresh()
      }

      if (overType === 'task-end') {
        const targetActivityId = overItemId
        const tasksInTarget = getTasksForActivity(targetActivityId)
        const newOrder = tasksInTarget.filter((t) => t.id !== activeItemId).map((t) => t.id)
        newOrder.push(activeItemId)

        // If moving to a different activity, update the task's activity_id first
        if (activeTask.activityId !== targetActivityId) {
          await fetch(`/api/tasks/${activeItemId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ activity_id: targetActivityId }),
          })
        }

        await fetch('/api/tasks', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ activity_id: targetActivityId, order: newOrder }),
        })
        onRefresh()
      }
    }

    // Story movement
    if (activeType === 'story') {
      const activeStory = sortedStories.find((s) => s.id === activeItemId)
      if (!activeStory) return

      if (overType === 'story') {
        const overStory = sortedStories.find((s) => s.id === overItemId)
        if (!overStory) return

        const targetStories = getStoriesForCell(overStory.task_id, overStory.release_id)
        const newOrder = targetStories.filter((s) => s.id !== activeItemId).map((s) => s.id)
        const toIndex = newOrder.indexOf(overItemId)
        newOrder.splice(toIndex, 0, activeItemId)

        // If moving to a different cell, update the story's task_id/release_id first
        if (activeStory.task_id !== overStory.task_id || activeStory.release_id !== overStory.release_id) {
          await fetch(`/api/stories/${activeItemId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ task_id: overStory.task_id, release_id: overStory.release_id }),
          })
        }

        await fetch('/api/stories', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ task_id: overStory.task_id, release_id: overStory.release_id, order: newOrder }),
        })
        onRefresh()
      }

      if (overType === 'story-end') {
        const [taskId, releaseId] = overParts
        const actualReleaseId = releaseId === 'backlog' ? null : releaseId
        const targetStories = getStoriesForCell(taskId, actualReleaseId)
        const newOrder = targetStories.filter((s) => s.id !== activeItemId).map((s) => s.id)
        newOrder.push(activeItemId)

        // If moving to a different cell, update the story's task_id/release_id first
        if (activeStory.task_id !== taskId || activeStory.release_id !== actualReleaseId) {
          await fetch(`/api/stories/${activeItemId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ task_id: taskId, release_id: actualReleaseId }),
          })
        }

        await fetch('/api/stories', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ task_id: taskId, release_id: actualReleaseId, order: newOrder }),
        })
        onRefresh()
      }
    }
  }

  const draggedActivity = activeDrag?.type === 'activity'
    ? activities.find((a) => a.id === activeDrag.id.split(':')[1])
    : null
  const draggedTask = activeDrag?.type === 'task'
    ? allTasksOrdered.find((t) => t.id === activeDrag.id.split(':')[1])
    : null
  const draggedStory = activeDrag?.type === 'story'
    ? allStories.find((s) => s.id === activeDrag.id.split(':')[1])
    : null

  // Helper to check if an item is the drop target (always shows "before" indicator)
  function isDropTarget(itemId: string): boolean {
    return dropTargetId === itemId
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
    )
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
        {/* Activities Row */}
        <SortableContext
          items={sortedActivities.map((a) => `activity:${a.id}`)}
          strategy={horizontalListSortingStrategy}
        >
          <div className="flex" style={{ gap: GROUP_GAP }}>
            {sortedActivities.map((activity) => {
              const tasks = getTasksForActivity(activity.id)

              return (
                <div key={activity.id} className="flex justify-between" style={{ width: getGroupWidth(tasks.length) }}>
                  <SortableActivity
                    activity={activity}
                    showIndicator={isDropTarget(`activity:${activity.id}`)}
                  />
                  <button
                    className={ADD_BUTTON_CLASS}
                    style={{ width: ADD_BUTTON_WIDTH, height: CARD_HEIGHT }}
                    onClick={onAddActivity}
                  >
                    <span className="flex items-center gap-1 rotate-90 whitespace-nowrap">
                      <Plus className="h-3 w-3" />
                      Activity
                    </span>
                  </button>
                </div>
              )
            })}
          </div>
        </SortableContext>

        {/* Tasks Row */}
        <SortableContext
          items={allTasksOrdered.map((t) => `task:${t.id}`)}
          strategy={horizontalListSortingStrategy}
        >
          <div className="flex mt-2" style={{ gap: GROUP_GAP }}>
            {sortedActivities.map((activity) => {
              const tasks = getTasksForActivity(activity.id)

              return (
                <div key={activity.id} className="flex" style={{ width: getGroupWidth(tasks.length), gap: CARD_GAP }}>
                  {tasks.map((task) => (
                    <SortableTask
                      key={task.id}
                      task={task}
                      showIndicator={isDropTarget(`task:${task.id}`)}
                    />
                  ))}
                  <AddTaskDropZone
                    activityId={activity.id}
                    onAddTask={onAddTask}
                    showIndicator={isDropTarget(`task-end:${activity.id}`)}
                  />
                </div>
              )
            })}
          </div>
        </SortableContext>

        {/* Release Rows */}
        <SortableContext
          items={sortedStories.map((s) => `story:${s.id}`)}
          strategy={verticalListSortingStrategy}
        >
          <div className="mt-6 space-y-6">
            {[...releases]
              .sort((a, b) => a.sort_order - b.sort_order)
              .map((release) => (
                <ReleaseRow
                  key={release.id}
                  label={release.name}
                  releaseId={release.id}
                  activities={sortedActivities}
                  getTasksForActivity={getTasksForActivity}
                  getStoriesForCell={getStoriesForCell}
                  onAddStory={onAddStory}
                  onEditStory={onEditStory}
                  isDropTarget={isDropTarget}
                />
              ))}

            <Button
              variant="ghost"
              size="sm"
              className="border border-dashed text-muted-foreground hover:text-foreground"
              onClick={onAddRelease}
            >
              <Plus className="h-3 w-3 mr-1" />
              Add Release
            </Button>

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
          <div
            className="bg-amber-100 border border-amber-300 rounded p-3 shadow-lg"
            style={{ width: CARD_WIDTH, height: CARD_HEIGHT }}
          >
            <div className="font-medium text-sm line-clamp-3">{draggedActivity.name}</div>
          </div>
        )}
        {draggedTask && (
          <div
            className="bg-sky-100 border border-sky-300 rounded p-3 shadow-lg"
            style={{ width: CARD_WIDTH, height: CARD_HEIGHT }}
          >
            <div className="text-sm line-clamp-3">{draggedTask.name}</div>
          </div>
        )}
        {draggedStory && (
          <div
            className="bg-white border border-slate-300 rounded shadow-lg p-3"
            style={{ width: CARD_WIDTH, minHeight: CARD_HEIGHT }}
          >
            <div className="text-sm line-clamp-4">{draggedStory.title}</div>
          </div>
        )}
      </DragOverlay>
    </DndContext>
  )
}

function AddTaskDropZone({
  activityId,
  onAddTask,
  showIndicator,
}: {
  activityId: string
  onAddTask: (activityId: string) => void
  showIndicator: boolean
}) {
  const { setNodeRef } = useDroppable({
    id: `task-end:${activityId}`,
  })

  return (
    <div className="flex gap-1">
      {showIndicator && <DropLine direction="vertical" />}
      <button
        ref={setNodeRef}
        className={ADD_BUTTON_CLASS}
        style={{ width: ADD_BUTTON_WIDTH, height: CARD_HEIGHT }}
        onClick={() => onAddTask(activityId)}
      >
        <span className="flex items-center gap-1 rotate-90 whitespace-nowrap">
          <Plus className="h-3 w-3" />
          Task
        </span>
      </button>
    </div>
  )
}

function SortableActivity({
  activity,
  showIndicator,
}: {
  activity: Activity
  showIndicator: boolean
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useSortable({
    id: `activity:${activity.id}`,
  })

  return (
    <div className="flex items-stretch gap-1">
      {showIndicator && <DropLine direction="vertical" />}
      <div
        ref={setNodeRef}
        style={{ width: CARD_WIDTH, height: CARD_HEIGHT, opacity: isDragging ? 0.5 : 1 }}
        className="bg-amber-100 border border-amber-200 rounded p-3 cursor-grab active:cursor-grabbing"
        {...attributes}
        {...listeners}
      >
        <div className="font-medium text-sm line-clamp-3">{activity.name}</div>
      </div>
    </div>
  )
}

function SortableTask({
  task,
  showIndicator,
}: {
  task: Task
  showIndicator: boolean
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useSortable({
    id: `task:${task.id}`,
  })

  return (
    <div className="flex items-stretch gap-1">
      {showIndicator && <DropLine direction="vertical" />}
      <div
        ref={setNodeRef}
        style={{ width: CARD_WIDTH, height: CARD_HEIGHT, opacity: isDragging ? 0.5 : 1 }}
        className="bg-sky-100 border border-sky-200 rounded p-3 cursor-grab active:cursor-grabbing"
        {...attributes}
        {...listeners}
      >
        <div className="text-sm line-clamp-3">{task.name}</div>
      </div>
    </div>
  )
}

interface ReleaseRowProps {
  label: string
  labelMuted?: boolean
  releaseId: string | null
  activities: Activity[]
  getTasksForActivity: (activityId: string) => (TaskWithStories & { activityId: string })[]
  getStoriesForCell: (taskId: string, releaseId: string | null) => Story[]
  onAddStory: (taskId: string, releaseId: string | null) => void
  onEditStory: (story: Story) => void
  isDropTarget: (itemId: string) => boolean
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
  isDropTarget,
}: ReleaseRowProps) {
  return (
    <div className="border-t pt-4">
      <div className={`text-sm font-medium mb-3 ${labelMuted ? 'text-muted-foreground' : ''}`}>
        {label}
      </div>
      <div className="flex" style={{ gap: GROUP_GAP }}>
        {activities.map((activity) => {
          const tasks = getTasksForActivity(activity.id)

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
          )
        })}
      </div>
    </div>
  )
}

function StoryCell({
  taskId,
  releaseId,
  stories,
  onAddStory,
  onEditStory,
  isDropTarget,
}: {
  taskId: string
  releaseId: string | null
  stories: Story[]
  onAddStory: (taskId: string, releaseId: string | null) => void
  onEditStory: (story: Story) => void
  isDropTarget: (itemId: string) => boolean
}) {
  return (
    <div className="flex flex-col gap-1 min-h-[40px]" style={{ width: CARD_WIDTH }}>
      {stories.map((story) => (
        <SortableStory
          key={story.id}
          story={story}
          onClick={() => onEditStory(story)}
          showIndicator={isDropTarget(`story:${story.id}`)}
        />
      ))}
      <AddStoryDropZone
        taskId={taskId}
        releaseId={releaseId}
        onAddStory={onAddStory}
        showIndicator={isDropTarget(`story-end:${taskId}:${releaseId ?? 'backlog'}`)}
      />
    </div>
  )
}

function AddStoryDropZone({
  taskId,
  releaseId,
  onAddStory,
  showIndicator,
}: {
  taskId: string
  releaseId: string | null
  onAddStory: (taskId: string, releaseId: string | null) => void
  showIndicator: boolean
}) {
  const { setNodeRef } = useDroppable({
    id: `story-end:${taskId}:${releaseId ?? 'backlog'}`,
  })

  return (
    <div className="flex flex-col gap-1">
      {showIndicator && <DropLine direction="horizontal" />}
      <button
        ref={setNodeRef}
        className={`w-full h-8 ${ADD_BUTTON_CLASS}`}
        onClick={() => onAddStory(taskId, releaseId)}
      >
        <Plus className="h-3 w-3" />
        Story
      </button>
    </div>
  )
}

function SortableStory({
  story,
  onClick,
  showIndicator,
}: {
  story: Story
  onClick: () => void
  showIndicator: boolean
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useSortable({
    id: `story:${story.id}`,
  })

  return (
    <div className="flex flex-col gap-1">
      {showIndicator && <DropLine direction="horizontal" />}
      <div
        ref={setNodeRef}
        style={{ minHeight: CARD_HEIGHT, opacity: isDragging ? 0.5 : 1 }}
        className="bg-white border border-slate-200 rounded shadow-sm hover:shadow cursor-grab active:cursor-grabbing p-3"
        {...attributes}
        {...listeners}
        onClick={(e) => {
          if (!isDragging) onClick()
        }}
      >
        <div className="text-sm line-clamp-4">{story.title}</div>
      </div>
    </div>
  )
}
