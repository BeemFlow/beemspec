'use client'

import { useEffect, useState, use } from 'react'
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
  const [selectedStory, setSelectedStory] = useState<Story | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [newStoryContext, setNewStoryContext] = useState<{ taskId: string; releaseId: string | null } | null>(null)

  useEffect(() => {
    loadStoryMap()
  }, [id])

  async function loadStoryMap() {
    const res = await fetch(`/api/story-maps/${id}`)
    const data = await res.json()
    setStoryMap(data)
  }

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
    if (selectedStory) {
      await fetch(`/api/stories/${selectedStory.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(story),
      })
    } else if (newStoryContext) {
      await fetch('/api/stories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...story,
          task_id: newStoryContext.taskId,
          release_id: newStoryContext.releaseId,
        }),
      })
    }
    setDialogOpen(false)
    loadStoryMap()
  }

  async function handleDeleteStory(storyId: string) {
    await fetch(`/api/stories/${storyId}`, { method: 'DELETE' })
    setDialogOpen(false)
    loadStoryMap()
  }

  async function handleAddActivity() {
    const name = prompt('Activity name:')
    if (!name) return
    await fetch('/api/activities', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ story_map_id: id, name }),
    })
    loadStoryMap()
  }

  async function handleAddTask(activityId: string) {
    const name = prompt('Task name:')
    if (!name) return
    await fetch('/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ activity_id: activityId, name }),
    })
    loadStoryMap()
  }

  async function handleAddRelease() {
    const name = prompt('Release name:')
    if (!name) return
    await fetch('/api/releases', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ story_map_id: id, name, sort_order: storyMap?.releases.length ?? 0 }),
    })
    loadStoryMap()
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
