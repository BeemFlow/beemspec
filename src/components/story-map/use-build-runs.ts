import { useCallback, useEffect, useMemo, useState } from 'react';
import { errorMessage } from '@/lib/errors';
import { fetchJson } from '@/lib/http';
import type { Release } from '@/types';
import type {
  BuildReleaseResponse,
  BuildRunDetail,
  BuildRunStatus,
  BuildRunSummary,
  BuildRunsResponse,
  OpenCodeProject,
  RetryRunResponse,
} from './build-runs-types';

interface UseBuildRunsParams {
  releases: Release[];
  onError: (message: string) => void;
}

export function useBuildRuns({ releases, onError }: UseBuildRunsParams) {
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
  const [runLoading, setRunLoading] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const [buildingReleaseId, setBuildingReleaseId] = useState<string | null>(null);
  const [retryingRunId, setRetryingRunId] = useState<string | null>(null);
  const [syncingStoryId, setSyncingStoryId] = useState<string | null>(null);
  const [blockingStoryId, setBlockingStoryId] = useState<string | null>(null);
  const [buildingStoryId, setBuildingStoryId] = useState<string | null>(null);
  const [projects, setProjects] = useState<OpenCodeProject[]>([]);
  const [selectedProject, setSelectedProject] = useState<string | null>(null);

  useEffect(() => {
    fetchJson<OpenCodeProject[]>('/api/integrations/opencode/projects', undefined, 'Failed to load projects')
      .then((data) => {
        setProjects(data);
        if (data.length > 0 && !selectedProject) setSelectedProject(data[0].path);
      })
      .catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
        // Keep list pane in sync when detail endpoint lazily transitions
        // a run from running -> completed/failed.
        setRuns((current) =>
          current.map((run) =>
            run.id === payload.id
              ? {
                  ...run,
                  status: payload.status,
                  total_items: payload.total_items,
                  completed_items: payload.completed_items,
                  failed_items: payload.failed_items,
                  error: payload.error,
                  opencode_session_url: payload.opencode_session_url,
                  finished_at: payload.finished_at,
                }
              : run,
          ),
        );
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

  useEffect(() => {
    if (!selectedReleaseId) {
      setRuns([]);
      setSelectedRunId(null);
      setSelectedRun(null);
      return;
    }

    setOffset(0);
    void loadRuns(selectedReleaseId, { nextOffset: 0, nextFilter: statusFilter });
  }, [selectedReleaseId, statusFilter, loadRuns]);

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
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ workingDirectory: selectedProject }),
        },
        'Failed to build release',
      );
      await loadRuns(selectedReleaseId, { preferredRunId: result.run_id, nextOffset: 0 });
    } catch (err) {
      onError(errorMessage(err));
      await loadRuns(selectedReleaseId, { nextOffset: 0 });
    } finally {
      setBuildingReleaseId(null);
    }
  }, [loadRuns, onError, selectedProject, selectedReleaseId]);

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
      ]);
    } catch (err) {
      onError(errorMessage(err));
    } finally {
      setRetryingRunId(null);
    }
  }, [loadRunDetail, loadRuns, onError, selectedReleaseId, selectedRun]);

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
      } catch (err) {
        onError(errorMessage(err));
      } finally {
        setSyncingStoryId(null);
      }
    },
    [loadRunDetail, loadRuns, offset, onError, selectedReleaseId, selectedRunId],
  );

  const handleMarkBlocked = useCallback(
    async (storyId: string) => {
      const reason = window.prompt('Blocked reason');
      if (!reason || !reason.trim()) return;
      if (!selectedRunId || !selectedReleaseId) return;

      setBlockingStoryId(storyId);
      try {
        await fetchJson(
          '/api/integrations/opencode/blocked',
          {
            method: 'POST',
            body: JSON.stringify({ story_id: storyId, reason: reason.trim() }),
            headers: { 'content-type': 'application/json' },
          },
          'Failed to mark story blocked',
        );
        await Promise.all([loadRunDetail(selectedRunId), loadRuns(selectedReleaseId, { nextOffset: offset })]);
      } catch (err) {
        onError(errorMessage(err));
      } finally {
        setBlockingStoryId(null);
      }
    },
    [loadRunDetail, loadRuns, offset, onError, selectedReleaseId, selectedRunId],
  );

  const handleBuildStory = useCallback(
    async (storyId: string) => {
      if (!selectedReleaseId) return;

      setBuildingStoryId(storyId);
      try {
        const runQuery = selectedRunId ? `?build_run_id=${encodeURIComponent(selectedRunId)}` : '';
        const result = await fetchJson<{ run_id: string }>(
          `/api/stories/${storyId}/build${runQuery}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ workingDirectory: selectedProject }),
          },
          'Failed to build story',
        );

        await Promise.all([
          loadRuns(selectedReleaseId, { preferredRunId: result.run_id, nextOffset: 0 }),
          loadRunDetail(result.run_id),
        ]);
      } catch (err) {
        onError(errorMessage(err));
      } finally {
        setBuildingStoryId(null);
      }
    },
    [loadRunDetail, loadRuns, onError, selectedProject, selectedReleaseId, selectedRunId],
  );

  const handleRefresh = useCallback(() => {
    if (selectedReleaseId) {
      void loadRuns(selectedReleaseId, { nextOffset: offset });
    }
  }, [loadRuns, offset, selectedReleaseId]);

  const handlePreviousPage = useCallback(() => {
    if (selectedReleaseId) {
      void loadRuns(selectedReleaseId, { nextOffset: Math.max(offset - pageSize, 0) });
    }
  }, [loadRuns, offset, selectedReleaseId]);

  const handleNextPage = useCallback(() => {
    if (selectedReleaseId) {
      void loadRuns(selectedReleaseId, { nextOffset: offset + pageSize });
    }
  }, [loadRuns, offset, selectedReleaseId]);

  return {
    // Derived data
    sortedReleases,
    pageSize,

    // Release selection
    selectedReleaseId,
    setSelectedReleaseId,

    // Runs list
    runs,
    runsLoading,
    runsError,
    statusFilter,
    setStatusFilter,
    offset,
    hasNextPage,

    // Run detail
    selectedRunId,
    setSelectedRunId,
    selectedRun,
    runLoading,
    runError,

    // Loading indicators
    buildingReleaseId,
    retryingRunId,
    syncingStoryId,
    blockingStoryId,
    buildingStoryId,

    // Projects
    projects,
    selectedProject,
    setSelectedProject,

    // Handlers
    handleBuildRelease,
    handleRetryFailedItems,
    handleResyncStory,
    handleMarkBlocked,
    handleBuildStory,
    handleRefresh,
    handlePreviousPage,
    handleNextPage,
  };
}
