'use client'

import { useState } from 'react'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  closestCenter,
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
  arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { StoryMapFull, Story, Activity, Task } from '@/types'

interface Props {
  storyMap: StoryMapFull
  onAddStory: (taskId: string, releaseId: string | null) => void
  onEditStory: (story: Story) => void
  onAddActivity: () => void
  onAddTask: (activityId: string) => void
  onAddRelease: () => void
  onRefresh: () => void
}

const TASK_WIDTH = 180
const TASK_GAP = 8
const GROUP_GAP = 24
const ADD_BUTTON_WIDTH = 40

type DragType = 'activity' | 'task' | 'story'
type ActiveDrag = { type: DragType; id: string } | null

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

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  )

  // Flatten all tasks and stories for unified contexts
  const allTasks = activities.flatMap((a) =>
    (a.tasks || []).map((t) => ({ ...t, activityId: a.id }))
  )
  const allStories = allTasks.flatMap((t) => t.stories || [])

  // Sort by sort_order
  const sortedActivities = [...activities].sort((a, b) => a.sort_order - b.sort_order)
  const sortedTasks = [...allTasks].sort((a, b) => a.sort_order - b.sort_order)
  const sortedStories = [...allStories].sort((a, b) => a.sort_order - b.sort_order)

  // Get stories for a specific cell
  function getStoriesForCell(taskId: string, releaseId: string | null): Story[] {
    return sortedStories.filter(
      (s) => s.task_id === taskId && (releaseId ? s.release_id === releaseId : !s.release_id)
    )
  }

  // Get tasks for an activity
  function getTasksForActivity(activityId: string) {
    return sortedTasks.filter((t) => t.activityId === activityId)
  }

  // Calculate widths
  function getGroupWidth(activityId: string): number {
    const taskCount = getTasksForActivity(activityId).length
    if (taskCount === 0) return TASK_WIDTH
    return taskCount * TASK_WIDTH + (taskCount - 1) * TASK_GAP + TASK_GAP + ADD_BUTTON_WIDTH
  }

  function getActivityWidth(activityId: string): number {
    const taskCount = getTasksForActivity(activityId).length
    if (taskCount === 0) return TASK_WIDTH
    return taskCount * TASK_WIDTH + (taskCount - 1) * TASK_GAP
  }

  function handleDragStart(event: DragStartEvent) {
    const id = event.active.id as string
    const [type] = id.split(':')
    setActiveDrag({ type: type as DragType, id })
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    setActiveDrag(null)
    if (!over) return

    const activeId = active.id as string
    const overId = over.id as string
    const [activeType, activeItemId] = activeId.split(':')
    const [overType, overItemId] = overId.split(':')

    // Activity reordering
    if (activeType === 'activity' && overType === 'activity' && activeId !== overId) {
      const oldIndex = sortedActivities.findIndex((a) => a.id === activeItemId)
      const newIndex = sortedActivities.findIndex((a) => a.id === overItemId)
      if (oldIndex !== -1 && newIndex !== -1) {
        const reordered = arrayMove(sortedActivities, oldIndex, newIndex)
        await Promise.all(
          reordered.map((a, i) =>
            fetch(`/api/activities/${a.id}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ sort_order: i }),
            })
          )
        )
        onRefresh()
      }
    }

    // Task reordering (within same activity or across activities)
    if (activeType === 'task') {
      const activeTask = sortedTasks.find((t) => t.id === activeItemId)
      if (!activeTask) return

      // Dropping on another task
      if (overType === 'task' && activeId !== overId) {
        const overTask = sortedTasks.find((t) => t.id === overItemId)
        if (!overTask) return

        const targetActivityId = overTask.activityId
        const tasksInTarget = getTasksForActivity(targetActivityId)
        const overIndex = tasksInTarget.findIndex((t) => t.id === overItemId)

        // Update the moved task
        await fetch(`/api/tasks/${activeItemId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            activity_id: targetActivityId,
            sort_order: overIndex,
          }),
        })

        // Reorder other tasks in target activity
        const otherTasks = tasksInTarget.filter((t) => t.id !== activeItemId)
        await Promise.all(
          otherTasks.map((t, i) => {
            const newOrder = i >= overIndex ? i + 1 : i
            return fetch(`/api/tasks/${t.id}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ sort_order: newOrder }),
            })
          })
        )
        onRefresh()
      }
    }

    // Story reordering or moving to different cell
    if (activeType === 'story') {
      const activeStory = sortedStories.find((s) => s.id === activeItemId)
      if (!activeStory) return

      // Dropping on another story (reorder within same cell)
      if (overType === 'story' && activeId !== overId) {
        const overStory = sortedStories.find((s) => s.id === overItemId)
        if (!overStory) return

        // Only reorder if in same cell
        if (activeStory.task_id === overStory.task_id && activeStory.release_id === overStory.release_id) {
          const cellStories = getStoriesForCell(activeStory.task_id, activeStory.release_id)
          const oldIndex = cellStories.findIndex((s) => s.id === activeItemId)
          const newIndex = cellStories.findIndex((s) => s.id === overItemId)
          const reordered = arrayMove(cellStories, oldIndex, newIndex)
          await Promise.all(
            reordered.map((s, i) =>
              fetch(`/api/stories/${s.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sort_order: i }),
              })
            )
          )
          onRefresh()
        } else {
          // Moving to different cell via story
          const targetTaskId = overStory.task_id
          const targetReleaseId = overStory.release_id
          const targetStories = getStoriesForCell(targetTaskId, targetReleaseId)
          const overIndex = targetStories.findIndex((s) => s.id === overItemId)

          await fetch(`/api/stories/${activeItemId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              task_id: targetTaskId,
              release_id: targetReleaseId,
              sort_order: overIndex,
            }),
          })
          onRefresh()
        }
      }

      // Dropping on a cell (empty area)
      if (overType === 'cell') {
        const [, taskId, releaseId] = overId.split(':')
        const actualReleaseId = releaseId === 'backlog' ? null : releaseId
        const targetStories = getStoriesForCell(taskId, actualReleaseId)

        await fetch(`/api/stories/${activeItemId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            task_id: taskId,
            release_id: actualReleaseId,
            sort_order: targetStories.length,
          }),
        })
        onRefresh()
      }
    }
  }

  // Get the dragged item for overlay
  const draggedActivity = activeDrag?.type === 'activity'
    ? activities.find((a) => a.id === activeDrag.id.split(':')[1])
    : null
  const draggedTask = activeDrag?.type === 'task'
    ? allTasks.find((t) => t.id === activeDrag.id.split(':')[1])
    : null
  const draggedStory = activeDrag?.type === 'story'
    ? allStories.find((s) => s.id === activeDrag.id.split(':')[1])
    : null

  if (activities.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
        <p className="mb-4">Add an activity to get started with your story map.</p>
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
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="inline-flex flex-col">
        {/* Activities row */}
        <SortableContext
          items={sortedActivities.map((a) => `activity:${a.id}`)}
          strategy={horizontalListSortingStrategy}
        >
          <div className="flex items-end" style={{ gap: GROUP_GAP }}>
            {sortedActivities.map((activity) => (
              <SortableActivity
                key={activity.id}
                activity={activity}
                groupWidth={getGroupWidth(activity.id)}
                activityWidth={getActivityWidth(activity.id)}
              />
            ))}
            <Button
              variant="ghost"
              className="h-[80px] px-4 border border-dashed text-muted-foreground hover:text-foreground"
              onClick={onAddActivity}
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </SortableContext>

        {/* Tasks row */}
        <SortableContext
          items={sortedTasks.map((t) => `task:${t.id}`)}
          strategy={horizontalListSortingStrategy}
        >
          <div className="flex items-start mt-2" style={{ gap: GROUP_GAP }}>
            {sortedActivities.map((activity) => {
              const tasks = getTasksForActivity(activity.id)
              const groupWidth = getGroupWidth(activity.id)
              return (
                <div key={activity.id} className="flex items-start" style={{ gap: TASK_GAP, width: groupWidth }}>
                  {tasks.length === 0 ? (
                    <Button
                      variant="ghost"
                      className="border border-dashed text-muted-foreground hover:text-foreground min-h-[72px]"
                      style={{ width: TASK_WIDTH }}
                      onClick={() => onAddTask(activity.id)}
                    >
                      <Plus className="h-3 w-3 mr-1" />
                      Task
                    </Button>
                  ) : (
                    <>
                      {tasks.map((task) => (
                        <SortableTask key={task.id} task={task} />
                      ))}
                      <Button
                        variant="ghost"
                        className="border border-dashed text-muted-foreground hover:text-foreground min-h-[72px]"
                        style={{ width: ADD_BUTTON_WIDTH }}
                        onClick={() => onAddTask(activity.id)}
                      >
                        <Plus className="h-3 w-3" />
                      </Button>
                    </>
                  )}
                </div>
              )
            })}
          </div>
        </SortableContext>

        {/* Stories - one unified context */}
        <SortableContext
          items={sortedStories.map((s) => `story:${s.id}`)}
          strategy={verticalListSortingStrategy}
        >
          <div className="mt-8 space-y-8">
            {releases.length === 0 ? (
              <ReleaseRow
                label="Backlog"
                labelMuted
                releaseId={null}
                activities={sortedActivities}
                getTasksForActivity={getTasksForActivity}
                getStoriesForCell={getStoriesForCell}
                getGroupWidth={getGroupWidth}
                onAddStory={onAddStory}
                onEditStory={onEditStory}
              >
                <Button
                  variant="ghost"
                  size="sm"
                  className="mt-4 border border-dashed text-muted-foreground hover:text-foreground"
                  onClick={onAddRelease}
                >
                  <Plus className="h-3 w-3 mr-1" />
                  Add Release
                </Button>
              </ReleaseRow>
            ) : (
              <>
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
                      getGroupWidth={getGroupWidth}
                      onAddStory={onAddStory}
                      onEditStory={onEditStory}
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
                  getGroupWidth={getGroupWidth}
                  onAddStory={onAddStory}
                  onEditStory={onEditStory}
                />
              </>
            )}
          </div>
        </SortableContext>
      </div>

      <DragOverlay>
        {draggedActivity && (
          <div className="bg-teal-100 border border-teal-300 rounded-lg p-3 min-h-[80px] shadow-lg">
            <div className="font-medium text-sm text-teal-900">{draggedActivity.name}</div>
          </div>
        )}
        {draggedTask && (
          <div
            className="bg-amber-100 border border-amber-300 rounded-lg p-3 min-h-[72px] shadow-lg"
            style={{ width: TASK_WIDTH }}
          >
            <div className="text-sm">{draggedTask.name}</div>
          </div>
        )}
        {draggedStory && (
          <Card className="bg-white border-slate-300 shadow-lg" style={{ width: TASK_WIDTH }}>
            <CardContent className="p-3">
              <div className="text-sm">{draggedStory.title}</div>
            </CardContent>
          </Card>
        )}
      </DragOverlay>
    </DndContext>
  )
}

function SortableActivity({
  activity,
  groupWidth,
  activityWidth,
}: {
  activity: Activity
  groupWidth: number
  activityWidth: number
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: `activity:${activity.id}`,
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    width: groupWidth,
    opacity: isDragging ? 0.5 : 1,
  }

  return (
    <div ref={setNodeRef} style={style}>
      <div
        className="bg-teal-100 border border-teal-200 rounded-lg p-3 min-h-[80px] cursor-grab active:cursor-grabbing"
        style={{ width: activityWidth }}
        {...attributes}
        {...listeners}
      >
        <div className="font-medium text-sm text-teal-900">{activity.name}</div>
      </div>
    </div>
  )
}

function SortableTask({ task }: { task: Task }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: `task:${task.id}`,
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    width: TASK_WIDTH,
    opacity: isDragging ? 0.5 : 1,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="bg-amber-100 border border-amber-200 rounded-lg p-3 min-h-[72px] cursor-grab active:cursor-grabbing"
      {...attributes}
      {...listeners}
    >
      <div className="text-sm">{task.name}</div>
    </div>
  )
}

interface ReleaseRowProps {
  label: string
  labelMuted?: boolean
  releaseId: string | null
  activities: Activity[]
  getTasksForActivity: (activityId: string) => (Task & { activityId: string })[]
  getStoriesForCell: (taskId: string, releaseId: string | null) => Story[]
  getGroupWidth: (activityId: string) => number
  onAddStory: (taskId: string, releaseId: string | null) => void
  onEditStory: (story: Story) => void
  children?: React.ReactNode
}

function ReleaseRow({
  label,
  labelMuted,
  releaseId,
  activities,
  getTasksForActivity,
  getStoriesForCell,
  getGroupWidth,
  onAddStory,
  onEditStory,
  children,
}: ReleaseRowProps) {
  return (
    <div className="border-t pt-4">
      <div className={`text-sm font-medium mb-3 ${labelMuted ? 'text-muted-foreground' : ''}`}>
        {label}
      </div>
      <div className="flex items-start" style={{ gap: GROUP_GAP }}>
        {activities.map((activity) => {
          const tasks = getTasksForActivity(activity.id)
          const groupWidth = getGroupWidth(activity.id)

          if (tasks.length === 0) {
            return <div key={activity.id} style={{ width: groupWidth }} />
          }

          return (
            <div key={activity.id} className="flex items-start" style={{ gap: TASK_GAP, width: groupWidth }}>
              {tasks.map((task) => (
                <StoryCell
                  key={task.id}
                  taskId={task.id}
                  releaseId={releaseId}
                  stories={getStoriesForCell(task.id, releaseId)}
                  onAddStory={onAddStory}
                  onEditStory={onEditStory}
                />
              ))}
              <div style={{ width: ADD_BUTTON_WIDTH }} />
            </div>
          )
        })}
      </div>
      {children}
    </div>
  )
}

function StoryCell({
  taskId,
  releaseId,
  stories,
  onAddStory,
  onEditStory,
}: {
  taskId: string
  releaseId: string | null
  stories: Story[]
  onAddStory: (taskId: string, releaseId: string | null) => void
  onEditStory: (story: Story) => void
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `cell:${taskId}:${releaseId ?? 'backlog'}`,
    data: { taskId, releaseId },
  })

  return (
    <div
      ref={setNodeRef}
      className={`space-y-2 min-h-[48px] rounded-lg transition-colors ${isOver ? 'bg-blue-50' : ''}`}
      style={{ width: TASK_WIDTH }}
    >
      {stories.map((story) => (
        <SortableStory key={story.id} story={story} onClick={() => onEditStory(story)} />
      ))}
      <Button
        variant="ghost"
        size="sm"
        className="w-full border border-dashed h-9 text-muted-foreground hover:text-foreground"
        onClick={() => onAddStory(taskId, releaseId)}
      >
        <Plus className="h-3 w-3 mr-1" />
        Story
      </Button>
    </div>
  )
}

function SortableStory({ story, onClick }: { story: Story; onClick: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: `story:${story.id}`,
    data: { taskId: story.task_id, releaseId: story.release_id },
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  return (
    <Card
      ref={setNodeRef}
      style={style}
      className="cursor-grab active:cursor-grabbing bg-white border-slate-200 shadow-sm hover:shadow-md transition-shadow"
      {...attributes}
      {...listeners}
      onClick={(e) => {
        if (!isDragging) onClick()
      }}
    >
      <CardContent className="p-3">
        <div className="text-sm">{story.title}</div>
      </CardContent>
    </Card>
  )
}
