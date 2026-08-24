/* @vitest-environment jsdom */

import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useRouteRefresh } from './use-route-refresh';

const { refreshMock } = vi.hoisted(() => ({ refreshMock: vi.fn() }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: refreshMock }),
}));

function RefreshHarness({ paused = false }: { paused?: boolean }) {
  const refresh = useRouteRefresh({ auto: true, minIntervalMs: 0, paused, pollMs: 1000 });
  return (
    <button type="button" onClick={refresh}>
      Refresh
    </button>
  );
}

describe('useRouteRefresh', () => {
  let focused = true;
  let visibilityState: DocumentVisibilityState = 'visible';

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    vi.clearAllMocks();
    focused = true;
    visibilityState = 'visible';
    vi.spyOn(document, 'hasFocus').mockImplementation(() => focused);
    vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibilityState);
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('polls only while the page is focused, visible, and unpaused', () => {
    const { rerender } = render(<RefreshHarness />);

    act(() => vi.advanceTimersByTime(1000));
    expect(refreshMock).toHaveBeenCalledTimes(1);

    focused = false;
    act(() => vi.advanceTimersByTime(2000));
    expect(refreshMock).toHaveBeenCalledTimes(1);

    focused = true;
    visibilityState = 'hidden';
    act(() => vi.advanceTimersByTime(2000));
    expect(refreshMock).toHaveBeenCalledTimes(1);

    visibilityState = 'visible';
    rerender(<RefreshHarness paused />);
    act(() => vi.advanceTimersByTime(2000));
    expect(refreshMock).toHaveBeenCalledTimes(1);
  });

  it('keeps polling while the user interacts with the canvas', () => {
    render(<RefreshHarness />);

    act(() => {
      vi.advanceTimersByTime(500);
      window.dispatchEvent(new PointerEvent('pointerdown'));
      window.dispatchEvent(new Event('scroll'));
      vi.advanceTimersByTime(500);
    });
    expect(refreshMock).toHaveBeenCalledTimes(1);
  });

  it('still allows explicit refreshes while automatic refresh is paused', () => {
    const { getByRole } = render(<RefreshHarness paused />);

    act(() => getByRole('button', { name: 'Refresh' }).click());

    expect(refreshMock).toHaveBeenCalledTimes(1);
  });
});
