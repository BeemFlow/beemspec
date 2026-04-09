/* @vitest-environment jsdom */

import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProcessFlowCanvas } from './ProcessFlowCanvas';

const { reactFlowProps } = vi.hoisted(() => ({
  reactFlowProps: { current: null as null | Record<string, unknown> },
}));

vi.mock('@xyflow/react', () => ({
  MarkerType: { ArrowClosed: 'arrowclosed' },
  ReactFlow: (props: Record<string, unknown>) => {
    reactFlowProps.current = props;
    return <div>{props.children as React.ReactNode}</div>;
  },
  Background: () => <div>Background</div>,
  MiniMap: ({ nodeColor }: { nodeColor: (node: { type?: string }) => string }) => (
    <div>MiniMap:{nodeColor({ type: 'decision' })}</div>
  ),
  Controls: () => <div>Controls</div>,
}));

vi.mock('./ProcessFlowNode', () => ({
  processFlowNodeTypes: { step: () => null },
}));

afterEach(() => {
  cleanup();
});

describe('ProcessFlowCanvas', () => {
  it('shows the empty-state creation actions when no nodes exist', async () => {
    const user = userEvent.setup();
    const onCreateNode = vi.fn();

    render(
      <ProcessFlowCanvas
        nodes={[]}
        edges={[]}
        onNodesChange={vi.fn()}
        onEdgesChange={vi.fn()}
        onNodeDragStop={vi.fn()}
        onConnect={vi.fn()}
        onNodeClick={vi.fn()}
        onEdgeClick={vi.fn()}
        onPaneClick={vi.fn()}
        onNodesDelete={vi.fn()}
        onEdgesDelete={vi.fn()}
        onCreateNode={onCreateNode}
      />,
    );

    expect(screen.getByText('Start mapping the flow')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Add actor' }));
    await user.click(screen.getByRole('button', { name: 'Add decision' }));

    expect(onCreateNode).toHaveBeenCalledWith('actor');
    expect(onCreateNode).toHaveBeenCalledWith('decision');
  });

  it('wires ReactFlow callbacks and edge defaults to the parent handlers', () => {
    const onNodesChange = vi.fn();
    const onEdgesChange = vi.fn();
    const onNodeDragStop = vi.fn();
    const onConnect = vi.fn();
    const onNodeClick = vi.fn();
    const onEdgeClick = vi.fn();
    const onPaneClick = vi.fn();
    const onNodesDelete = vi.fn();
    const onEdgesDelete = vi.fn();

    const { container } = render(
      <ProcessFlowCanvas
        nodes={[
          {
            id: 'node-1',
            type: 'step',
            position: { x: 10, y: 20 },
            data: { label: 'Receive invoice', nodeType: 'step' },
          } as never,
        ]}
        edges={[{ id: 'edge-1', source: 'node-1', target: 'node-2', data: { label: 'Review' } } as never]}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeDragStop={onNodeDragStop}
        onConnect={onConnect}
        onNodeClick={onNodeClick}
        onEdgeClick={onEdgeClick}
        onPaneClick={onPaneClick}
        onNodesDelete={onNodesDelete}
        onEdgesDelete={onEdgesDelete}
        onCreateNode={vi.fn()}
      />,
    );

    const props = reactFlowProps.current as Record<string, any>;
    expect(props.nodes).toHaveLength(1);
    expect(props.edges).toHaveLength(1);
    expect(props.deleteKeyCode).toEqual(['Backspace', 'Delete']);
    expect(props.defaultEdgeOptions).toMatchObject({
      type: 'smoothstep',
      markerEnd: { type: 'arrowclosed' },
    });
    expect(props.fitViewOptions).toEqual({
      padding: {
        top: '18%',
        right: '48%',
        bottom: '18%',
        left: '10%',
      },
      maxZoom: 0.64,
      nodes: [{ id: 'node-1' }],
    });
    expect(container.textContent).toContain('MiniMap:#92400e');

    props.onNodesChange?.(['node-change']);
    props.onEdgesChange?.(['edge-change']);
    props.onNodeDragStop?.('event', { id: 'node-1' });
    props.onConnect?.({ source: 'node-1', target: 'node-2' });
    props.onNodeClick?.('event', { id: 'node-1' });
    props.onEdgeClick?.('event', { id: 'edge-1' });
    props.onPaneClick?.();
    props.onNodesDelete?.([{ id: 'node-1' }]);
    props.onEdgesDelete?.([{ id: 'edge-1' }]);

    expect(onNodesChange).toHaveBeenCalledWith(['node-change']);
    expect(onEdgesChange).toHaveBeenCalledWith(['edge-change']);
    expect(onNodeDragStop).toHaveBeenCalledWith('event', { id: 'node-1' });
    expect(onConnect).toHaveBeenCalledWith({ source: 'node-1', target: 'node-2' });
    expect(onNodeClick).toHaveBeenCalledWith('node-1');
    expect(onEdgeClick).toHaveBeenCalledWith('edge-1');
    expect(onPaneClick).toHaveBeenCalledTimes(1);
    expect(onNodesDelete).toHaveBeenCalledWith([{ id: 'node-1' }]);
    expect(onEdgesDelete).toHaveBeenCalledWith([{ id: 'edge-1' }]);
  });

  it('disables editor-only chrome and interactions in viewer mode', () => {
    render(<ProcessFlowCanvas mode="viewer" nodes={[]} edges={[]} />);

    const props = reactFlowProps.current as Record<string, any>;
    expect(props.deleteKeyCode).toBeNull();
    expect(props.nodesDraggable).toBe(false);
    expect(props.nodesConnectable).toBe(false);
    expect(props.elementsSelectable).toBe(false);
    expect(screen.queryByText('Controls')).toBeNull();
    expect(screen.queryByText(/MiniMap:/)).toBeNull();
    expect(screen.queryByText('Start mapping the flow')).toBeNull();
  });

  it('can show the minimap in viewer mode when requested', () => {
    const { container } = render(<ProcessFlowCanvas mode="viewer" showMiniMap nodes={[]} edges={[]} />);

    expect(container.textContent).toContain('MiniMap:#92400e');
    expect(screen.queryByText('Controls')).toBeNull();
  });

  it('can show controls in viewer mode when requested', () => {
    render(<ProcessFlowCanvas mode="viewer" showControls nodes={[]} edges={[]} />);

    expect(screen.getByText('Controls')).toBeTruthy();
  });

  it('allows the start-node zoom cap to be adjusted', () => {
    render(
      <ProcessFlowCanvas
        nodes={[
          {
            id: 'node-1',
            type: 'step',
            position: { x: 10, y: 20 },
            data: { label: 'Start', nodeType: 'step' },
          } as never,
        ]}
        edges={[]}
        startNodeZoom={0.65}
      />,
    );

    const props = reactFlowProps.current as Record<string, any>;
    expect(props.fitViewOptions).toEqual({
      padding: {
        top: '18%',
        right: '48%',
        bottom: '18%',
        left: '10%',
      },
      maxZoom: 0.65,
      nodes: [{ id: 'node-1' }],
    });
  });
});
