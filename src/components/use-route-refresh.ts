'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef } from 'react';

interface UseRouteRefreshOptions {
  auto?: boolean;
  minIntervalMs?: number;
  pollMs?: number;
}

const DEFAULT_MIN_INTERVAL_MS = 1000;

export function useRouteRefresh(options?: UseRouteRefreshOptions) {
  const router = useRouter();
  const auto = options?.auto ?? false;
  const minIntervalMs = options?.minIntervalMs ?? DEFAULT_MIN_INTERVAL_MS;
  const pollMs = options?.pollMs ?? null;
  const lastRefreshAtRef = useRef(0);

  const refresh = useCallback(() => {
    const now = Date.now();
    if (now - lastRefreshAtRef.current < minIntervalMs) {
      return;
    }

    lastRefreshAtRef.current = now;
    router.refresh();
  }, [minIntervalMs, router]);

  useEffect(() => {
    if (!auto) return;

    const handleFocus = () => {
      refresh();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        refresh();
      }
    };

    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [auto, refresh]);

  useEffect(() => {
    if (!auto || !pollMs) return;

    const intervalId = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        refresh();
      }
    }, pollMs);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [auto, pollMs, refresh]);

  return refresh;
}
