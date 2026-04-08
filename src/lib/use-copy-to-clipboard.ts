'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export function useCopyToClipboard(resetAfterMs = 1500) {
  const [copied, setCopied] = useState(false);
  const timeoutRef = useRef<number | null>(null);

  const reset = useCallback(() => {
    if (timeoutRef.current) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    setCopied(false);
  }, []);

  useEffect(() => reset, [reset]);

  const copy = useCallback(
    async (value: string) => {
      if (typeof navigator === 'undefined' || !navigator.clipboard) {
        return false;
      }

      try {
        await navigator.clipboard.writeText(value);
        reset();
        setCopied(true);
        timeoutRef.current = window.setTimeout(() => {
          timeoutRef.current = null;
          setCopied(false);
        }, resetAfterMs);
        return true;
      } catch {
        return false;
      }
    },
    [reset, resetAfterMs],
  );

  return { copied, copy, reset };
}
