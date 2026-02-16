'use client';

import { Loader2, RefreshCcw, Rocket, RotateCcw } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { errorMessage } from '@/lib/errors';
import { fetchJson } from '@/lib/http';
import type { Release } from '@/types';

type BuildRunStatus = 'queued' | 'running' | 'completed' | 'failed';

interface BuildRunSummary {
  id: string;
  release_id: string;
  status: BuildRunStatus;
  total_items: number;
  completed_items: number;
  failed_items: number;
  error: string | null;
  started_at: string;
  finished_at: string | null;
  created_at: string;
}

interface BuildRunItem {
  id: string;
  story_id: string;
  linear_issue_id: string | null;
  linear_issue_identifier: string | null;
  opencode_session_id: string | null;
  opencode_session_url: string | null;
  status: 'pending' | 'synced' | 'failed';
  error: string | null;
  retry_count: number;
  last_retry_at: string | null;
  story?: { title: string; status: string } | null;
  created_at: string;
  updated_at: string;
}

interface BuildRunDetail extends BuildRunSummary {
  items: BuildRunItem[];
}

interface BuildRunsResponse {
  limit: number;
  offset: number;
  next_offset: number | null;
  runs: BuildRunSummary[];
}

interface ReleaseStoryState {
  story_id: string;
  story_title: string;
  story_status: string;
  latest_run: {
    run_id: string;
    run_status: string;
    item_status: string;
    item_error: string | null;
    opencode_session_url: string | null;
  } | null;
}

interface ReleaseStoryStatesResponse {
  story_states: ReleaseStoryState[];
}

interface BuildReleaseResponse {
  run_id: string;
}

interface RetryRunResponse {
  run_id: string;
}

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
                {run.completed_items}/{run.total_items} synced, {run.failed_items} failed, started{' '}
                {formatTime(run.started_at)}
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
                {item.opencode_session_url && (
                  <a
                    className="mt-1 block text-[11px] text-primary underline-offset-2 hover:underline"
                    href={item.opencode_session_url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    OpenCode session {shortId(item.opencode_session_id ?? '')}
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
  const pageSize = 20;
  const sortedReleases = useMemo(
    () => [...releases].sort((left, right) => left.sort_order - right.sort_order),
    [releases],
  );

  const [selectedReleaseId, setSelectedReleaseId] = useState<string | null>(sortedReleases[0]?.id ?? null);
  const [runs, setRuns] = useState<BuildRunSummary[]>([]);
  const [runsLoading, setRunsLoading] = useState(false);
  const [runsError, setRunsError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<'all' | BuildRunStatus>('all');
  const [offset, setOffset] = useState(0);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [selectedRun, setSelectedRun] = useState<BuildRunDetail | null>(null);
  const [storyStates, setStoryStates] = useState<ReleaseStoryState[]>([]);
  const [storyStatesLoading, setStoryStatesLoading] = useState(false);
  const [runLoading, setRunLoading] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const [buildingReleaseId, setBuildingReleaseId] = useState<string | null>(null);
  const [retryingRunId, setRetryingRunId] = useState<string | null>(null);
  const [syncingStoryId, setSyncingStoryId] = useState<string | null>(null);
  const [blockingStoryId, setBlockingStoryId] = useState<string | null>(null);
  const [buildingStoryId, setBuildingStoryId] = useState<string | null>(null);

  useEffect(() => {
    if (sortedReleases.length === 0) {
      setSelectedReleaseId(null);
      return;
    }

    if (!selectedReleaseId || !sortedReleases.some((release) => release.id === selectedReleaseId)) {
      setSelectedReleaseId(sortedReleases[0].id);
    }
  }, [sortedReleases, selectedReleaseId]);

  const loadRuns = useCallback(
    async (
      releaseId: string,
      input?: { preferredRunId?: string; nextOffset?: number; nextFilter?: 'all' | BuildRunStatus },
    ) => {
      setRunsLoading(true);
      setRunsError(null);

      const resolvedOffset = input?.nextOffset ?? offset;
      const resolvedFilter = input?.nextFilter ?? statusFilter;
      const query = new URLSearchParams({ limit: String(pageSize), offset: String(resolvedOffset) });
      if (resolvedFilter !== 'all') query.set('status', resolvedFilter);

      try {
        const payload = await fetchJson<BuildRunsResponse>(
          `/api/releases/${releaseId}/runs?${query.toString()}`,
          undefined,
          'Failed to load build runs',
        );
        const nextRuns = payload.runs ?? [];
        setRuns(nextRuns);
        setOffset(payload.offset ?? resolvedOffset);
        setHasNextPage(payload.next_offset !== null);

        setSelectedRunId((current) => {
          if (input?.preferredRunId && nextRuns.some((run) => run.id === input.preferredRunId)) {
            return input.preferredRunId;
          }
          if (current && nextRuns.some((run) => run.id === current)) {
            return current;
          }
          return nextRuns[0]?.id ?? null;
        });
      } catch (err) {
        const message = errorMessage(err);
        setRunsError(message);
        onError(message);
      } finally {
        setRunsLoading(false);
      }
    },
    [offset, onError, statusFilter],
  );

  const loadRunDetail = useCallback(
    async (runId: string) => {
      setRunLoading(true);
      setRunError(null);

      try {
        const payload = await fetchJson<BuildRunDetail>(
          `/api/build-runs/${runId}`,
          undefined,
          'Failed to load build run detail',
        );
        setSelectedRun(payload);
      } catch (err) {
        const message = errorMessage(err);
        setRunError(message);
        onError(message);
      } finally {
        setRunLoading(false);
      }
    },
    [onError],
  );

  const loadStoryStates = useCallback(
    async (releaseId: string) => {
      setStoryStatesLoading(true);
      try {
        const payload = await fetchJson<ReleaseStoryStatesResponse>(
          `/api/releases/${releaseId}/story-states`,
          undefined,
          'Failed to load release story states',
        );
        setStoryStates(payload.story_states ?? []);
      } catch (err) {
        onError(errorMessage(err));
      } finally {
        setStoryStatesLoading(false);
      }
    },
    [onError],
  );

  useEffect(() => {
    if (!selectedReleaseId) {
      setRuns([]);
      setSelectedRunId(null);
      setSelectedRun(null);
      return;
    }

    setOffset(0);
    void loadRuns(selectedReleaseId, { nextOffset: 0, nextFilter: statusFilter });
    void loadStoryStates(selectedReleaseId);
  }, [selectedReleaseId, statusFilter, loadRuns, loadStoryStates]);

  useEffect(() => {
    if (!selectedRunId) {
      setSelectedRun(null);
      setRunError(null);
      return;
    }

    void loadRunDetail(selectedRunId);
  }, [selectedRunId, loadRunDetail]);

  const handleBuildRelease = useCallback(async () => {
    if (!selectedReleaseId) return;

    setBuildingReleaseId(selectedReleaseId);
    try {
      const result = await fetchJson<BuildReleaseResponse>(
        `/api/releases/${selectedReleaseId}/build`,
        { method: 'POST' },
        'Failed to build release',
      );
      await loadRuns(selectedReleaseId, { preferredRunId: result.run_id, nextOffset: 0 });
    } catch (err) {
      onError(errorMessage(err));
      await loadRuns(selectedReleaseId, { nextOffset: 0 });
    } finally {
      setBuildingReleaseId(null);
    }
  }, [loadRuns, onError, selectedReleaseId]);

  const handleRetryFailedItems = useCallback(async () => {
    if (!selectedRun || !selectedReleaseId) return;

    setRetryingRunId(selectedRun.id);
    try {
      const result = await fetchJson<RetryRunResponse>(
        `/api/build-runs/${selectedRun.id}/retry`,
        { method: 'POST' },
        'Failed to retry build run items',
      );
      await Promise.all([
        loadRuns(selectedReleaseId, { preferredRunId: result.run_id, nextOffset: 0 }),
        loadRunDetail(result.run_id),
        loadStoryStates(selectedReleaseId),
      ]);
    } catch (err) {
      onError(errorMessage(err));
    } finally {
      setRetryingRunId(null);
    }
  }, [loadRunDetail, loadRuns, loadStoryStates, onError, selectedReleaseId, selectedRun]);

  const handleResyncStory = useCallback(
    async (storyId: string) => {
      if (!selectedRunId || !selectedReleaseId) return;

      setSyncingStoryId(storyId);
      try {
        await fetchJson(
          `/api/stories/${storyId}/sync-linear`,
          { method: 'POST' },
          'Failed to manually sync story to Linear',
        );
        await Promise.all([loadRunDetail(selectedRunId), loadRuns(selectedReleaseId, { nextOffset: offset })]);
        await loadStoryStates(selectedReleaseId);
      } catch (err) {
        onError(errorMessage(err));
      } finally {
        setSyncingStoryId(null);
      }
    },
    [loadRunDetail, loadRuns, loadStoryStates, offset, onError, selectedReleaseId, selectedRunId],
  );

  const handleMarkBlocked = useCallback(
    async (storyId: string) => {
      const reason = window.prompt('Blocked reason');
      if (!reason || !reason.trim()) return;
      if (!selectedRunId || !selectedReleaseId) return;

      setBlockingStoryId(storyId);
      try {
        await fetchJson(
          '/api/opencode/blocked',
          {
            method: 'POST',
            body: JSON.stringify({ story_id: storyId, reason: reason.trim() }),
            headers: { 'content-type': 'application/json' },
          },
          'Failed to mark story blocked',
        );
        await Promise.all([loadRunDetail(selectedRunId), loadRuns(selectedReleaseId, { nextOffset: offset })]);
        await loadStoryStates(selectedReleaseId);
      } catch (err) {
        onError(errorMessage(err));
      } finally {
        setBlockingStoryId(null);
      }
    },
    [loadRunDetail, loadRuns, loadStoryStates, offset, onError, selectedReleaseId, selectedRunId],
  );

  const handleBuildStory = useCallback(
    async (storyId: string) => {
      if (!selectedReleaseId) return;

      setBuildingStoryId(storyId);
      try {
        const runQuery = selectedRunId ? `?build_run_id=${encodeURIComponent(selectedRunId)}` : '';
        const result = await fetchJson<{ run_id: string }>(
          `/api/stories/${storyId}/build${runQuery}`,
          { method: 'POST' },
          'Failed to build story',
        );

        await Promise.all([
          loadRuns(selectedReleaseId, { preferredRunId: result.run_id, nextOffset: 0 }),
          loadRunDetail(result.run_id),
          loadStoryStates(selectedReleaseId),
        ]);
      } catch (err) {
        onError(errorMessage(err));
      } finally {
        setBuildingStoryId(null);
      }
    },
    [loadRunDetail, loadRuns, loadStoryStates, onError, selectedReleaseId, selectedRunId],
  );

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
          <Button
            size="sm"
            onClick={handleBuildRelease}
            disabled={!selectedReleaseId || buildingReleaseId === selectedReleaseId}
          >
            {buildingReleaseId === selectedReleaseId ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Rocket className="mr-2 h-4 w-4" />
            )}
            Build Release
          </Button>

          <Button
            size="sm"
            variant="outline"
            onClick={() => selectedReleaseId && void loadRuns(selectedReleaseId, { nextOffset: offset })}
            disabled={!selectedReleaseId || runsLoading}
          >
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
              onClick={() =>
                selectedReleaseId && void loadRuns(selectedReleaseId, { nextOffset: Math.max(offset - pageSize, 0) })
              }
            >
              Previous
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={!hasNextPage || runsLoading || !selectedReleaseId}
              onClick={() => selectedReleaseId && void loadRuns(selectedReleaseId, { nextOffset: offset + pageSize })}
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

        <div className="space-y-2 rounded-md border p-3">
          <div className="text-xs font-medium text-muted-foreground">Latest story execution state</div>
          {storyStatesLoading && <p className="text-sm text-muted-foreground">Loading story states...</p>}
          {!storyStatesLoading && storyStates.length === 0 && (
            <p className="text-sm text-muted-foreground">No stories in this release.</p>
          )}
          {!storyStatesLoading && storyStates.length > 0 && (
            <div className="max-h-56 space-y-1 overflow-auto pr-1">
              {storyStates.map((state) => (
                <div key={state.story_id} className="rounded border px-2 py-1 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-medium">{state.story_title}</div>
                    <Badge variant={state.latest_run?.item_status === 'failed' ? 'destructive' : 'outline'}>
                      {state.latest_run?.item_status ?? 'not_run'}
                    </Badge>
                  </div>
                  <div className="mt-1 text-[11px] text-muted-foreground">
                    story status {state.story_status}, run {state.latest_run?.run_status ?? 'none'}
                  </div>
                  {state.latest_run?.item_error && (
                    <div className="mt-1 text-destructive">{state.latest_run.item_error}</div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
