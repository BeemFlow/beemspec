'use client';

import '@xyflow/react/dist/style.css';

import {
  applyEdgeChanges,
  applyNodeChanges,
  Background,
  Controls,
  type EdgeChange,
  MarkerType,
  MiniMap,
  type NodeChange,
  type OnConnect,
  type OnEdgesDelete,
  type OnNodeDrag,
  type OnNodesDelete,
  ReactFlow,
} from '@xyflow/react';
import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { getStartNodeId } from './adapters';
import type { ProcessFlowCanvasEdge, ProcessFlowCanvasNode } from './adapters';
import { processFlowNodeTypes } from './ProcessFlowNode';

const DEFAULT_START_NODE_ZOOM = 0.64;
const START_NODE_VIEW_PADDING = {
  right: '80%',
} as const;

interface ProcessFlowCanvasProps {
  nodes: ProcessFlowCanvasNode[];
  edges: ProcessFlowCanvasEdge[];
  mode?: 'editor' | 'viewer';
  framed?: boolean;
  showMiniMap?: boolean;
  showControls?: boolean;
  startNodeZoom?: number;
  onNodesChange?: (changes: NodeChange<ProcessFlowCanvasNode>[]) => void;
  onEdgesChange?: (changes: EdgeChange<ProcessFlowCanvasEdge>[]) => void;
  onNodeDragStop?: OnNodeDrag<ProcessFlowCanvasNode>;
  onConnect?: OnConnect;
  onNodeClick?: (nodeId: string) => void;
  onEdgeClick?: (edgeId: string) => void;
  onPaneClick?: () => void;
  onNodesDelete?: OnNodesDelete<ProcessFlowCanvasNode>;
  onEdgesDelete?: OnEdgesDelete<ProcessFlowCanvasEdge>;
  onCreateNode?: (type: ProcessFlowCanvasNode['type']) => void;
}

const minimapColors: Record<string, string> = {
  step: '#b45309',
  decision: '#92400e',
  subprocess: '#6b6560',
  actor: '#2f7a4d',
  system: '#57534e',
  note: '#b07a42',
};

export function ProcessFlowCanvas(props: ProcessFlowCanvasProps) {
  const mode = props.mode ?? 'editor';
  const isViewer = mode === 'viewer';
  const framed = props.framed ?? true;
  const showMiniMap = props.showMiniMap ?? !isViewer;
  const showControls = props.showControls ?? !isViewer;
  const containerClassName = framed
    ? 'relative h-full min-h-0 flex-1 overflow-hidden rounded-xl border bg-[radial-gradient(circle_at_top,_rgba(180,83,9,0.07),_transparent_35%),linear-gradient(180deg,rgba(255,255,255,0.58),rgba(255,255,255,0.88))] shadow-sm dark:bg-[radial-gradient(circle_at_top,_rgba(217,119,6,0.12),_transparent_30%),linear-gradient(180deg,rgba(37,33,25,0.94),rgba(26,23,20,0.98))]'
    : 'relative h-full min-h-0 flex-1 overflow-hidden bg-background';
  const [internalNodes, setInternalNodes] = useState(props.nodes);
  const [internalEdges, setInternalEdges] = useState(props.edges);
  const nodes = props.onNodesChange ? props.nodes : internalNodes;
  const edges = props.onEdgesChange ? props.edges : internalEdges;
  const startNodeId = useMemo(() => getStartNodeId(nodes, edges), [nodes, edges]);
  const fitViewOptions = useMemo(
    () => ({
      padding: START_NODE_VIEW_PADDING,
      maxZoom: props.startNodeZoom ?? DEFAULT_START_NODE_ZOOM,
      ...(startNodeId ? { nodes: [{ id: startNodeId }] } : {}),
    }),
    [props.startNodeZoom, startNodeId],
  );

  useEffect(() => {
    if (!props.onNodesChange) {
      setInternalNodes(props.nodes);
    }
  }, [props.nodes, props.onNodesChange]);

  useEffect(() => {
    if (!props.onEdgesChange) {
      setInternalEdges(props.edges);
    }
  }, [props.edges, props.onEdgesChange]);

  const handleNodesChange = useMemo(
    () =>
      props.onNodesChange ??
      ((changes: NodeChange<ProcessFlowCanvasNode>[]) => {
        setInternalNodes((current) => applyNodeChanges(changes, current));
      }),
    [props.onNodesChange],
  );

  const handleEdgesChange = useMemo(
    () =>
      props.onEdgesChange ??
      ((changes: EdgeChange<ProcessFlowCanvasEdge>[]) => {
        setInternalEdges((current) => applyEdgeChanges(changes, current));
      }),
    [props.onEdgesChange],
  );

  return (
    <div className={containerClassName}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={handleNodesChange}
        onEdgesChange={handleEdgesChange}
        onNodeDragStop={props.onNodeDragStop}
        onNodesDelete={props.onNodesDelete}
        onEdgesDelete={props.onEdgesDelete}
        onConnect={props.onConnect}
        onNodeClick={props.onNodeClick ? (_, node) => props.onNodeClick?.(node.id) : undefined}
        onEdgeClick={props.onEdgeClick ? (_, edge) => props.onEdgeClick?.(edge.id) : undefined}
        onPaneClick={props.onPaneClick}
        nodeTypes={processFlowNodeTypes}
        fitView
        fitViewOptions={fitViewOptions}
        deleteKeyCode={isViewer ? null : ['Backspace', 'Delete']}
        nodesDraggable={!isViewer}
        nodesConnectable={!isViewer}
        elementsSelectable={!isViewer}
        defaultEdgeOptions={{
          type: 'smoothstep',
          markerEnd: {
            type: MarkerType.ArrowClosed,
            width: 18,
            height: 18,
            color: 'rgba(26, 23, 20, 0.55)',
          },
          style: {
            stroke: 'rgba(26, 23, 20, 0.55)',
            strokeWidth: 1.75,
          },
          labelStyle: {
            fontFamily: 'var(--font-ibm-plex-mono)',
            fontSize: 11,
            fill: 'rgba(26, 23, 20, 0.72)',
          },
        }}
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={24} size={1} color="rgba(26, 23, 20, 0.08)" />
        {showMiniMap || showControls ? (
          <>
            {showMiniMap ? (
              <MiniMap
                pannable
                zoomable
                className="!rounded-lg !border !border-border !bg-card/85 shadow-sm"
                nodeColor={(node) => minimapColors[node.type ?? 'step'] ?? minimapColors.step}
              />
            ) : null}
            {showControls ? (
              <Controls className="!border-border !bg-card/90 !shadow-sm" showInteractive={false} />
            ) : null}
          </>
        ) : null}
      </ReactFlow>

      {!isViewer && nodes.length === 0 && props.onCreateNode ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-6">
          <div className="pointer-events-auto max-w-md rounded-xl border border-dashed border-border bg-background/95 p-6 text-center shadow-lg backdrop-blur-sm">
            <p className="font-serif text-2xl text-foreground">Start mapping the flow</p>
            <p className="mt-2 text-sm text-muted-foreground">Add the first operational step, actor, or decision.</p>
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              {(['step', 'decision', 'actor', 'system', 'note'] as const).map((type) => (
                <Button key={type} variant="outline" size="sm" onClick={() => props.onCreateNode?.(type)}>
                  Add {type}
                </Button>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
