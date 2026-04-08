/* @vitest-environment jsdom */

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useCopyToClipboard } from './use-copy-to-clipboard';

function CopyHarness({ value = 'copy me' }: { value?: string }) {
  const { copied, copy } = useCopyToClipboard(100);

  return (
    <button type="button" onClick={() => void copy(value)}>
      {copied ? 'Copied' : 'Copy'}
    </button>
  );
}

describe('useCopyToClipboard', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('copies text and resets copied state after the timeout', async () => {
    vi.useFakeTimers();
    const writeText = vi.fn().mockResolvedValue(undefined);

    Object.assign(globalThis, {
      navigator: {
        clipboard: {
          writeText,
        },
      },
    });

    render(<CopyHarness value="embed-link" />);

    fireEvent.click(screen.getByRole('button', { name: 'Copy' }));

    await act(async () => {
      await Promise.resolve();
    });

    expect(writeText).toHaveBeenCalledWith('embed-link');
    expect(screen.getByRole('button', { name: 'Copied' })).toBeTruthy();

    act(() => {
      vi.advanceTimersByTime(100);
    });

    expect(screen.getByRole('button', { name: 'Copy' })).toBeTruthy();
  });

  it('fails safely when clipboard access is unavailable', async () => {
    const user = userEvent.setup();

    Object.assign(globalThis, {
      navigator: {
        clipboard: undefined,
      },
    });

    render(<CopyHarness />);

    await user.click(screen.getByRole('button', { name: 'Copy' }));

    expect(screen.getByRole('button', { name: 'Copy' })).toBeTruthy();
  });
});
