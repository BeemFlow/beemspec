'use client';

import { FolderOpen, Loader2, RefreshCcw, Rocket, RotateCcw } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { Release } from '@/types';
import type { BuildRunDetail, BuildRunItem, BuildRunStatus, BuildRunSummary } from './build-runs-types';
import { useBuildRuns } from './use-build-runs';

interface Props {
  releases: Release[];
  onError: (message: string) => void;
}

function RecentRunsSection({
  runs,
  runsLoading,
  runsError,
  selectedRunId,
  onSelectRun,
}: {
  runs: BuildRunSummary[];
  runsLoading: boolean;
  runsError: string | null;
  selectedRunId: string | null;
  onSelectRun: (runId: string) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="text-xs font-medium text-muted-foreground">Recent runs</div>
      {runsLoading && <p className="text-sm text-muted-foreground">Loading runs...</p>}
      {!runsLoading && runsError && <p className="text-sm text-destructive">{runsError}</p>}
      {!runsLoading && !runsError && runs.length === 0 && (
        <p className="text-sm text-muted-foreground">No runs yet for this release.</p>
      )}
      {!runsLoading &&
        !runsError &&
        runs.map((run) => {
          const isSelected = run.id === selectedRunId;

          return (
            <button
              type="button"
              key={run.id}
              className={`w-full rounded-md border px-3 py-2 text-left text-sm transition-colors ${
                isSelected ? 'border-primary bg-primary/5' : 'hover:bg-muted/60'
              }`}
              onClick={() => onSelectRun(run.id)}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="font-medium">Run {shortId(run.id)}</div>
                <Badge variant={statusBadgeVariant(run.status)}>{run.status}</Badge>
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                {run.completed_items}/{run.total_items} synced, {run.failed_items} failed, created{' '}
                {formatTime(run.created_at)}
              </div>
            </button>
          );
        })}
    </div>
  );
}

function RunStatusFilters({
  value,
  onChange,
}: {
  value: 'all' | BuildRunStatus;
  onChange: (next: 'all' | BuildRunStatus) => void;
}) {
  const options: Array<'all' | BuildRunStatus> = ['all', 'running', 'failed', 'completed'];

  return (
    <div className="flex flex-wrap items-center gap-2">
      {options.map((option) => (
        <Button
          key={option}
          size="sm"
          variant={option === value ? 'default' : 'outline'}
          onClick={() => onChange(option)}
        >
          {option}
        </Button>
      ))}
    </div>
  );
}

function RunDetailSection({
  selectedRun,
  runLoading,
  runError,
  retryingRunId,
  syncingStoryId,
  blockingStoryId,
  buildingStoryId,
  onRetry,
  onResyncStory,
  onMarkBlocked,
  onBuildStory,
}: {
  selectedRun: BuildRunDetail | null;
  runLoading: boolean;
  runError: string | null;
  retryingRunId: string | null;
  syncingStoryId: string | null;
  blockingStoryId: string | null;
  buildingStoryId: string | null;
  onRetry: () => void;
  onResyncStory: (storyId: string) => void;
  onMarkBlocked: (storyId: string) => void;
  onBuildStory: (storyId: string) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="text-xs font-medium text-muted-foreground">Run detail</div>
        {selectedRun && selectedRun.failed_items > 0 && (
          <Button size="sm" variant="outline" onClick={onRetry} disabled={retryingRunId === selectedRun.id}>
            {retryingRunId === selectedRun.id ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RotateCcw className="mr-2 h-4 w-4" />
            )}
            Retry failed
          </Button>
        )}
      </div>

      {runLoading && <p className="text-sm text-muted-foreground">Loading run detail...</p>}
      {!runLoading && runError && <p className="text-sm text-destructive">{runError}</p>}
      {!runLoading && !runError && !selectedRun && (
        <p className="text-sm text-muted-foreground">Select a run to inspect item-level results.</p>
      )}

      {!runLoading && !runError && selectedRun && (
        <div className="space-y-2 rounded-md border p-3">
          <div className="flex items-center gap-2">
            <Badge variant={statusBadgeVariant(selectedRun.status)}>{selectedRun.status}</Badge>
            <span className="text-xs text-muted-foreground">Finished {formatTime(selectedRun.finished_at)}</span>
          </div>
          <div className="text-xs text-muted-foreground">
            {selectedRun.completed_items}/{selectedRun.total_items} synced, {selectedRun.failed_items} failed
          </div>
          {selectedRun.error && <div className="text-xs text-destructive">{selectedRun.error}</div>}

          <div className="max-h-56 space-y-1 overflow-auto pr-1">
            {selectedRun.items.map((item) => (
              <div key={item.id} className="rounded border px-2 py-1 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <code className="text-[11px] text-muted-foreground">
                    {item.story?.title ? item.story.title : `story ${shortId(item.story_id)}`}
                  </code>
                  <Badge variant={itemBadgeVariant(item.status)}>{item.status}</Badge>
                </div>
                {item.linear_issue_identifier && (
                  <a
                    className="mt-1 block text-[11px] text-primary underline-offset-2 hover:underline"
                    href={linearIssueUrl(item.linear_issue_identifier)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Linear issue {item.linear_issue_identifier}
                  </a>
                )}
                {selectedRun.opencode_session_url && (
                  <a
                    className="mt-1 block text-[11px] text-primary underline-offset-2 hover:underline"
                    href={selectedRun.opencode_session_url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    OpenCode session
                  </a>
                )}
                {item.retry_count > 0 && (
                  <div className="mt-1 text-[11px] text-muted-foreground">
                    retries {item.retry_count}, last {formatTime(item.last_retry_at)}
                  </div>
                )}
                <div className="mt-2 flex items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-6 px-2 text-[11px]"
                    disabled={buildingStoryId === item.story_id}
                    onClick={() => onBuildStory(item.story_id)}
                  >
                    {buildingStoryId === item.story_id ? 'Building...' : 'Build story'}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-6 px-2 text-[11px]"
                    disabled={syncingStoryId === item.story_id}
                    onClick={() => onResyncStory(item.story_id)}
                  >
                    {syncingStoryId === item.story_id ? 'Syncing...' : 'Re-sync'}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-6 px-2 text-[11px]"
                    disabled={blockingStoryId === item.story_id}
                    onClick={() => onMarkBlocked(item.story_id)}
                  >
                    {blockingStoryId === item.story_id ? 'Saving...' : 'Mark blocked'}
                  </Button>
                </div>
                {item.error && <div className="mt-1 text-destructive">{item.error}</div>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function statusBadgeVariant(status: BuildRunStatus): 'default' | 'secondary' | 'destructive' | 'outline' {
  switch (status) {
    case 'completed':
      return 'secondary';
    case 'failed':
      return 'destructive';
    case 'queued':
    case 'running':
      return 'outline';
    default:
      return 'outline';
  }
}

function itemBadgeVariant(status: BuildRunItem['status']): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (status === 'failed') return 'destructive';
  if (status === 'synced') return 'secondary';
  return 'outline';
}

function formatTime(value: string | null): string {
  if (!value) return '-';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '-';
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(parsed);
}

function shortId(value: string): string {
  return value.slice(0, 8);
}

function linearIssueUrl(identifier: string): string {
  return `https://linear.app/issue/${identifier}`;
}

export function BuildRunsPanel({ releases, onError }: Props) {
  const {
    sortedReleases,
    pageSize,
    selectedReleaseId,
    setSelectedReleaseId,
    runs,
    runsLoading,
    runsError,
    statusFilter,
    setStatusFilter,
    offset,
    hasNextPage,
    selectedRunId,
    setSelectedRunId,
    selectedRun,
    runLoading,
    runError,
    buildingReleaseId,
    retryingRunId,
    syncingStoryId,
    blockingStoryId,
    buildingStoryId,
    projects,
    selectedProject,
    setSelectedProject,
    handleBuildRelease,
    handleRetryFailedItems,
    handleResyncStory,
    handleMarkBlocked,
    handleBuildStory,
    handleRefresh,
    handlePreviousPage,
    handleNextPage,
  } = useBuildRuns({ releases, onError });

  if (sortedReleases.length === 0) return null;

  return (
    <Card className="mb-4 gap-4 py-4">
      <CardHeader className="px-4">
        <CardTitle className="text-sm">Build Runs</CardTitle>
        <CardDescription>Build releases and inspect run history, failures, and retries.</CardDescription>
      </CardHeader>

      <CardContent className="space-y-3 px-4">
        <div className="flex flex-wrap gap-2">
          {sortedReleases.map((release) => {
            const isSelected = release.id === selectedReleaseId;
            return (
              <Button
                key={release.id}
                size="sm"
                variant={isSelected ? 'default' : 'outline'}
                onClick={() => setSelectedReleaseId(release.id)}
              >
                {release.name}
              </Button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {projects.length > 0 && (
            <Select value={selectedProject ?? ''} onValueChange={setSelectedProject}>
              <SelectTrigger size="sm" className="w-[200px]">
                <FolderOpen className="mr-2 h-4 w-4 shrink-0" />
                <SelectValue placeholder="Select folder" />
              </SelectTrigger>
              <SelectContent>
                {projects.map((project) => (
                  <SelectItem key={project.id} value={project.path}>
                    {project.path.split('/').pop()}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          <Button
            size="sm"
            onClick={handleBuildRelease}
            disabled={!selectedReleaseId || buildingReleaseId === selectedReleaseId || !selectedProject}
          >
            {buildingReleaseId === selectedReleaseId ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Rocket className="mr-2 h-4 w-4" />
            )}
            Build Release
          </Button>

          <Button size="sm" variant="outline" onClick={handleRefresh} disabled={!selectedReleaseId || runsLoading}>
            <RefreshCcw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <RunStatusFilters value={statusFilter} onChange={setStatusFilter} />
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={offset === 0 || runsLoading || !selectedReleaseId}
              onClick={handlePreviousPage}
            >
              Previous
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={!hasNextPage || runsLoading || !selectedReleaseId}
              onClick={handleNextPage}
            >
              Next
            </Button>
          </div>
        </div>

        <div className="grid gap-3 lg:grid-cols-2">
          <RecentRunsSection
            runs={runs}
            runsLoading={runsLoading}
            runsError={runsError}
            selectedRunId={selectedRunId}
            onSelectRun={setSelectedRunId}
          />
          <RunDetailSection
            selectedRun={selectedRun}
            runLoading={runLoading}
            runError={runError}
            retryingRunId={retryingRunId}
            syncingStoryId={syncingStoryId}
            blockingStoryId={blockingStoryId}
            buildingStoryId={buildingStoryId}
            onRetry={handleRetryFailedItems}
            onResyncStory={handleResyncStory}
            onMarkBlocked={handleMarkBlocked}
            onBuildStory={handleBuildStory}
          />
        </div>
      </CardContent>
    </Card>
  );
}
