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
    onNodesDelete,
    onEdgesDelete,
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
      <button type="button" onClick={() => onConnect({ source: 'node-1', target: 'node-2' })}>
        Connect Nodes
      </button>
      <button type="button" onClick={() => onNodeDragStop(null, { id: 'node-1', position: { x: 400, y: 320 } })}>
        Drag Node
      </button>
      <button type="button" onClick={() => onNodesDelete(nodes.filter((node: any) => node.id === 'node-2'))}>
        Bulk Delete Node
      </button>
      <button type="button" onClick={() => onEdgesDelete(edges.filter((edge: any) => edge.id === 'edge-2'))}>
        Bulk Delete Edge
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

function createFlow() {
  return {
    id: 'flow-1',
    team_id: 'team-1',
    name: 'Accounts Payable',
    description: 'Initial description',
    context_markdown: null,
    viewport: null,
    schema_version: 1,
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
    fetchJsonMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? 'GET';

      if (url.endsWith('/validation')) return { warnings: [{ code: 'warning', message: 'Heads up' }] };
      if (url.endsWith('/nodes') && method === 'POST') {
        return {
          id: 'node-2',
          process_flow_id: 'flow-1',
          type: 'step',
          position: { x: 30, y: 40 },
          size: null,
          data: { label: 'New step' },
        };
      }
      if (url.endsWith('/nodes') && method === 'PUT') {
        const body = init?.body ? JSON.parse(String(init.body)) : {};
        const deletes = Array.isArray(body.mutations)
          ? body.mutations.filter((mutation: { action?: string }) => mutation.action === 'delete')
          : [];
        const updates = Array.isArray(body.mutations)
          ? body.mutations.filter((mutation: { action?: string }) => mutation.action === 'update')
          : [];
        if (deletes.length > 0) {
          return {
            created: [],
            updated: [],
            deleted: deletes.map((mutation: { id: string }) => ({ id: mutation.id })),
          };
        }
        return {
          created: [],
          updated: updates.map(
            (mutation: {
              id: string;
              payload?: { data?: { label?: string }; position?: { x: number; y: number } };
            }) => ({
              id: mutation.id,
              process_flow_id: 'flow-1',
              type: 'step',
              position: mutation.payload?.position ?? { x: 10, y: 20 },
              size: null,
              data: { label: mutation.payload?.data?.label ?? 'Updated node' },
            }),
          ),
          deleted: [],
        };
      }
      if (url.endsWith('/edges') && method === 'PUT') {
        const body = init?.body ? JSON.parse(String(init.body)) : {};
        const deletes = Array.isArray(body.mutations)
          ? body.mutations.filter((mutation: { action?: string }) => mutation.action === 'delete')
          : [];
        return {
          created: [],
          updated:
            deletes.length > 0
              ? []
              : [
                  {
                    id: 'edge-1',
                    process_flow_id: 'flow-1',
                    type: 'flow',
                    source_node_id: 'node-1',
                    target_node_id: 'node-1',
                    data: { label: 'Updated edge' },
                  },
                ],
          deleted: deletes.map((mutation: { id: string }) => ({ id: mutation.id })),
        };
      }
      if (url.endsWith('/edges') && method === 'POST') {
        return {
          id: 'edge-2',
          process_flow_id: 'flow-1',
          type: 'flow',
          source_node_id: 'node-1',
          target_node_id: 'node-2',
          data: null,
        };
      }
      if (url.endsWith('/layout')) {
        return {
          nodes: [
            {
              id: 'node-1',
              process_flow_id: 'flow-1',
              type: 'step',
              position: { x: 100, y: 120 },
              size: null,
              data: { label: 'Receive invoice' },
            },
          ],
          edges: [],
        };
      }
      if (url.endsWith('/flow-1') && method === 'PUT') {
        const body = init?.body ? JSON.parse(String(init.body)) : {};
        return {
          id: 'flow-1',
          team_id: 'team-1',
          name: body.name ?? 'Accounts Payable',
          description: null,
          context_markdown: body.context_markdown ?? null,
        };
      }
      if (url.endsWith('/flow-1') && method === 'DELETE') {
        return { success: true };
      }
      return { warnings: [] };
    });
  });

  afterEach(() => {
    cleanup();
  });

  it('surfaces request failures as visible UI errors', async () => {
    const user = userEvent.setup();
    fetchJsonMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit, fallback?: string) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      if (url.endsWith('/validation')) return { warnings: [] };
      if (url.endsWith('/layout') && method === 'POST') {
        throw new Error(fallback ?? 'Failed to auto-layout process flow');
      }
      return {};
    });

    render(<ProcessFlowScreen initialProcessFlow={createFlow()} />);
    await user.click(screen.getByRole('button', { name: 'Auto-layout' }));

    await waitFor(() => {
      expect(screen.getByText('Failed to auto-layout process flow')).toBeTruthy();
    });
  });

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
      expect(fetchJsonMock).toHaveBeenCalledWith(
        '/api/process-flows/flow-1/edges',
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify({
            mutations: [
              {
                action: 'update',
                id: 'edge-1',
                payload: { type: 'flow', data: { label: 'Loop', condition: 'amount > $10,000' } },
              },
            ],
          }),
        }),
        'Failed to mutate process flow edges',
      );
    });

    await user.click(screen.getByRole('button', { name: 'Drag Node' }));
    await waitFor(() => {
      expect(fetchJsonMock).toHaveBeenCalledWith(
        '/api/process-flows/flow-1/nodes',
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify({
            mutations: [{ action: 'update', id: 'node-1', payload: { position: { x: 400, y: 320 } } }],
          }),
        }),
        'Failed to mutate process flow nodes',
      );
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
