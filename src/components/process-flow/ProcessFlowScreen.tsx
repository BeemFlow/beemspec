'use client';

import { applyEdgeChanges, applyNodeChanges, type Connection, type EdgeChange, type NodeChange } from '@xyflow/react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ProcessFlowCanvas } from '@/components/process-flow/ProcessFlowCanvas';
import { ProcessFlowInspector } from '@/components/process-flow/ProcessFlowInspector';
import { ProcessFlowSettingsDialog } from '@/components/process-flow/ProcessFlowSettingsDialog';
import { ProcessFlowToolbar } from '@/components/process-flow/ProcessFlowToolbar';
import { ProcessFlowValidationPanel } from '@/components/process-flow/ProcessFlowValidationPanel';
import { ContextMarkdownDialog } from '@/components/story-map/ContextMarkdownDialog';
import { McpSetupDialog } from '@/components/story-map/McpSetupDialog';
import { useRouteRefresh } from '@/components/use-route-refresh';
import type { UpdateProcessFlow } from '@/domain/process-flow';
import { fetchJson } from '@/lib/http';
import type { ProcessFlowEdge, ProcessFlowFull, ProcessFlowNode, ProcessFlowView } from '@/types';
import {
  type ProcessFlowCanvasEdge,
  type ProcessFlowCanvasNode,
  toCanvasEdge,
  toCanvasFlow,
  toCanvasNode,
} from './adapters';

type Selection = { kind: 'flow' } | { kind: 'node'; id: string } | { kind: 'edge'; id: string };

type Graph = Pick<ProcessFlowFull, 'nodes' | 'edges'>;
type FlowChanges = Omit<UpdateProcessFlow, 'expected_revision' | 'canvas'> & { canvas?: Graph };
const initialSelection: Selection = { kind: 'flow' };

export function ProcessFlowScreen({ initialProcessFlow }: { initialProcessFlow: ProcessFlowView }) {
  const router = useRouter();
  const refreshProcessFlow = useRouteRefresh();
  const currentFlow = useRef(initialProcessFlow);
  const pendingSave = useRef(Promise.resolve());
  const [processFlow, setProcessFlow] = useState(initialProcessFlow);
  const [nodes, setNodes] = useState<ProcessFlowCanvasNode[]>(() => toCanvasFlow(initialProcessFlow).nodes);
  const [edges, setEdges] = useState<ProcessFlowCanvasEdge[]>(() => toCanvasFlow(initialProcessFlow).edges);
  const [selection, setSelection] = useState<Selection>(initialSelection);
  const [validationOpen, setValidationOpen] = useState(false);
  const [uiError, setUiError] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [contextOpen, setContextOpen] = useState(false);
  const [mcpSetupOpen, setMcpSetupOpen] = useState(false);

  const showCanvas = useCallback((flow: ProcessFlowView) => {
    const canvas = toCanvasFlow(flow);
    setNodes(canvas.nodes);
    setEdges(canvas.edges);
  }, []);

  const showFlow = useCallback(
    (flow: ProcessFlowView) => {
      currentFlow.current = flow;
      setProcessFlow(flow);
      showCanvas(flow);
    },
    [showCanvas],
  );

  useEffect(() => {
    if (
      initialProcessFlow.id !== currentFlow.current.id ||
      initialProcessFlow.diagram_revision >= currentFlow.current.diagram_revision
    ) {
      showFlow(initialProcessFlow);
      setSelection(initialSelection);
    }
  }, [initialProcessFlow, showFlow]);

  // Only changes to the saved flow or selection should reset inspector fields.
  const selected = useMemo(() => {
    if (selection.kind === 'node') {
      const node = processFlow.nodes.find((item) => item.id === selection.id);
      return node ? ({ kind: 'node', node: toCanvasNode(node) } as const) : ({ kind: 'flow' } as const);
    }

    if (selection.kind === 'edge') {
      const edge = processFlow.edges.find((item) => item.id === selection.id);
      return edge ? ({ kind: 'edge', edge: toCanvasEdge(edge) } as const) : ({ kind: 'flow' } as const);
    }

    return { kind: 'flow' } as const;
  }, [selection, processFlow]);

  const request = useCallback(async <T,>(input: RequestInfo | URL, init: RequestInit | undefined, fallback: string) => {
    setUiError(null);
    try {
      return await fetchJson<T>(input, init, fallback);
    } catch (error) {
      const message = error instanceof Error ? error.message : fallback;
      setUiError(message);
      throw error;
    }
  }, []);

  const saveFlow = useCallback(
    (changes: (flow: ProcessFlowView) => FlowChanges) => {
      const save = pendingSave.current.then(async () => {
        const flow = currentFlow.current;
        try {
          const updated = await request<ProcessFlowView>(
            `/api/process-flows/${flow.id}`,
            {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ ...changes(flow), expected_revision: flow.diagram_revision }),
            },
            'Failed to update process flow',
          );
          if (currentFlow.current.id === flow.id && currentFlow.current.diagram_revision <= updated.diagram_revision) {
            showFlow(updated);
          }
        } catch (error) {
          if (currentFlow.current.id === flow.id) showCanvas(currentFlow.current);
          throw error;
        }
      });
      pendingSave.current = save.catch(() => {});
      return save;
    },
    [request, showCanvas, showFlow],
  );

  const saveGraph = (edit: (flow: ProcessFlowView) => Graph) => saveFlow((flow) => ({ canvas: edit(flow) }));

  const handleNodesChange = (changes: NodeChange<ProcessFlowCanvasNode>[]) => {
    setNodes((current) => applyNodeChanges(changes, current));
  };
  const handleEdgesChange = (changes: EdgeChange<ProcessFlowCanvasEdge>[]) => {
    setEdges((current) => applyEdgeChanges(changes, current));
  };

  const handleCreateNode = async (type: ProcessFlowNode['type']) => {
    const id = `n_${crypto.randomUUID()}`;
    try {
      await saveGraph((flow) => ({
        nodes: [
          ...flow.nodes,
          {
            id,
            process_flow_id: flow.id,
            type,
            position: { x: 120 + flow.nodes.length * 24, y: 120 + flow.nodes.length * 12 },
            data: { label: `New ${type}` },
          },
        ],
        edges: flow.edges,
      }));
      setSelection({ kind: 'node', id });
    } catch {
      // The shared request displays the error.
    }
  };

  const handleSaveNode = (nodeId: string, changes: Partial<Pick<ProcessFlowNode, 'type' | 'position' | 'data'>>) =>
    saveGraph((flow) => ({
      nodes: flow.nodes.map((node) =>
        node.id === nodeId
          ? {
              ...node,
              ...changes,
              data: { ...node.data, ...changes.data },
            }
          : node,
      ),
      edges: flow.edges,
    }));

  const handleSaveEdge = (edgeId: string, changes: Pick<ProcessFlowEdge, 'type' | 'data'>) =>
    saveGraph((flow) => ({
      nodes: flow.nodes,
      edges: flow.edges.map((edge) =>
        edge.id === edgeId
          ? {
              ...edge,
              ...changes,
              data: { ...edge.data, ...changes.data },
            }
          : edge,
      ),
    }));

  const deleteFromCanvas = async (nodeIds: string[], edgeIds: string[]) => {
    const removedNodes = new Set(nodeIds);
    const removedEdges = new Set(edgeIds);
    await saveGraph((flow) => ({
      nodes: flow.nodes.filter((node) => !removedNodes.has(node.id)),
      edges: flow.edges.filter(
        (edge) =>
          !removedEdges.has(edge.id) &&
          !removedNodes.has(edge.source_node_id) &&
          !removedNodes.has(edge.target_node_id),
      ),
    }));
    setSelection(initialSelection);
  };

  const handleConnect = async ({ source, target }: Connection) => {
    if (!source || !target) return;
    const id = `e_${crypto.randomUUID()}`;
    try {
      await saveGraph((flow) => ({
        nodes: flow.nodes,
        edges: [
          ...flow.edges,
          {
            id,
            process_flow_id: flow.id,
            type: 'flow',
            source_node_id: source,
            target_node_id: target,
            data: null,
          },
        ],
      }));
      setSelection({ kind: 'edge', id });
    } catch {
      // The shared request displays the error.
    }
  };

  const handleSaveFlow = (changes: Pick<FlowChanges, 'name' | 'description' | 'context_markdown'>) =>
    saveFlow(() => changes);

  const handleDeleteFlow = useCallback(async () => {
    await request(
      `/api/process-flows/${processFlow.id}`,
      {
        method: 'DELETE',
      },
      'Failed to delete process flow',
    );
    router.push('/');
  }, [processFlow.id, request, router]);

  return (
    <div className="flex h-[calc(100vh-var(--header-height))] min-h-0 flex-col bg-background">
      <ProcessFlowToolbar
        name={processFlow.name}
        warningCount={processFlow.validation.warnings.length}
        validationOpen={validationOpen}
        onCreateNode={handleCreateNode}
        onAutolayout={() => void saveFlow(() => ({ layout: 'auto' })).catch(() => {})}
        onToggleValidation={() => setValidationOpen((open) => !open)}
        onOpenContext={() => setContextOpen(true)}
        onOpenMcpSetup={() => setMcpSetupOpen(true)}
        onRefresh={refreshProcessFlow}
        onOpenSettings={() => setSettingsOpen(true)}
      />

      {uiError ? <div className="border-b bg-destructive/10 px-4 py-2 text-sm text-destructive">{uiError}</div> : null}

      <div className="flex min-h-0 flex-1">
        <div className="min-h-0 flex-1 p-4">
          <ProcessFlowCanvas
            nodes={nodes}
            edges={edges}
            onNodesChange={handleNodesChange}
            onEdgesChange={handleEdgesChange}
            onNodeDragStop={(_, node) => void handleSaveNode(node.id, { position: node.position }).catch(() => {})}
            onConnect={handleConnect}
            onNodeClick={(nodeId) => setSelection({ kind: 'node', id: nodeId })}
            onEdgeClick={(edgeId) => setSelection({ kind: 'edge', id: edgeId })}
            onPaneClick={() => setSelection(initialSelection)}
            onDelete={({ nodes: deletedNodes, edges: deletedEdges }) =>
              void deleteFromCanvas(
                deletedNodes.map(({ id }) => id),
                deletedEdges.map(({ id }) => id),
              ).catch(() => {})
            }
            onCreateNode={handleCreateNode}
          />
        </div>

        <aside className="flex h-full w-[390px] min-w-[390px] flex-col overflow-hidden border-l bg-muted/20">
          <div className="min-h-0 flex-1 overflow-y-auto">
            <ProcessFlowInspector
              selection={selected}
              onSaveNode={handleSaveNode}
              onDeleteNode={(id) => deleteFromCanvas([id], [])}
              onSaveEdge={handleSaveEdge}
              onDeleteEdge={(id) => deleteFromCanvas([], [id])}
            />
          </div>
          {validationOpen ? (
            <div className="shrink-0 border-t px-4 py-4">
              <ProcessFlowValidationPanel validation={processFlow.validation} />
            </div>
          ) : null}
        </aside>
      </div>

      <ProcessFlowSettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        processFlowName={processFlow.name}
        processFlowDescription={processFlow.description}
        onSave={handleSaveFlow}
        onCreateShareLink={() =>
          request<{ url: string }>(
            `/api/process-flows/${processFlow.id}/shares`,
            {
              method: 'POST',
            },
            'Failed to create share link',
          ).then((result) => result.url)
        }
        onDelete={handleDeleteFlow}
      />

      <ContextMarkdownDialog
        open={contextOpen}
        onOpenChange={setContextOpen}
        title={`${processFlow.name} — Context`}
        value={processFlow.context_markdown ?? null}
        onSave={async (value) => {
          await handleSaveFlow({ context_markdown: value });
        }}
        variant="process-flow"
      />

      <McpSetupDialog
        open={mcpSetupOpen}
        onOpenChange={setMcpSetupOpen}
        appOrigin={typeof window === 'undefined' ? '' : window.location.origin}
      />
    </div>
  );
}
