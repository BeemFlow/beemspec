/* @vitest-environment jsdom */

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProcessFlowScreen } from './ProcessFlowScreen';

const { fetchJsonMock, pushMock } = vi.hoisted(() => ({
  fetchJsonMock: vi.fn(),
  pushMock: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
}));

vi.mock('@/lib/http', () => ({ fetchJson: fetchJsonMock }));

vi.mock('@/components/EditorHeader', () => ({
  EditorHeader: ({ title, actions }: { title: string; actions: React.ReactNode }) => (
    <div>
      <h1>{title}</h1>
      {actions}
    </div>
  ),
}));

vi.mock('@/components/ui/select', () => ({
  Select: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectValue: () => null,
  SelectContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectItem: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('./ProcessFlowCanvas', () => ({
  ProcessFlowCanvas: ({
    nodes,
    edges,
    onCreateNode,
    onNodeClick,
    onEdgeClick,
    onConnect,
    onNodeDragStop,
    onPaneClick,
  }: any) => (
    <div>
      <div>nodes:{nodes.length}</div>
      <div>edges:{edges.length}</div>
      <div>node-labels:{nodes.map((node: any) => node.data.label).join(',')}</div>
      <div>edge-labels:{edges.map((edge: any) => edge.data?.label ?? '').join(',')}</div>
      <button type="button" onClick={() => onCreateNode('step')}>
        Create Node
      </button>
      <button type="button" onClick={() => onNodeClick(nodes[0]?.id)}>
        Select Node
      </button>
      <button type="button" onClick={() => onEdgeClick(edges[0]?.id)}>
        Select Edge
      </button>
      <button type="button" onClick={() => onConnect({ source: 'node-1', target: nodes[1]?.id })}>
        Connect Nodes
      </button>
      <button type="button" onClick={() => onNodeDragStop(null, { id: 'node-1', position: { x: 400, y: 320 } })}>
        Drag Node
      </button>
      <button type="button" onClick={onPaneClick}>
        Clear Selection
      </button>
    </div>
  ),
}));

vi.mock('./ProcessFlowSettingsDialog', () => ({
  ProcessFlowSettingsDialog: ({ open, onSave, onDelete }: any) =>
    open ? (
      <div>
        <button type="button" onClick={() => onSave({ name: 'Renamed flow' })}>
          Save Flow
        </button>
        <button type="button" onClick={onDelete}>
          Delete Flow
        </button>
      </div>
    ) : null,
}));

vi.mock('@/components/story-map/ContextMarkdownDialog', () => ({
  ContextMarkdownDialog: ({ open, onSave }: any) =>
    open ? (
      <button type="button" onClick={() => onSave('## Updated context')}>
        Save Context
      </button>
    ) : null,
}));

vi.mock('@/components/story-map/McpSetupDialog', () => ({
  McpSetupDialog: ({ open }: { open: boolean }) => (open ? <div>Connect BeemSpec MCP</div> : null),
}));

function createFlow() {
  return {
    id: 'flow-1',
    team_id: 'team-1',
    name: 'Accounts Payable',
    description: 'Initial description',
    context_markdown: null,
    viewport: null,
    schema_version: 1,
    diagram_revision: 1,
    validation: { warnings: [] },
    nodes: [
      {
        id: 'node-1',
        process_flow_id: 'flow-1',
        type: 'step',
        position: { x: 10, y: 20 },
        size: null,
        data: { label: 'Receive invoice' },
      },
    ],
    edges: [
      {
        id: 'edge-1',
        process_flow_id: 'flow-1',
        type: 'flow',
        source_node_id: 'node-1',
        target_node_id: 'node-1',
        data: { label: 'Loop' },
      },
    ],
  } as any;
}

describe('ProcessFlowScreen', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    let flow = createFlow();
    fetchJsonMock.mockImplementation(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === 'DELETE') return { success: true };
      const { canvas, expected_revision, ...changes } = JSON.parse(String(init?.body));
      expect(expected_revision).toBe(flow.diagram_revision);
      flow = { ...flow, ...changes, ...canvas, diagram_revision: expected_revision + 1 };
      return flow;
    });
  });

  afterEach(() => {
    cleanup();
  });

  it('surfaces request failures as visible UI errors', async () => {
    const user = userEvent.setup();
    fetchJsonMock.mockRejectedValue(new Error('Failed to update process flow'));

    render(<ProcessFlowScreen initialProcessFlow={createFlow()} />);
    await user.click(screen.getByRole('button', { name: 'Auto-layout' }));

    await waitFor(() => {
      expect(screen.getByText('Failed to update process flow')).toBeTruthy();
    });
  });

  it.each([
    { kind: 'Node', field: 'Label', draft: 'Review invoice', savedLabel: 'node-labels:Review invoice' },
    { kind: 'Edge', field: 'Label', draft: 'Requires review', savedLabel: 'edge-labels:Requires review' },
  ])(
    'keeps a $kind inspector draft after a failed save and lets it be retried',
    async ({ kind, field, draft, savedLabel }) => {
      const user = userEvent.setup();
      fetchJsonMock.mockRejectedValueOnce(new Error('Connection interrupted'));

      render(<ProcessFlowScreen initialProcessFlow={createFlow()} />);
      await user.click(screen.getByRole('button', { name: `Select ${kind}` }));
      const input = screen.getByLabelText<HTMLInputElement>(field);
      await user.clear(input);
      await user.type(input, draft);

      const save = screen.getByRole('button', { name: `Save ${kind}` });
      await user.click(save);
      await screen.findByText('Connection interrupted');
      expect(input.value).toBe(draft);

      await user.click(save);
      await screen.findByText(savedLabel);
      expect(screen.queryByText('Connection interrupted')).toBeNull();
    },
  );

  it('updates local screen state for connect, save, delete, drag, and selection flows', async () => {
    const user = userEvent.setup();

    render(<ProcessFlowScreen initialProcessFlow={createFlow()} />);

    await waitFor(() => {
      expect(screen.getByText('No Selection')).toBeTruthy();
    });

    await user.click(screen.getByRole('button', { name: 'Step' }));
    await waitFor(() => {
      expect(screen.getByText('nodes:2')).toBeTruthy();
      expect(screen.getByText('node-labels:Receive invoice,New step')).toBeTruthy();
      expect(screen.getByText('Node Details')).toBeTruthy();
      expect(screen.getByDisplayValue('New step')).toBeTruthy();
    });

    await user.click(screen.getByRole('button', { name: 'Connect Nodes' }));
    await waitFor(() => {
      expect(screen.getByText('edges:2')).toBeTruthy();
    });

    await user.click(screen.getByRole('button', { name: 'Select Node' }));
    await user.clear(screen.getByLabelText('Label'));
    await user.type(screen.getByLabelText('Label'), 'Updated node');
    await user.click(screen.getByRole('button', { name: 'Save Node' }));
    await waitFor(() => {
      expect(screen.getByText('node-labels:Updated node,New step')).toBeTruthy();
    });

    await user.click(screen.getByRole('button', { name: 'Select Edge' }));
    await user.clear(screen.getByLabelText('Condition'));
    await user.type(screen.getByLabelText('Condition'), 'amount > $10,000');
    await user.click(screen.getByRole('button', { name: 'Save Edge' }));
    await waitFor(() => {
      expect(screen.getByText('Edge Details')).toBeTruthy();
      const lastRequest = JSON.parse(String(fetchJsonMock.mock.lastCall?.[1].body));
      expect(lastRequest.canvas.edges[0].data).toMatchObject({ label: 'Loop', condition: 'amount > $10,000' });
    });

    await user.click(screen.getByRole('button', { name: 'Drag Node' }));
    await waitFor(() => {
      const lastRequest = JSON.parse(String(fetchJsonMock.mock.lastCall?.[1].body));
      expect(lastRequest.canvas.nodes[0].position).toEqual({ x: 400, y: 320 });
    });

    await user.click(screen.getByRole('button', { name: 'Clear Selection' }));
    await waitFor(() => {
      expect(screen.getByText('No Selection')).toBeTruthy();
    });

    await user.click(screen.getByRole('button', { name: 'Select Edge' }));
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    await waitFor(() => {
      expect(screen.getByText('edges:1')).toBeTruthy();
    });

    await user.click(screen.getByRole('button', { name: 'Select Node' }));
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    await waitFor(() => {
      expect(screen.getByText('nodes:1')).toBeTruthy();
      expect(screen.getByText('edges:0')).toBeTruthy();
      expect(screen.getByText('node-labels:New step')).toBeTruthy();
    });
  });
});
