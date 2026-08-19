/* @vitest-environment jsdom */

import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProcessFlowToolbar } from './ProcessFlowToolbar';

vi.mock('@/components/EditorHeader', () => ({
  EditorHeader: ({ title, actions }: { title: string; actions: React.ReactNode }) => (
    <div>
      <h1>{title}</h1>
      {actions}
    </div>
  ),
}));

describe('ProcessFlowToolbar', () => {
  afterEach(() => {
    cleanup();
  });

  it('fires action handlers for the main process-flow controls', async () => {
    const user = userEvent.setup();
    const onCreateNode = vi.fn();
    const onAutolayout = vi.fn();
    const onToggleValidation = vi.fn();
    const onOpenContext = vi.fn();
    const onOpenMcpSetup = vi.fn();
    const onRefresh = vi.fn();
    const onOpenSettings = vi.fn();

    render(
      <ProcessFlowToolbar
        name="Accounts Payable"
        warningCount={2}
        validationOpen={false}
        onCreateNode={onCreateNode}
        onAutolayout={onAutolayout}
        onToggleValidation={onToggleValidation}
        onOpenContext={onOpenContext}
        onOpenMcpSetup={onOpenMcpSetup}
        onRefresh={onRefresh}
        onOpenSettings={onOpenSettings}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Accounts Payable' })).toBeTruthy();
    expect(screen.getByTestId('processflow-warning-count').textContent).toBe('2');

    await user.click(screen.getByRole('button', { name: 'Step' }));
    await user.click(screen.getByRole('button', { name: 'Decision' }));
    await user.click(screen.getByRole('button', { name: 'Actor' }));
    await user.click(screen.getByRole('button', { name: 'System' }));
    await user.click(screen.getByRole('button', { name: 'Note' }));
    await user.click(screen.getByRole('button', { name: 'Auto-layout' }));
    await user.click(screen.getByRole('button', { name: 'Validate' }));
    await user.click(screen.getByRole('button', { name: 'Process flow context' }));
    await user.click(screen.getByRole('button', { name: 'Connect MCP Client' }));
    await user.click(screen.getByRole('button', { name: 'Refresh process flow' }));
    await user.click(screen.getByRole('button', { name: 'Process flow settings' }));

    expect(onCreateNode.mock.calls).toEqual([['step'], ['decision'], ['actor'], ['system'], ['note']]);
    expect(onAutolayout).toHaveBeenCalledTimes(1);
    expect(onToggleValidation).toHaveBeenCalledTimes(1);
    expect(onOpenContext).toHaveBeenCalledTimes(1);
    expect(onOpenMcpSetup).toHaveBeenCalledTimes(1);
    expect(onRefresh).toHaveBeenCalledTimes(1);
    expect(onOpenSettings).toHaveBeenCalledTimes(1);
  });

  it('hides the warning badge when there are no validation warnings', () => {
    render(
      <ProcessFlowToolbar
        name="Accounts Payable"
        warningCount={0}
        validationOpen={false}
        onCreateNode={vi.fn()}
        onAutolayout={vi.fn()}
        onToggleValidation={vi.fn()}
        onOpenContext={vi.fn()}
        onOpenMcpSetup={vi.fn()}
        onRefresh={vi.fn()}
        onOpenSettings={vi.fn()}
      />,
    );

    expect(screen.queryByTestId('processflow-warning-count')).toBeNull();
  });
});
