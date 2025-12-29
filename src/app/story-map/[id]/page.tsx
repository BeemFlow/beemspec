'use client'

import { useEffect, useState, use, useCallback } from 'react'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area'
import { StoryMapCanvas } from '@/components/story-map/StoryMapCanvas'
import { StoryDialog } from '@/components/story-map/StoryDialog'
import type { StoryMapFull, Story } from '@/types'

export default function StoryMapPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [storyMap, setStoryMap] = useState<StoryMapFull | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selectedStory, setSelectedStory] = useState<Story | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [newStoryContext, setNewStoryContext] = useState<{ taskId: string; releaseId: string | null } | null>(null)

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
        // Find existing stories in this cell to calculate sort_order
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

  async function handleAddActivity() {
    const name = prompt('Activity name:')
    if (!name) return
    try {
      const maxSort = storyMap?.activities.length
        ? Math.max(...storyMap.activities.map((a) => a.sort_order))
        : -1
      const res = await fetch('/api/activities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ story_map_id: id, name, sort_order: maxSort + 1 }),
      })
      if (!res.ok) throw new Error('Failed to create activity')
      loadStoryMap()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    }
  }

  async function handleAddTask(activityId: string) {
    const name = prompt('Task name:')
    if (!name) return
    try {
      const activity = storyMap?.activities.find((a) => a.id === activityId)
      const maxSort = activity?.tasks?.length
        ? Math.max(...activity.tasks.map((t) => t.sort_order))
        : -1
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ activity_id: activityId, name, sort_order: maxSort + 1 }),
      })
      if (!res.ok) throw new Error('Failed to create task')
      loadStoryMap()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    }
  }

  async function handleAddRelease() {
    const name = prompt('Release name:')
    if (!name) return
    try {
      const maxSort = storyMap?.releases.length
        ? Math.max(...storyMap.releases.map((r) => r.sort_order))
        : -1
      const res = await fetch('/api/releases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ story_map_id: id, name, sort_order: maxSort + 1 }),
      })
      if (!res.ok) throw new Error('Failed to create release')
      loadStoryMap()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
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
            onAddTask={handleAddTask}
            onAddRelease={handleAddRelease}
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
        onSave={handleSaveStory}
        onDelete={selectedStory ? () => handleDeleteStory(selectedStory.id) : undefined}
      />
    </div>
  )
}
