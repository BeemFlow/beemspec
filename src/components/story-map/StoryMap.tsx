'use client';

import { ArrowLeft, Bot, FileText, Settings } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { ActivityDialog } from '@/components/story-map/ActivityDialog';
import { ContextMarkdownDialog } from '@/components/story-map/ContextMarkdownDialog';
import { McpSetupDialog } from '@/components/story-map/McpSetupDialog';
import { planStoryEditSave, type StoryEditSave } from '@/components/story-map/payloads';
import { StoryDialog } from '@/components/story-map/StoryDialog';
import { StoryMapCanvas } from '@/components/story-map/StoryMapCanvas';
import { StoryMapSettingsDialog } from '@/components/story-map/StoryMapSettingsDialog';
import { TaskDialog } from '@/components/story-map/TaskDialog';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { PromptDialog } from '@/components/ui/PromptDialog';
import { ScrollArea, ScrollBar } from '@/components/ui/ScrollArea';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/Tooltip';
import { errorMessage } from '@/lib/errors';
import { fetchJson } from '@/lib/http';
import type { Activity, Story, StoryMapFull, Task } from '@/types';

type DialogState =
  | { type: 'closed' }
  | { type: 'story:edit'; story: Story }
  | { type: 'story:create'; taskId: string; releaseId: string | null }
  | { type: 'activity:edit'; activity: Activity }
  | { type: 'activity:create' }
  | { type: 'task:edit'; task: Task }
  | { type: 'task:create'; activityId: string }
  | { type: 'release:create' }
  | { type: 'release:rename'; releaseId: string; currentName: string }
  | { type: 'release:delete'; releaseId: string };

const CLOSED: DialogState = { type: 'closed' };

export function StoryMap({ initialStoryMap }: { initialStoryMap: StoryMapFull }) {
  const router = useRouter();
  const [storyMap, setStoryMap] = useState<StoryMapFull | null>(initialStoryMap);
  const [uiError, setUiError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<DialogState>(CLOSED);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [mcpSetupOpen, setMcpSetupOpen] = useState(false);
  const [mapContextOpen, setMapContextOpen] = useState(false);
  const [releaseContextOpen, setReleaseContextOpen] = useState<{
    releaseId: string;
    releaseName: string;
    contextMarkdown: string | null;
  } | null>(null);

  useEffect(() => {
    setStoryMap(initialStoryMap);
  }, [initialStoryMap]);

  const refreshStoryMap = useCallback(() => {
    router.refresh();
  }, [router]);

  async function request(input: RequestInfo | URL, init: RequestInit | undefined, fallback: string) {
    await fetchJson(input, init, fallback);
  }

  const closeDialog = () => setDialog(CLOSED);

  const handleAddStory = (taskId: string, releaseId: string | null) => {
    setDialog({ type: 'story:create', taskId, releaseId });
  };

  const handleEditStory = (story: Story) => {
    setDialog({ type: 'story:edit', story });
  };

  async function handleSaveStory(storyData: StoryEditSave) {
    try {
      if (dialog.type === 'story:edit') {
        const { updates: storyUpdates, move } = planStoryEditSave(storyMap, dialog.story, storyData);
        if (Object.keys(storyUpdates).length > 0) {
          await request(
            `/api/stories/${dialog.story.id}`,
            {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(storyUpdates),
            },
            'Failed to save story',
          );
        }

        if (move) {
          await request(
            `/api/stories/${dialog.story.id}/move`,
            {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(move),
            },
            'Failed to move story',
          );
        }
      } else if (dialog.type === 'story:create') {
        await request(
          '/api/stories',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              ...storyData,
              task_id: dialog.taskId,
              release_id: dialog.releaseId,
            }),
          },
          'Failed to create story',
        );
      }
      closeDialog();
      refreshStoryMap();
    } catch (err) {
      setUiError(errorMessage(err));
    }
  }

  async function handleDeleteStory() {
    if (dialog.type !== 'story:edit') return;
    try {
      await request(`/api/stories/${dialog.story.id}`, { method: 'DELETE' }, 'Failed to delete story');
      closeDialog();
      refreshStoryMap();
    } catch (err) {
      setUiError(errorMessage(err));
    }
  }

  const handleAddActivity = () => {
    setDialog({ type: 'activity:create' });
  };

  const handleEditActivity = (activity: Activity) => {
    setDialog({ type: 'activity:edit', activity });
  };

  async function handleSaveActivity(data: { name: string }) {
    if (!storyMap) return;
    try {
      if (dialog.type === 'activity:edit') {
        await request(
          `/api/activities/${dialog.activity.id}`,
          {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
          },
          'Failed to update activity',
        );
      } else if (dialog.type === 'activity:create') {
        await request(
          '/api/activities',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ story_map_id: storyMap.id, name: data.name }),
          },
          'Failed to create activity',
        );
      }
      closeDialog();
      refreshStoryMap();
    } catch (err) {
      setUiError(errorMessage(err));
    }
  }

  async function handleDeleteActivity() {
    if (dialog.type !== 'activity:edit') return;
    try {
      await request(`/api/activities/${dialog.activity.id}`, { method: 'DELETE' }, 'Failed to delete activity');
      closeDialog();
      refreshStoryMap();
    } catch (err) {
      setUiError(errorMessage(err));
    }
  }

  const handleAddTask = (activityId: string) => {
    setDialog({ type: 'task:create', activityId });
  };

  const handleEditTask = (task: Task) => {
    setDialog({ type: 'task:edit', task });
  };

  async function handleSaveTask(data: { name: string }) {
    try {
      if (dialog.type === 'task:edit') {
        await request(
          `/api/tasks/${dialog.task.id}`,
          {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
          },
          'Failed to update task',
        );
      } else if (dialog.type === 'task:create') {
        await request(
          '/api/tasks',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ activity_id: dialog.activityId, name: data.name }),
          },
          'Failed to create task',
        );
      }
      closeDialog();
      refreshStoryMap();
    } catch (err) {
      setUiError(errorMessage(err));
    }
  }

  async function handleDeleteTask() {
    if (dialog.type !== 'task:edit') return;
    try {
      await request(`/api/tasks/${dialog.task.id}`, { method: 'DELETE' }, 'Failed to delete task');
      closeDialog();
      refreshStoryMap();
    } catch (err) {
      setUiError(errorMessage(err));
    }
  }

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
    if (!storyMap) return;
    try {
      switch (dialog.type) {
        case 'release:create': {
          await request(
            '/api/releases',
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ story_map_id: storyMap.id, name: value }),
            },
            'Failed to create release',
          );
          break;
        }
        case 'release:rename': {
          if (value === dialog.currentName) {
            closeDialog();
            return;
          }
          await request(
            `/api/releases/${dialog.releaseId}`,
            {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ name: value }),
            },
            'Failed to rename release',
          );
          break;
        }
        default:
          return;
      }
      closeDialog();
      refreshStoryMap();
    } catch (err) {
      setUiError(errorMessage(err));
    }
  }

  async function handleMoveRelease(releaseId: string, direction: 'up' | 'down') {
    if (!storyMap) return;
    const sortedReleases = [...storyMap.releases].sort((a, b) => a.sort_order - b.sort_order);
    const index = sortedReleases.findIndex((release) => release.id === releaseId);
    if (index === -1) return;
    if (direction === 'up' && index === 0) return;
    if (direction === 'down' && index === sortedReleases.length - 1) return;

    const swapIndex = direction === 'up' ? index - 1 : index + 1;
    const newOrder = sortedReleases.map((release) => release.id);
    [newOrder[index], newOrder[swapIndex]] = [newOrder[swapIndex], newOrder[index]];
    const releasesById = new Map(storyMap.releases.map((release) => [release.id, release]));
    const previousStoryMap = storyMap;
    const optimisticStoryMap: StoryMapFull = {
      ...storyMap,
      releases: newOrder
        .map((orderedReleaseId, orderedIndex) => {
          const release = releasesById.get(orderedReleaseId);
          return release ? { ...release, sort_order: orderedIndex } : null;
        })
        .filter((release): release is StoryMapFull['releases'][number] => release !== null),
    };

    try {
      setStoryMap(optimisticStoryMap);
      await request(
        '/api/releases',
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ story_map_id: storyMap.id, order: newOrder }),
        },
        'Failed to reorder releases',
      );
    } catch (err) {
      setStoryMap(previousStoryMap);
      setUiError(errorMessage(err));
    }
  }

  async function handleConfirmDelete() {
    if (dialog.type !== 'release:delete') return;
    try {
      await request(`/api/releases/${dialog.releaseId}`, { method: 'DELETE' }, 'Failed to delete release');
      closeDialog();
      refreshStoryMap();
    } catch (err) {
      setUiError(errorMessage(err));
    }
  }

  async function handleDeleteStoryMap() {
    if (!storyMap) return;
    try {
      await request(`/api/story-maps/${storyMap.id}`, { method: 'DELETE' }, 'Failed to delete story map');
      setSettingsOpen(false);
      router.push('/');
      router.refresh();
    } catch (err) {
      setUiError(errorMessage(err));
    }
  }

  async function handleSaveMapContext(value: string | null) {
    if (!storyMap) return;
    await fetchJson(
      `/api/story-maps/${storyMap.id}`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ context_markdown: value }),
      },
      'Failed to save story map context',
    );
    refreshStoryMap();
  }

  async function handleSaveReleaseContext(value: string | null) {
    if (!releaseContextOpen) return;
    await fetchJson(
      `/api/releases/${releaseContextOpen.releaseId}`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ context_markdown: value }),
      },
      'Failed to save release context',
    );
    refreshStoryMap();
  }

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

  const promptProps = getPromptProps();
  const isPromptOpen = dialog.type === 'release:create' || dialog.type === 'release:rename';

  if (!storyMap) return null;

  return (
    <div className="flex h-[calc(100vh-var(--header-height))] flex-col">
      <header className="flex items-center gap-2 border-b px-2 py-2 sm:gap-4 sm:px-4 sm:py-3">
        <Link href="/">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <h1 className="truncate text-base font-semibold sm:text-xl">{storyMap.name}</h1>
        <div className="ml-auto flex items-center gap-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setMapContextOpen(true)}
                aria-label="Story map context"
              >
                <FileText className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="left">Story map context</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" onClick={() => setMcpSetupOpen(true)} aria-label="Connect MCP Client">
                <Bot className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="left">Connect MCP Client</TooltipContent>
          </Tooltip>
          <Button variant="ghost" size="icon" onClick={() => setSettingsOpen(true)} aria-label="Story map settings">
            <Settings className="h-4 w-4" />
          </Button>
        </div>
      </header>

      {uiError && (
        <div className="mx-4 mt-3 flex items-center justify-between rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          <span>{uiError}</span>
          <Button size="sm" variant="ghost" onClick={() => setUiError(null)}>
            Dismiss
          </Button>
        </div>
      )}

      <ScrollArea className="flex-1">
        <div className="p-4">
          <StoryMapCanvas
            storyMap={storyMap}
            storyMapName={storyMap.name}
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
            onEditReleaseContext={(releaseId) => {
              const release = storyMap.releases.find((r) => r.id === releaseId);
              if (release) {
                setReleaseContextOpen({
                  releaseId: release.id,
                  releaseName: release.name,
                  contextMarkdown: release.context_markdown ?? null,
                });
              }
            }}
            onError={setUiError}
            onStoryMapChange={setStoryMap}
          />
        </div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>

      <StoryMapSettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        storyMapId={storyMap.id}
        storyMapName={storyMap.name}
        storyMapDescription={storyMap.description}
        onStoryMapUpdated={refreshStoryMap}
        onSyncComplete={refreshStoryMap}
        onDeleteStoryMap={handleDeleteStoryMap}
      />

      <McpSetupDialog
        open={mcpSetupOpen}
        onOpenChange={setMcpSetupOpen}
        appOrigin={typeof window === 'undefined' ? '' : window.location.origin}
      />

      <StoryDialog
        open={dialog.type === 'story:edit' || dialog.type === 'story:create'}
        onOpenChange={(open) => !open && closeDialog()}
        story={dialog.type === 'story:edit' ? dialog.story : null}
        releases={storyMap.releases}
        storyMapId={storyMap.id}
        storyMapName={storyMap.name}
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

      <ContextMarkdownDialog
        open={mapContextOpen}
        onOpenChange={setMapContextOpen}
        title={`${storyMap.name} — Context`}
        value={storyMap.context_markdown ?? null}
        onSave={handleSaveMapContext}
        variant="story-map"
      />

      <ContextMarkdownDialog
        open={releaseContextOpen !== null}
        onOpenChange={(open) => {
          if (!open) setReleaseContextOpen(null);
        }}
        title={`${releaseContextOpen?.releaseName ?? 'Release'} — Context`}
        value={releaseContextOpen?.contextMarkdown ?? null}
        onSave={handleSaveReleaseContext}
        variant="release"
      />
    </div>
  );
}
