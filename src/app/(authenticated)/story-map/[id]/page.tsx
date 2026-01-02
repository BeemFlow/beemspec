'use client';

import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { use, useCallback, useEffect, useState } from 'react';
import { ActivityDialog } from '@/components/story-map/ActivityDialog';
import { StoryDialog } from '@/components/story-map/StoryDialog';
import { StoryMapCanvas } from '@/components/story-map/StoryMapCanvas';
import { TaskDialog } from '@/components/story-map/TaskDialog';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { PromptDialog } from '@/components/ui/prompt-dialog';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { errorMessage } from '@/lib/errors';
import type { Activity, Story, StoryMapFull, Task } from '@/types';

/** Extract error message from failed fetch response */
async function extractError(res: Response, fallback: string): Promise<string> {
  try {
    const body = await res.json();
    return body.error || fallback;
  } catch {
    return fallback;
  }
}

/**
 * Dialog state machine - discriminated union ensuring only one dialog can be open
 * and all required data is present for each dialog type.
 *
 * This replaces 13 separate useState calls with a single state variable.
 */
type DialogState =
  | { type: 'closed' }
  // Story dialogs
  | { type: 'story:edit'; story: Story }
  | { type: 'story:create'; taskId: string; releaseId: string | null }
  // Activity dialogs
  | { type: 'activity:edit'; activity: Activity }
  | { type: 'activity:create' }
  // Task dialogs
  | { type: 'task:edit'; task: Task }
  | { type: 'task:create'; activityId: string }
  // Release dialogs
  | { type: 'release:create' }
  | { type: 'release:rename'; releaseId: string; currentName: string }
  | { type: 'release:delete'; releaseId: string };

const CLOSED: DialogState = { type: 'closed' };

export default function StoryMapPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [storyMap, setStoryMap] = useState<StoryMapFull | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<DialogState>(CLOSED);

  const loadStoryMap = useCallback(async () => {
    try {
      const res = await fetch(`/api/story-maps/${id}`);
      if (!res.ok) throw new Error(await extractError(res, 'Failed to load story map'));
      setStoryMap(await res.json());
      setError(null);
    } catch (err) {
      setError(errorMessage(err));
    }
  }, [id]);

  useEffect(() => {
    loadStoryMap();
  }, [loadStoryMap]);

  const closeDialog = () => setDialog(CLOSED);

  // Story handlers
  const handleAddStory = (taskId: string, releaseId: string | null) => {
    setDialog({ type: 'story:create', taskId, releaseId });
  };

  const handleEditStory = (story: Story) => {
    setDialog({ type: 'story:edit', story });
  };

  async function handleSaveStory(storyData: Partial<Story>) {
    try {
      if (dialog.type === 'story:edit') {
        const res = await fetch(`/api/stories/${dialog.story.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(storyData),
        });
        if (!res.ok) throw new Error(await extractError(res, 'Failed to save story'));
      } else if (dialog.type === 'story:create') {
        const res = await fetch('/api/stories', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...storyData,
            task_id: dialog.taskId,
            release_id: dialog.releaseId,
          }),
        });
        if (!res.ok) throw new Error(await extractError(res, 'Failed to create story'));
      }
      closeDialog();
      loadStoryMap();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  async function handleDeleteStory() {
    if (dialog.type !== 'story:edit') return;
    try {
      const res = await fetch(`/api/stories/${dialog.story.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(await extractError(res, 'Failed to delete story'));
      closeDialog();
      loadStoryMap();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  // Activity handlers
  const handleAddActivity = () => {
    setDialog({ type: 'activity:create' });
  };

  const handleEditActivity = (activity: Activity) => {
    setDialog({ type: 'activity:edit', activity });
  };

  async function handleSaveActivity(data: { name: string }) {
    try {
      if (dialog.type === 'activity:edit') {
        const res = await fetch(`/api/activities/${dialog.activity.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        });
        if (!res.ok) throw new Error(await extractError(res, 'Failed to update activity'));
      } else if (dialog.type === 'activity:create') {
        const res = await fetch('/api/activities', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ story_map_id: id, name: data.name }),
        });
        if (!res.ok) throw new Error(await extractError(res, 'Failed to create activity'));
      }
      closeDialog();
      loadStoryMap();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  async function handleDeleteActivity() {
    if (dialog.type !== 'activity:edit') return;
    try {
      const res = await fetch(`/api/activities/${dialog.activity.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(await extractError(res, 'Failed to delete activity'));
      closeDialog();
      loadStoryMap();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  // Task handlers
  const handleAddTask = (activityId: string) => {
    setDialog({ type: 'task:create', activityId });
  };

  const handleEditTask = (task: Task) => {
    setDialog({ type: 'task:edit', task });
  };

  async function handleSaveTask(data: { name: string }) {
    try {
      if (dialog.type === 'task:edit') {
        const res = await fetch(`/api/tasks/${dialog.task.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        });
        if (!res.ok) throw new Error(await extractError(res, 'Failed to update task'));
      } else if (dialog.type === 'task:create') {
        const res = await fetch('/api/tasks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ activity_id: dialog.activityId, name: data.name }),
        });
        if (!res.ok) throw new Error(await extractError(res, 'Failed to create task'));
      }
      closeDialog();
      loadStoryMap();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  async function handleDeleteTask() {
    if (dialog.type !== 'task:edit') return;
    try {
      const res = await fetch(`/api/tasks/${dialog.task.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(await extractError(res, 'Failed to delete task'));
      closeDialog();
      loadStoryMap();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  // Release handlers
  const handleAddRelease = () => {
    setDialog({ type: 'release:create' });
  };

  const handleRenameRelease = (releaseId: string, currentName: string) => {
    setDialog({ type: 'release:rename', releaseId, currentName });
  };

  const handleDeleteRelease = (releaseId: string) => {
    setDialog({ type: 'release:delete', releaseId });
  };

  async function handlePromptSubmit(value: string) {
    try {
      switch (dialog.type) {
        case 'release:create': {
          const res = await fetch('/api/releases', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ story_map_id: id, name: value }),
          });
          if (!res.ok) throw new Error(await extractError(res, 'Failed to create release'));
          break;
        }
        case 'release:rename': {
          if (value === dialog.currentName) {
            closeDialog();
            return;
          }
          const res = await fetch(`/api/releases/${dialog.releaseId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: value }),
          });
          if (!res.ok) throw new Error(await extractError(res, 'Failed to rename release'));
          break;
        }
        default:
          return;
      }
      closeDialog();
      loadStoryMap();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Release reordering requires checking bounds and swapping - inherently branchy
  async function handleMoveRelease(releaseId: string, direction: 'up' | 'down') {
    if (!storyMap) return;
    const sortedReleases = [...storyMap.releases].sort((a, b) => a.sort_order - b.sort_order);
    const index = sortedReleases.findIndex((r) => r.id === releaseId);
    if (index === -1) return;
    if (direction === 'up' && index === 0) return;
    if (direction === 'down' && index === sortedReleases.length - 1) return;

    const swapIndex = direction === 'up' ? index - 1 : index + 1;
    const newOrder = sortedReleases.map((r) => r.id);
    [newOrder[index], newOrder[swapIndex]] = [newOrder[swapIndex], newOrder[index]];

    try {
      const res = await fetch('/api/releases', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ story_map_id: id, order: newOrder }),
      });
      if (!res.ok) throw new Error(await extractError(res, 'Failed to reorder releases'));
      loadStoryMap();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  async function handleConfirmDelete() {
    if (dialog.type !== 'release:delete') return;
    try {
      const res = await fetch(`/api/releases/${dialog.releaseId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(await extractError(res, 'Failed to delete release'));
      closeDialog();
      loadStoryMap();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  // Derive prompt dialog props from state
  function getPromptProps(): { title: string; placeholder: string; defaultValue: string } {
    switch (dialog.type) {
      case 'release:create':
        return { title: 'New Release', placeholder: 'Release name', defaultValue: '' };
      case 'release:rename':
        return {
          title: 'Rename Release',
          placeholder: 'Release name',
          defaultValue: dialog.currentName,
        };
      default:
        return { title: '', placeholder: '', defaultValue: '' };
    }
  }

  // Render states
  if (error) {
    return (
      <div className="flex h-[calc(100vh-var(--header-height))] items-center justify-center">
        <div className="text-center">
          <p className="text-destructive mb-4">{error}</p>
          <Button variant="outline" onClick={loadStoryMap}>
            Retry
          </Button>
        </div>
      </div>
    );
  }

  if (!storyMap) {
    return (
      <div className="flex h-[calc(100vh-var(--header-height))] items-center justify-center">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  const promptProps = getPromptProps();
  const isPromptOpen = dialog.type === 'release:create' || dialog.type === 'release:rename';

  return (
    <div className="flex h-[calc(100vh-var(--header-height))] flex-col">
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
        open={dialog.type === 'story:edit' || dialog.type === 'story:create'}
        onOpenChange={(open) => !open && closeDialog()}
        story={dialog.type === 'story:edit' ? dialog.story : null}
        releases={storyMap.releases}
        defaultReleaseId={dialog.type === 'story:create' ? dialog.releaseId : undefined}
        onSave={handleSaveStory}
        onDelete={dialog.type === 'story:edit' ? handleDeleteStory : undefined}
      />

      <PromptDialog
        open={isPromptOpen}
        onOpenChange={(open) => !open && closeDialog()}
        title={promptProps.title}
        placeholder={promptProps.placeholder}
        defaultValue={promptProps.defaultValue}
        onSubmit={handlePromptSubmit}
      />

      <ConfirmDialog
        open={dialog.type === 'release:delete'}
        onOpenChange={(open) => !open && closeDialog()}
        title="Delete Release"
        description="This will delete the release and all its stories. This cannot be undone."
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={handleConfirmDelete}
      />

      <ActivityDialog
        open={dialog.type === 'activity:edit' || dialog.type === 'activity:create'}
        onOpenChange={(open) => !open && closeDialog()}
        activity={dialog.type === 'activity:edit' ? dialog.activity : null}
        onSave={handleSaveActivity}
        onDelete={dialog.type === 'activity:edit' ? handleDeleteActivity : undefined}
      />

      <TaskDialog
        open={dialog.type === 'task:edit' || dialog.type === 'task:create'}
        onOpenChange={(open) => !open && closeDialog()}
        task={dialog.type === 'task:edit' ? dialog.task : null}
        onSave={handleSaveTask}
        onDelete={dialog.type === 'task:edit' ? handleDeleteTask : undefined}
      />
    </div>
  );
}
