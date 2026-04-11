'use client';

import { applyEdgeChanges, applyNodeChanges, type Connection, type EdgeChange, type NodeChange } from '@xyflow/react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ProcessFlowCanvas } from '@/components/process-flow/ProcessFlowCanvas';
import { ProcessFlowInspector } from '@/components/process-flow/ProcessFlowInspector';
import { ProcessFlowSettingsDialog } from '@/components/process-flow/ProcessFlowSettingsDialog';
import { ProcessFlowToolbar } from '@/components/process-flow/ProcessFlowToolbar';
import { ProcessFlowValidationPanel } from '@/components/process-flow/ProcessFlowValidationPanel';
import { ContextMarkdownDialog } from '@/components/story-map/ContextMarkdownDialog';
import { McpSetupDialog } from '@/components/story-map/McpSetupDialog';
import { useRouteRefresh } from '@/components/use-route-refresh';
import { fetchJson } from '@/lib/http';
import type { ProcessFlow, ProcessFlowFull, ProcessFlowValidationResult } from '@/types';
import {
  mergeCanvasEdge,
  mergeCanvasNode,
  type ProcessFlowCanvasEdge,
  type ProcessFlowCanvasNode,
  toCanvasFlow,
} from './adapters';

type Selection = { kind: 'flow' } | { kind: 'node'; id: string } | { kind: 'edge'; id: string };

type BatchMutationResult<T> = {
  created: T[];
  updated: T[];
  deleted: T[];
};

const initialSelection: Selection = { kind: 'flow' };

export function ProcessFlowScreen({ initialProcessFlow }: { initialProcessFlow: ProcessFlowFull }) {
  const router = useRouter();
  const refreshProcessFlow = useRouteRefresh();
  const [processFlow, setProcessFlow] = useState(initialProcessFlow);
  const [nodes, setNodes] = useState<ProcessFlowCanvasNode[]>(() => toCanvasFlow(initialProcessFlow).nodes);
  const [edges, setEdges] = useState<ProcessFlowCanvasEdge[]>(() => toCanvasFlow(initialProcessFlow).edges);
  const [selection, setSelection] = useState<Selection>(initialSelection);
  const [validation, setValidation] = useState<ProcessFlowValidationResult | null>(null);
  const [validationOpen, setValidationOpen] = useState(false);
  const [uiError, setUiError] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [contextOpen, setContextOpen] = useState(false);
  const [mcpSetupOpen, setMcpSetupOpen] = useState(false);

  useEffect(() => {
    setProcessFlow(initialProcessFlow);
    const canvas = toCanvasFlow(initialProcessFlow);
    setNodes(canvas.nodes);
    setEdges(canvas.edges);
    setSelection(initialSelection);
  }, [initialProcessFlow]);

  const selected = useMemo(() => {
    if (selection.kind === 'node') {
      const node = nodes.find((item) => item.id === selection.id);
      return node ? ({ kind: 'node', node } as const) : ({ kind: 'flow' } as const);
    }

    if (selection.kind === 'edge') {
      const edge = edges.find((item) => item.id === selection.id);
      return edge ? ({ kind: 'edge', edge } as const) : ({ kind: 'flow' } as const);
    }

    return { kind: 'flow' } as const;
  }, [selection, nodes, edges]);

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

  const handleValidate = useCallback(async () => {
    try {
      const next = await request<ProcessFlowValidationResult>(
        `/api/process-flows/${processFlow.id}/validation`,
        undefined,
        'Failed to validate process flow',
      );
      setValidation(next);
    } catch {
      // request() already records a user-visible error message; swallow to avoid unhandled rejection noise.
    }
  }, [processFlow.id, request]);

  const handleToggleValidation = useCallback(async () => {
    if (!validationOpen) {
      await handleValidate();
    }
    setValidationOpen((current) => !current);
  }, [handleValidate, validationOpen]);

  useEffect(() => {
    void handleValidate();
  }, [handleValidate]);

  const handleNodesChange = useCallback((changes: NodeChange<ProcessFlowCanvasNode>[]) => {
    setNodes((current) => applyNodeChanges(changes, current));
  }, []);

  const handleEdgesChange = useCallback((changes: EdgeChange<ProcessFlowCanvasEdge>[]) => {
    setEdges((current) => applyEdgeChanges(changes, current));
  }, []);

  const mutateNodes = useCallback(
    async (mutations: Array<Record<string, unknown>>) => {
      return request<BatchMutationResult<ProcessFlowFull['nodes'][number]>>(
        `/api/process-flows/${processFlow.id}/nodes`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mutations }),
        },
        'Failed to mutate process flow nodes',
      );
    },
    [processFlow.id, request],
  );

  const mutateEdges = useCallback(
    async (mutations: Array<Record<string, unknown>>) => {
      return request<BatchMutationResult<ProcessFlowFull['edges'][number]>>(
        `/api/process-flows/${processFlow.id}/edges`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mutations }),
        },
        'Failed to mutate process flow edges',
      );
    },
    [processFlow.id, request],
  );

  const handleCreateNode = useCallback(
    async (type: ProcessFlowCanvasNode['type']) => {
      try {
        const offset = nodes.length * 24;
        const created = await request<ProcessFlowFull['nodes'][number]>(
          `/api/process-flows/${processFlow.id}/nodes`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              type,
              position: { x: 120 + offset, y: 120 + offset / 2 },
              data: { label: `New ${type}` },
            }),
          },
          'Failed to create process flow node',
        );

        setNodes((current) => mergeCanvasNode(current, created));
        setSelection({ kind: 'node', id: created.id });
        await handleValidate();
      } catch {
        // request() already records a user-visible error message; swallow to avoid unhandled rejection noise.
      }
    },
    [handleValidate, nodes.length, processFlow.id, request],
  );

  const handleSaveNode = useCallback(
    async (nodeId: string, changes: Record<string, unknown>) => {
      const result = await mutateNodes([{ action: 'update', id: nodeId, payload: changes }]);
      setNodes((current) => result.updated.reduce((acc, item) => mergeCanvasNode(acc, item), current));
      await handleValidate();
    },
    [mutateNodes, handleValidate],
  );

  const handleDeleteNode = useCallback(
    async (nodeId: string) => {
      await mutateNodes([{ action: 'delete', id: nodeId }]);
      setNodes((current) => current.filter((node) => node.id !== nodeId));
      setEdges((current) => current.filter((edge) => edge.source !== nodeId && edge.target !== nodeId));
      setSelection(initialSelection);
      await handleValidate();
    },
    [mutateNodes, handleValidate],
  );

  const handleSaveEdge = useCallback(
    async (edgeId: string, changes: Record<string, unknown>) => {
      const result = await mutateEdges([{ action: 'update', id: edgeId, payload: changes }]);
      setEdges((current) => result.updated.reduce((acc, item) => mergeCanvasEdge(acc, item), current));
      await handleValidate();
    },
    [mutateEdges, handleValidate],
  );

  const handleDeleteEdge = useCallback(
    async (edgeId: string) => {
      await mutateEdges([{ action: 'delete', id: edgeId }]);
      setEdges((current) => current.filter((edge) => edge.id !== edgeId));
      setSelection(initialSelection);
      await handleValidate();
    },
    [mutateEdges, handleValidate],
  );

  const handleConnect = useCallback(
    async (connection: Connection) => {
      if (!connection.source || !connection.target) return;
      const created = await request<ProcessFlowFull['edges'][number]>(
        `/api/process-flows/${processFlow.id}/edges`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'flow',
            source_node_id: connection.source,
            target_node_id: connection.target,
            data: null,
          }),
        },
        'Failed to create process flow edge',
      );

      setEdges((current) => mergeCanvasEdge(current, created));
      setSelection({ kind: 'edge', id: created.id });
      await handleValidate();
    },
    [processFlow.id, request, handleValidate],
  );

  const handleNodeDragStop = useCallback(
    async (_: unknown, node: ProcessFlowCanvasNode) => {
      await mutateNodes([{ action: 'update', id: node.id, payload: { position: node.position } }]);
    },
    [mutateNodes],
  );

  const handleNodesDelete = useCallback(
    async (deleted: ProcessFlowCanvasNode[]) => {
      if (deleted.length === 0) return;
      await mutateNodes(deleted.map((node) => ({ action: 'delete', id: node.id })));
      setEdges((current) =>
        current.filter((edge) => !deleted.some((node) => node.id === edge.source || node.id === edge.target)),
      );
      setSelection(initialSelection);
      await handleValidate();
    },
    [mutateNodes, handleValidate],
  );

  const handleEdgesDelete = useCallback(
    async (deleted: ProcessFlowCanvasEdge[]) => {
      if (deleted.length === 0) return;
      await mutateEdges(deleted.map((edge) => ({ action: 'delete', id: edge.id })));
      setSelection(initialSelection);
      await handleValidate();
    },
    [mutateEdges, handleValidate],
  );

  const handleSaveFlow = useCallback(
    async (changes: { name?: string; description?: string | null; context_markdown?: string | null }) => {
      const updated = await request<ProcessFlow>(
        `/api/process-flows/${processFlow.id}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(changes),
        },
        'Failed to update process flow',
      );

      setProcessFlow((current) => ({ ...current, ...updated }));
    },
    [processFlow.id, request],
  );

  const handleAutolayout = useCallback(async () => {
    try {
      const layouted = await request<{ nodes: ProcessFlowFull['nodes']; edges: ProcessFlowFull['edges'] }>(
        `/api/process-flows/${processFlow.id}/layout`,
        { method: 'POST' },
        'Failed to auto-layout process flow',
      );

      setNodes((layouted.nodes ?? []).map((node) => ({ ...mergeCanvasNode([], node)[0], selected: false })));
      setEdges((layouted.edges ?? []).map((edge) => ({ ...mergeCanvasEdge([], edge)[0], selected: false })));
      await handleValidate();
    } catch {
      // request() already records a user-visible error message; swallow to avoid unhandled rejection noise.
    }
  }, [handleValidate, processFlow.id, request]);

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
        warningCount={validation?.warnings.length ?? 0}
        validationOpen={validationOpen}
        onCreateNode={handleCreateNode}
        onAutolayout={handleAutolayout}
        onToggleValidation={handleToggleValidation}
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
            onNodeDragStop={handleNodeDragStop}
            onConnect={handleConnect}
            onNodeClick={(nodeId) => setSelection({ kind: 'node', id: nodeId })}
            onEdgeClick={(edgeId) => setSelection({ kind: 'edge', id: edgeId })}
            onPaneClick={() => setSelection(initialSelection)}
            onNodesDelete={handleNodesDelete}
            onEdgesDelete={handleEdgesDelete}
            onCreateNode={handleCreateNode}
          />
        </div>

        <aside className="flex h-full w-[390px] min-w-[390px] flex-col overflow-hidden border-l bg-muted/20">
          <div className="min-h-0 flex-1 overflow-y-auto">
            <ProcessFlowInspector
              selection={selected}
              onSaveNode={handleSaveNode}
              onDeleteNode={handleDeleteNode}
              onSaveEdge={handleSaveEdge}
              onDeleteEdge={handleDeleteEdge}
            />
          </div>
          {validationOpen ? (
            <div className="shrink-0 border-t px-4 py-4">
              <ProcessFlowValidationPanel validation={validation} />
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
