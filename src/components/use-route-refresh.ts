'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef } from 'react';

interface UseRouteRefreshOptions {
  auto?: boolean;
  minIntervalMs?: number;
  paused?: boolean;
  pollMs?: number;
}

const DEFAULT_MIN_INTERVAL_MS = 1000;

export function useRouteRefresh(options?: UseRouteRefreshOptions) {
  const router = useRouter();
  const auto = options?.auto ?? false;
  const minIntervalMs = options?.minIntervalMs ?? DEFAULT_MIN_INTERVAL_MS;
  const paused = options?.paused ?? false;
  const pollMs = options?.pollMs ?? null;
  const lastRefreshAtRef = useRef(0);

  const refresh = useCallback(() => {
    lastRefreshAtRef.current = Date.now();
    router.refresh();
  }, [router]);

  const refreshIfDue = useCallback(() => {
    const now = Date.now();
    if (now - lastRefreshAtRef.current < minIntervalMs) {
      return;
    }

    refresh();
  }, [minIntervalMs, refresh]);

  const canAutoRefresh = useCallback(() => {
    return !paused && document.visibilityState === 'visible' && document.hasFocus();
  }, [paused]);

  useEffect(() => {
    if (!auto) return;

    const handleFocus = () => {
      if (canAutoRefresh()) refreshIfDue();
    };

    const handleVisibilityChange = () => {
      if (canAutoRefresh()) refreshIfDue();
    };

    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [auto, canAutoRefresh, refreshIfDue]);

  useEffect(() => {
    if (!auto || !pollMs) return;

    const intervalId = window.setInterval(() => {
      if (!canAutoRefresh()) return;
      refreshIfDue();
    }, pollMs);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [auto, canAutoRefresh, pollMs, refreshIfDue]);

  return refresh;
}
