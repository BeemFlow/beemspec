'use client';

import { useEffect, useId, useMemo, useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/Select';
import { Textarea } from '@/components/ui/Textarea';
import type { ProcessFlowFull } from '@/types';
import type { ProcessFlowCanvasEdge, ProcessFlowCanvasNode } from './adapters';

type InspectorSelection =
  | { kind: 'flow' }
  | { kind: 'node'; node: ProcessFlowCanvasNode }
  | { kind: 'edge'; edge: ProcessFlowCanvasEdge };

interface ProcessFlowInspectorProps {
  processFlow: ProcessFlowFull;
  selection: InspectorSelection;
  onSaveFlow: (changes: {
    name?: string;
    description?: string | null;
    context_markdown?: string | null;
  }) => Promise<void>;
  onSaveNode: (nodeId: string, changes: Record<string, unknown>) => Promise<void>;
  onDeleteNode: (nodeId: string) => Promise<void>;
  onSaveEdge: (edgeId: string, changes: Record<string, unknown>) => Promise<void>;
  onDeleteEdge: (edgeId: string) => Promise<void>;
}

function arrayToText(values?: string[]) {
  return values?.join('\n') ?? '';
}

function textToArray(value: string) {
  return value
    .split('\n')
    .map((item) => item.trim())
    .filter(Boolean);
}

export function ProcessFlowInspector(props: ProcessFlowInspectorProps) {
  const [isSaving, setIsSaving] = useState(false);
  const ids = {
    nodeType: useId(),
    nodeLabel: useId(),
    nodeOwnerRole: useId(),
    nodeSystems: useId(),
    nodeInputs: useId(),
    nodeOutputs: useId(),
    nodePainPoints: useId(),
    nodeNotes: useId(),
    nodeAutomation: useId(),
    edgeType: useId(),
    edgeLabel: useId(),
  };

  const flowDefaults = useMemo(
    () => ({
      name: props.processFlow.name,
      description: props.processFlow.description ?? '',
      context_markdown: props.processFlow.context_markdown ?? '',
    }),
    [props.processFlow],
  );
  const [flowForm, setFlowForm] = useState(flowDefaults);

  const nodeDefaults = useMemo(() => {
    if (props.selection.kind !== 'node') return null;
    const node = props.selection.node;
    return {
      type: node.type,
      label: node.data.label,
      owner_role: node.data.owner_role ?? '',
      systems: arrayToText(node.data.systems),
      inputs: arrayToText(node.data.inputs),
      outputs: arrayToText(node.data.outputs),
      pain_points: node.data.pain_points ?? '',
      notes: node.data.notes ?? '',
      automation_opportunity: node.data.automation_opportunity ?? '',
    };
  }, [props.selection]);
  const [nodeForm, setNodeForm] = useState(nodeDefaults);

  const edgeDefaults = useMemo(() => {
    if (props.selection.kind !== 'edge') return null;
    return {
      type: props.selection.edge.data?.edgeType ?? 'flow',
      label: props.selection.edge.data?.label ?? props.selection.edge.label?.toString() ?? '',
    };
  }, [props.selection]);
  const [edgeForm, setEdgeForm] = useState(edgeDefaults);

  const selectedNode = props.selection.kind === 'node' ? props.selection.node : null;
  const selectedEdge = props.selection.kind === 'edge' ? props.selection.edge : null;

  useEffect(() => setFlowForm(flowDefaults), [flowDefaults]);
  useEffect(() => setNodeForm(nodeDefaults), [nodeDefaults]);
  useEffect(() => setEdgeForm(edgeDefaults), [edgeDefaults]);

  async function run(action: () => Promise<void>) {
    setIsSaving(true);
    try {
      await action();
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="flex h-full min-h-0 w-full max-w-[360px] flex-col gap-4 overflow-y-auto p-4">
      {props.selection.kind === 'flow' ? (
        <Card className="gap-0 overflow-hidden">
          <CardHeader className="border-b">
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="text-base">Flow Details</CardTitle>
              <Badge variant="outline">Process Flow</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4 p-4">
            <div className="space-y-2">
              <Label htmlFor="flow-name">Name</Label>
              <Input
                id="flow-name"
                value={flowForm.name}
                onChange={(e) => setFlowForm((s) => ({ ...s, name: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="flow-description">Description</Label>
              <Textarea
                id="flow-description"
                value={flowForm.description}
                onChange={(e) => setFlowForm((s) => ({ ...s, description: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="flow-context">Context Markdown</Label>
              <Textarea
                id="flow-context"
                className="min-h-32 font-mono text-xs"
                value={flowForm.context_markdown}
                onChange={(e) => setFlowForm((s) => ({ ...s, context_markdown: e.target.value }))}
              />
            </div>
            <Button
              className="w-full"
              disabled={isSaving}
              onClick={() =>
                run(() =>
                  props.onSaveFlow({
                    name: flowForm.name,
                    description: flowForm.description || null,
                    context_markdown: flowForm.context_markdown || null,
                  }),
                )
              }
            >
              Save Flow Details
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {selectedNode && nodeForm ? (
        <Card className="gap-0 overflow-hidden">
          <CardHeader className="border-b">
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="text-base">Node Details</CardTitle>
              <Badge variant="outline">{selectedNode.type}</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4 p-4">
            <div className="space-y-2">
              <Label htmlFor={ids.nodeType}>Type</Label>
              <Select
                value={nodeForm.type}
                onValueChange={(value) => setNodeForm((s) => (s ? { ...s, type: value as typeof s.type } : s))}
              >
                <SelectTrigger id={ids.nodeType} className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(['step', 'decision', 'subprocess', 'actor', 'system', 'note'] as const).map((type) => (
                    <SelectItem key={type} value={type}>
                      {type}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor={ids.nodeLabel}>Label</Label>
              <Input
                id={ids.nodeLabel}
                value={nodeForm.label}
                onChange={(e) => setNodeForm((s) => (s ? { ...s, label: e.target.value } : s))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={ids.nodeOwnerRole}>Owner Role</Label>
              <Input
                id={ids.nodeOwnerRole}
                value={nodeForm.owner_role}
                onChange={(e) => setNodeForm((s) => (s ? { ...s, owner_role: e.target.value } : s))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={ids.nodeSystems}>Systems</Label>
              <Textarea
                id={ids.nodeSystems}
                value={nodeForm.systems}
                onChange={(e) => setNodeForm((s) => (s ? { ...s, systems: e.target.value } : s))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={ids.nodeInputs}>Inputs</Label>
              <Textarea
                id={ids.nodeInputs}
                value={nodeForm.inputs}
                onChange={(e) => setNodeForm((s) => (s ? { ...s, inputs: e.target.value } : s))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={ids.nodeOutputs}>Outputs</Label>
              <Textarea
                id={ids.nodeOutputs}
                value={nodeForm.outputs}
                onChange={(e) => setNodeForm((s) => (s ? { ...s, outputs: e.target.value } : s))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={ids.nodePainPoints}>Pain Points</Label>
              <Textarea
                id={ids.nodePainPoints}
                value={nodeForm.pain_points}
                onChange={(e) => setNodeForm((s) => (s ? { ...s, pain_points: e.target.value } : s))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={ids.nodeNotes}>Notes</Label>
              <Textarea
                id={ids.nodeNotes}
                value={nodeForm.notes}
                onChange={(e) => setNodeForm((s) => (s ? { ...s, notes: e.target.value } : s))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={ids.nodeAutomation}>Automation Opportunity</Label>
              <Textarea
                id={ids.nodeAutomation}
                value={nodeForm.automation_opportunity}
                onChange={(e) => setNodeForm((s) => (s ? { ...s, automation_opportunity: e.target.value } : s))}
              />
            </div>
            <div className="flex gap-2">
              <Button
                className="flex-1"
                disabled={isSaving}
                onClick={() =>
                  run(() =>
                    props.onSaveNode(selectedNode.id, {
                      type: nodeForm.type,
                      data: {
                        label: nodeForm.label,
                        owner_role: nodeForm.owner_role || null,
                        systems: textToArray(nodeForm.systems),
                        inputs: textToArray(nodeForm.inputs),
                        outputs: textToArray(nodeForm.outputs),
                        pain_points: nodeForm.pain_points || null,
                        notes: nodeForm.notes || null,
                        automation_opportunity: nodeForm.automation_opportunity || null,
                      },
                    }),
                  )
                }
              >
                Save Node
              </Button>
              <Button
                variant="destructive"
                disabled={isSaving}
                onClick={() => run(() => props.onDeleteNode(selectedNode.id))}
              >
                Delete
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {selectedEdge && edgeForm ? (
        <Card className="gap-0 overflow-hidden">
          <CardHeader className="border-b">
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="text-base">Edge Details</CardTitle>
              <Badge variant="outline">Connection</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4 p-4">
            <div className="space-y-2">
              <Label htmlFor={ids.edgeType}>Type</Label>
              <Select
                value={edgeForm.type}
                onValueChange={(value) => setEdgeForm((s) => (s ? { ...s, type: value as typeof s.type } : s))}
              >
                <SelectTrigger id={ids.edgeType} className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(['flow', 'handoff', 'exception', 'dependency'] as const).map((type) => (
                    <SelectItem key={type} value={type}>
                      {type}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor={ids.edgeLabel}>Label</Label>
              <Input
                id={ids.edgeLabel}
                value={edgeForm.label}
                onChange={(e) => setEdgeForm((s) => (s ? { ...s, label: e.target.value } : s))}
              />
            </div>
            <div className="flex gap-2">
              <Button
                className="flex-1"
                disabled={isSaving}
                onClick={() =>
                  run(() =>
                    props.onSaveEdge(selectedEdge.id, {
                      type: edgeForm.type,
                      data: { label: edgeForm.label || null },
                    }),
                  )
                }
              >
                Save Edge
              </Button>
              <Button
                variant="destructive"
                disabled={isSaving}
                onClick={() => run(() => props.onDeleteEdge(selectedEdge.id))}
              >
                Delete
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
