'use client';

import '@xyflow/react/dist/style.css';

import {
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
import { Button } from '@/components/ui/Button';
import type { ProcessFlowCanvasEdge, ProcessFlowCanvasNode } from './adapters';
import { processFlowNodeTypes } from './ProcessFlowNode';

interface ProcessFlowCanvasProps {
  nodes: ProcessFlowCanvasNode[];
  edges: ProcessFlowCanvasEdge[];
  onNodesChange: (changes: NodeChange<ProcessFlowCanvasNode>[]) => void;
  onEdgesChange: (changes: EdgeChange<ProcessFlowCanvasEdge>[]) => void;
  onNodeDragStop: OnNodeDrag<ProcessFlowCanvasNode>;
  onConnect: OnConnect;
  onNodeClick: (nodeId: string) => void;
  onEdgeClick: (edgeId: string) => void;
  onPaneClick: () => void;
  onNodesDelete: OnNodesDelete<ProcessFlowCanvasNode>;
  onEdgesDelete: OnEdgesDelete<ProcessFlowCanvasEdge>;
  onCreateNode: (type: ProcessFlowCanvasNode['type']) => void;
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
  return (
    <div className="relative h-full min-h-0 flex-1 overflow-hidden rounded-xl border bg-[radial-gradient(circle_at_top,_rgba(180,83,9,0.07),_transparent_35%),linear-gradient(180deg,rgba(255,255,255,0.58),rgba(255,255,255,0.88))] shadow-sm dark:bg-[radial-gradient(circle_at_top,_rgba(217,119,6,0.12),_transparent_30%),linear-gradient(180deg,rgba(37,33,25,0.94),rgba(26,23,20,0.98))]">
      <ReactFlow
        nodes={props.nodes}
        edges={props.edges}
        onNodesChange={props.onNodesChange}
        onEdgesChange={props.onEdgesChange}
        onNodeDragStop={props.onNodeDragStop}
        onNodesDelete={props.onNodesDelete}
        onEdgesDelete={props.onEdgesDelete}
        onConnect={props.onConnect}
        onNodeClick={(_, node) => props.onNodeClick(node.id)}
        onEdgeClick={(_, edge) => props.onEdgeClick(edge.id)}
        onPaneClick={props.onPaneClick}
        nodeTypes={processFlowNodeTypes}
        fitView
        deleteKeyCode={['Backspace', 'Delete']}
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
        <MiniMap
          pannable
          zoomable
          className="!rounded-lg !border !border-border !bg-card/85 shadow-sm"
          nodeColor={(node) => minimapColors[node.type ?? 'step'] ?? minimapColors.step}
        />
        <Controls className="!border-border !bg-card/90 !shadow-sm" showInteractive={false} />
      </ReactFlow>

      {props.nodes.length === 0 ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-6">
          <div className="pointer-events-auto max-w-md rounded-xl border border-dashed border-border bg-background/95 p-6 text-center shadow-lg backdrop-blur-sm">
            <p className="font-serif text-2xl text-foreground">Start mapping the flow</p>
            <p className="mt-2 text-sm text-muted-foreground">
              Add the first operational step, actor, or decision.
            </p>
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              {(['step', 'decision', 'actor', 'system', 'note'] as const).map((type) => (
                <Button key={type} variant="outline" size="sm" onClick={() => props.onCreateNode(type)}>
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
