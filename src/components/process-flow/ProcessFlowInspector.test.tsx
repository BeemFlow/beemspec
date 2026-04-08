/* @vitest-environment jsdom */

import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProcessFlowInspector } from './ProcessFlowInspector';

vi.mock('@/components/ui/select', () => ({
  Select: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectValue: () => null,
  SelectContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectItem: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

describe('ProcessFlowInspector', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('shows the empty selection state', () => {
    render(
      <ProcessFlowInspector
        selection={{ kind: 'flow' }}
        onSaveNode={vi.fn()}
        onDeleteNode={vi.fn()}
        onSaveEdge={vi.fn()}
        onDeleteEdge={vi.fn()}
      />,
    );

    expect(screen.getByText('No Selection')).toBeTruthy();
    expect(screen.getByText('Click a node or edge to configure its settings.')).toBeTruthy();
  });

  it('saves normalized node payloads and supports deletion', async () => {
    const user = userEvent.setup();
    const onSaveNode = vi.fn().mockResolvedValue(undefined);
    const onDeleteNode = vi.fn().mockResolvedValue(undefined);

    render(
      <ProcessFlowInspector
        selection={{
          kind: 'node',
          node: {
            id: 'node-1',
            type: 'step',
            data: {
              label: 'Receive invoice',
              owner_role: 'Ops',
              systems: ['ERP'],
              inputs: ['Invoice'],
              outputs: ['Approved'],
              pain_points: null,
              notes: null,
              automation_opportunity: null,
              frequency: null,
              estimated_duration: null,
              time_constraint: null,
            },
          } as any,
        }}
        onSaveNode={onSaveNode}
        onDeleteNode={onDeleteNode}
        onSaveEdge={vi.fn()}
        onDeleteEdge={vi.fn()}
      />,
    );

    await user.clear(screen.getByLabelText('Systems'));
    await user.type(screen.getByLabelText('Systems'), 'ERP\nSlack');
    await user.type(screen.getByLabelText('Frequency'), '~200/day');
    await user.click(screen.getByRole('button', { name: 'Save Node' }));
    await user.click(screen.getByRole('button', { name: 'Delete' }));

    expect(onSaveNode).toHaveBeenCalledWith('node-1', {
      type: 'step',
      data: expect.objectContaining({
        label: 'Receive invoice',
        owner_role: 'Ops',
        systems: ['ERP', 'Slack'],
        inputs: ['Invoice'],
        outputs: ['Approved'],
        frequency: '~200/day',
      }),
    });
    expect(onDeleteNode).toHaveBeenCalledWith('node-1');
  });

  it('saves and deletes edge details', async () => {
    const user = userEvent.setup();
    const onSaveEdge = vi.fn().mockResolvedValue(undefined);
    const onDeleteEdge = vi.fn().mockResolvedValue(undefined);

    render(
      <ProcessFlowInspector
        selection={{
          kind: 'edge',
          edge: {
            id: 'edge-1',
            data: { edgeType: 'flow', label: 'Review', condition: '' },
            label: 'Review',
          } as any,
        }}
        onSaveNode={vi.fn()}
        onDeleteNode={vi.fn()}
        onSaveEdge={onSaveEdge}
        onDeleteEdge={onDeleteEdge}
      />,
    );

    await user.clear(screen.getByLabelText('Condition'));
    await user.type(screen.getByLabelText('Condition'), 'amount > $10,000');
    await user.click(screen.getByRole('button', { name: 'Save Edge' }));
    await user.click(screen.getByRole('button', { name: 'Delete' }));

    expect(onSaveEdge).toHaveBeenCalledWith('edge-1', {
      type: 'flow',
      data: { label: 'Review', condition: 'amount > $10,000' },
    });
    expect(onDeleteEdge).toHaveBeenCalledWith('edge-1');
  });
});
