'use client'

import { useEffect, useState, use, useCallback } from 'react'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area'
import { PromptDialog } from '@/components/ui/prompt-dialog'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { StoryMapCanvas } from '@/components/story-map/StoryMapCanvas'
import { StoryDialog } from '@/components/story-map/StoryDialog'
import { ActivityDialog } from '@/components/story-map/ActivityDialog'
import { TaskDialog } from '@/components/story-map/TaskDialog'
import type { StoryMapFull, Story, Activity, Task } from '@/types'

type PromptType =
  | { type: 'release' }
  | { type: 'renameRelease'; releaseId: string; currentName: string }

export default function StoryMapPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [storyMap, setStoryMap] = useState<StoryMapFull | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selectedStory, setSelectedStory] = useState<Story | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [newStoryContext, setNewStoryContext] = useState<{ taskId: string; releaseId: string | null } | null>(null)

  // Prompt dialog state
  const [promptOpen, setPromptOpen] = useState(false)
  const [promptContext, setPromptContext] = useState<PromptType | null>(null)

  // Confirm dialog state
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [deleteReleaseId, setDeleteReleaseId] = useState<string | null>(null)

  // Activity dialog state
  const [activityDialogOpen, setActivityDialogOpen] = useState(false)
  const [selectedActivity, setSelectedActivity] = useState<Activity | null>(null)

  // Task dialog state
  const [taskDialogOpen, setTaskDialogOpen] = useState(false)
  const [selectedTask, setSelectedTask] = useState<Task | null>(null)
  const [newTaskActivityId, setNewTaskActivityId] = useState<string | null>(null)

  const loadStoryMap = useCallback(async () => {
    try {
      const res = await fetch(`/api/story-maps/${id}`)
      if (!res.ok) throw new Error('Failed to load story map')
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setStoryMap(data)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    }
  }, [id])

  useEffect(() => {
    loadStoryMap()
  }, [loadStoryMap])

  function handleAddStory(taskId: string, releaseId: string | null) {
    setNewStoryContext({ taskId, releaseId })
    setSelectedStory(null)
    setDialogOpen(true)
  }

  function handleEditStory(story: Story) {
    setNewStoryContext(null)
    setSelectedStory(story)
    setDialogOpen(true)
  }

  async function handleSaveStory(story: Partial<Story>) {
    try {
      if (selectedStory) {
        const res = await fetch(`/api/stories/${selectedStory.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(story),
        })
        if (!res.ok) throw new Error('Failed to save story')
      } else if (newStoryContext) {
        const activity = storyMap?.activities.find((a) =>
          a.tasks?.some((t) => t.id === newStoryContext.taskId)
        )
        const task = activity?.tasks?.find((t) => t.id === newStoryContext.taskId)
        const cellStories = task?.stories?.filter(
          (s) => s.release_id === newStoryContext.releaseId
        ) ?? []
        const maxSort = cellStories.length
          ? Math.max(...cellStories.map((s) => s.sort_order))
          : -1

        const res = await fetch('/api/stories', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...story,
            task_id: newStoryContext.taskId,
            release_id: newStoryContext.releaseId,
            sort_order: maxSort + 1,
          }),
        })
        if (!res.ok) throw new Error('Failed to create story')
      }
      setDialogOpen(false)
      loadStoryMap()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    }
  }

  async function handleDeleteStory(storyId: string) {
    try {
      const res = await fetch(`/api/stories/${storyId}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Failed to delete story')
      setDialogOpen(false)
      loadStoryMap()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    }
  }

  // Activity handlers
  function handleAddActivity() {
    setSelectedActivity(null)
    setActivityDialogOpen(true)
  }

  function handleEditActivity(activity: Activity) {
    setSelectedActivity(activity)
    setActivityDialogOpen(true)
  }

  async function handleSaveActivity(data: { name: string }) {
    try {
      if (selectedActivity) {
        const res = await fetch(`/api/activities/${selectedActivity.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        })
        if (!res.ok) throw new Error('Failed to update activity')
      } else {
        const maxSort = storyMap?.activities.length
          ? Math.max(...storyMap.activities.map((a) => a.sort_order))
          : -1
        const res = await fetch('/api/activities', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ story_map_id: id, name: data.name, sort_order: maxSort + 1 }),
        })
        if (!res.ok) throw new Error('Failed to create activity')
      }
      setActivityDialogOpen(false)
      loadStoryMap()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    }
  }

  async function handleDeleteActivity() {
    if (!selectedActivity) return
    try {
      const res = await fetch(`/api/activities/${selectedActivity.id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Failed to delete activity')
      setActivityDialogOpen(false)
      loadStoryMap()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    }
  }

  // Task handlers
  function handleAddTask(activityId: string) {
    setSelectedTask(null)
    setNewTaskActivityId(activityId)
    setTaskDialogOpen(true)
  }

  function handleEditTask(task: Task) {
    setSelectedTask(task)
    setNewTaskActivityId(null)
    setTaskDialogOpen(true)
  }

  async function handleSaveTask(data: { name: string }) {
    try {
      if (selectedTask) {
        const res = await fetch(`/api/tasks/${selectedTask.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        })
        if (!res.ok) throw new Error('Failed to update task')
      } else if (newTaskActivityId) {
        const activity = storyMap?.activities.find((a) => a.id === newTaskActivityId)
        const maxSort = activity?.tasks?.length
          ? Math.max(...activity.tasks.map((t) => t.sort_order))
          : -1
        const res = await fetch('/api/tasks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ activity_id: newTaskActivityId, name: data.name, sort_order: maxSort + 1 }),
        })
        if (!res.ok) throw new Error('Failed to create task')
      }
      setTaskDialogOpen(false)
      loadStoryMap()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    }
  }

  async function handleDeleteTask() {
    if (!selectedTask) return
    try {
      const res = await fetch(`/api/tasks/${selectedTask.id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Failed to delete task')
      setTaskDialogOpen(false)
      loadStoryMap()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    }
  }

  // Release handlers
  function handleAddRelease() {
    setPromptContext({ type: 'release' })
    setPromptOpen(true)
  }

  function handleRenameRelease(releaseId: string, currentName: string) {
    setPromptContext({ type: 'renameRelease', releaseId, currentName })
    setPromptOpen(true)
  }

  // Handle prompt submissions (releases only)
  async function handlePromptSubmit(value: string) {
    if (!promptContext) return

    try {
      switch (promptContext.type) {
        case 'release': {
          const maxSort = storyMap?.releases.length
            ? Math.max(...storyMap.releases.map((r) => r.sort_order))
            : -1
          const res = await fetch('/api/releases', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ story_map_id: id, name: value, sort_order: maxSort + 1 }),
          })
          if (!res.ok) throw new Error('Failed to create release')
          break
        }
        case 'renameRelease': {
          if (value === promptContext.currentName) return
          const res = await fetch(`/api/releases/${promptContext.releaseId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: value }),
          })
          if (!res.ok) throw new Error('Failed to rename release')
          break
        }
      }
      loadStoryMap()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    }
  }

  async function handleMoveRelease(releaseId: string, direction: 'up' | 'down') {
    if (!storyMap) return
    const sortedReleases = [...storyMap.releases].sort((a, b) => a.sort_order - b.sort_order)
    const index = sortedReleases.findIndex((r) => r.id === releaseId)
    if (index === -1) return
    if (direction === 'up' && index === 0) return
    if (direction === 'down' && index === sortedReleases.length - 1) return

    const swapIndex = direction === 'up' ? index - 1 : index + 1
    const newOrder = sortedReleases.map((r) => r.id)
    ;[newOrder[index], newOrder[swapIndex]] = [newOrder[swapIndex], newOrder[index]]

    try {
      const res = await fetch('/api/releases', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ story_map_id: id, order: newOrder }),
      })
      if (!res.ok) throw new Error('Failed to reorder releases')
      loadStoryMap()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    }
  }

  function handleDeleteRelease(releaseId: string) {
    setDeleteReleaseId(releaseId)
    setConfirmOpen(true)
  }

  async function handleConfirmDelete() {
    if (!deleteReleaseId) return
    try {
      const res = await fetch(`/api/releases/${deleteReleaseId}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Failed to delete release')
      loadStoryMap()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    }
  }

  // Get prompt dialog props based on context (releases only)
  function getPromptProps() {
    if (!promptContext) return { title: '', placeholder: '', defaultValue: '' }
    switch (promptContext.type) {
      case 'release':
        return { title: 'New Release', placeholder: 'Release name', defaultValue: '' }
      case 'renameRelease':
        return { title: 'Rename Release', placeholder: 'Release name', defaultValue: promptContext.currentName }
    }
  }

  if (error) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-center">
          <p className="text-destructive mb-4">{error}</p>
          <Button variant="outline" onClick={loadStoryMap}>Retry</Button>
        </div>
      </div>
    )
  }

  if (!storyMap) return <div className="p-8">Loading...</div>

  const promptProps = getPromptProps()

  return (
    <div className="flex h-screen flex-col">
      <header className="flex items-center gap-4 border-b px-4 py-3">
        <Link href="/">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <h1 className="text-xl font-semibold">{storyMap.name}</h1>
      </header>

      <ScrollArea className="flex-1">
        <div className="p-4">
          <StoryMapCanvas
            storyMap={storyMap}
            onAddStory={handleAddStory}
            onEditStory={handleEditStory}
            onAddActivity={handleAddActivity}
            onEditActivity={handleEditActivity}
            onAddTask={handleAddTask}
            onEditTask={handleEditTask}
            onAddRelease={handleAddRelease}
            onRenameRelease={handleRenameRelease}
            onMoveRelease={handleMoveRelease}
            onDeleteRelease={handleDeleteRelease}
            onRefresh={loadStoryMap}
          />
        </div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>

      <StoryDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        story={selectedStory}
        releases={storyMap.releases}
        defaultReleaseId={newStoryContext?.releaseId}
        onSave={handleSaveStory}
        onDelete={selectedStory ? () => handleDeleteStory(selectedStory.id) : undefined}
      />

      <PromptDialog
        open={promptOpen}
        onOpenChange={setPromptOpen}
        title={promptProps.title}
        placeholder={promptProps.placeholder}
        defaultValue={promptProps.defaultValue}
        onSubmit={handlePromptSubmit}
      />

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Delete Release"
        description="This will delete the release and all its stories. This cannot be undone."
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={handleConfirmDelete}
      />

      <ActivityDialog
        open={activityDialogOpen}
        onOpenChange={setActivityDialogOpen}
        activity={selectedActivity}
        onSave={handleSaveActivity}
        onDelete={selectedActivity ? handleDeleteActivity : undefined}
      />

      <TaskDialog
        open={taskDialogOpen}
        onOpenChange={setTaskDialogOpen}
        task={selectedTask}
        onSave={handleSaveTask}
        onDelete={selectedTask ? handleDeleteTask : undefined}
      />
    </div>
  )
}
