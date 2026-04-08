/* @vitest-environment jsdom */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { AddButton } from './AddButton';

describe('AddButton', () => {
  it('renders horizontal add buttons and calls click handlers', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();

    render(<AddButton label="Add Story" onClick={onClick} />);

    const button = screen.getByRole('button', { name: /Add Story/i });
    await user.click(button);

    expect(button.textContent).toContain('Add Story');
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('renders vertical buttons with the rotated label text', () => {
    render(<AddButton label="Add Release" orientation="vertical" />);

    expect(screen.getByRole('button', { name: /Add Release/i })).toBeTruthy();
  });
});
