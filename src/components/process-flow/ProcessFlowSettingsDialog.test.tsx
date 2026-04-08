/* @vitest-environment jsdom */

import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProcessFlowSettingsDialog } from './ProcessFlowSettingsDialog';

vi.mock('@/components/ui/settings-dialog', () => ({
  SettingsDialog: ({ open, tabs, activeTab, onTabChange, error }: any) =>
    open ? (
      <div>
        {error ? <div>{error}</div> : null}
        <button type="button" onClick={() => onTabChange('general')}>
          General
        </button>
        <button type="button" onClick={() => onTabChange('embed')}>
          Embed
        </button>
        <button type="button" onClick={() => onTabChange('danger')}>
          Danger
        </button>
        {tabs.find((tab: any) => tab.value === activeTab)?.content}
      </div>
    ) : null,
}));

vi.mock('@/components/ui/delete-button', () => ({
  DeleteButton: ({ onDelete, label }: { onDelete: () => void; label: string }) => (
    <button type="button" onClick={onDelete}>
      {label}
    </button>
  ),
}));

vi.mock('@/components/ui/danger-zone', () => ({
  DangerZone: ({ children, description }: { children: React.ReactNode; description: string }) => (
    <div>
      <p>{description}</p>
      {children}
    </div>
  ),
}));

describe('ProcessFlowSettingsDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('saves changed process flow settings and closes', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(undefined);
    const onOpenChange = vi.fn();

    render(
      <ProcessFlowSettingsDialog
        open
        onOpenChange={onOpenChange}
        processFlowName="Accounts Payable"
        processFlowDescription="Original description"
        onSave={onSave}
        onCreateShareLink={vi.fn()}
        onDelete={vi.fn()}
      />,
    );

    await user.clear(screen.getByLabelText('Name'));
    await user.type(screen.getByLabelText('Name'), 'Vendor Intake');
    await user.clear(screen.getByLabelText('Description'));
    await user.type(screen.getByLabelText('Description'), 'Updated description');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(onSave).toHaveBeenCalledWith({ name: 'Vendor Intake', description: 'Updated description' });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('shows save errors and supports deleting from the danger tab', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockRejectedValue(new Error('Save failed'));
    const onCreateShareLink = vi.fn().mockResolvedValue('https://app.example.com/embed/process-flows/token-123');
    const onDelete = vi.fn().mockResolvedValue(undefined);
    const onOpenChange = vi.fn();
    const writeText = vi.fn().mockResolvedValue(undefined);

    Object.assign(globalThis, {
      navigator: {
        clipboard: {
          writeText,
        },
      },
    });

    render(
      <ProcessFlowSettingsDialog
        open
        onOpenChange={onOpenChange}
        processFlowName="Accounts Payable"
        processFlowDescription={null}
        onSave={onSave}
        onCreateShareLink={onCreateShareLink}
        onDelete={onDelete}
      />,
    );

    await user.clear(screen.getByLabelText('Name'));
    await user.type(screen.getByLabelText('Name'), 'AP Flow');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Save failed')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Embed' }));
    await user.click(screen.getByRole('button', { name: 'Generate Link' }));

    expect(onCreateShareLink).toHaveBeenCalledTimes(1);
    expect((screen.getByLabelText('Embed Link') as HTMLInputElement).value).toBe(
      'https://app.example.com/embed/process-flows/token-123',
    );
    expect((screen.getByLabelText('Embed Code') as HTMLTextAreaElement).value).toContain(
      'src="https://app.example.com/embed/process-flows/token-123"',
    );

    await user.click(screen.getByRole('button', { name: 'Copy Link' }));
    await user.click(screen.getByRole('button', { name: 'Copy Code' }));

    expect(writeText).toHaveBeenNthCalledWith(1, 'https://app.example.com/embed/process-flows/token-123');
    expect(writeText).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('src="https://app.example.com/embed/process-flows/token-123"'),
    );

    await user.click(screen.getByRole('button', { name: 'Danger' }));
    await user.click(screen.getByRole('button', { name: 'Delete process flow' }));

    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
