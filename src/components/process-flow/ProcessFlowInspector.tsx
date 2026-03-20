'use client';

import { useEffect, useId, useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { nonCredentialFieldProps } from '@/components/ui/non-credential-fields';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import type { ProcessFlowCanvasEdge, ProcessFlowCanvasNode } from './adapters';

type InspectorSelection =
  | { kind: 'flow' }
  | { kind: 'node'; node: ProcessFlowCanvasNode }
  | { kind: 'edge'; edge: ProcessFlowCanvasEdge };

interface ProcessFlowInspectorProps {
  selection: InspectorSelection;
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
    nodeFrequency: useId(),
    nodeEstimatedDuration: useId(),
    nodeTimeConstraint: useId(),
    edgeType: useId(),
    edgeLabel: useId(),
    edgeCondition: useId(),
  };

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
      frequency: node.data.frequency ?? '',
      estimated_duration: node.data.estimated_duration ?? '',
      time_constraint: node.data.time_constraint ?? '',
    };
  }, [props.selection]);
  const [nodeForm, setNodeForm] = useState(nodeDefaults);

  const edgeDefaults = useMemo(() => {
    if (props.selection.kind !== 'edge') return null;
    return {
      type: props.selection.edge.data?.edgeType ?? 'flow',
      label: props.selection.edge.data?.label ?? props.selection.edge.label?.toString() ?? '',
      condition: props.selection.edge.data?.condition ?? '',
    };
  }, [props.selection]);
  const [edgeForm, setEdgeForm] = useState(edgeDefaults);

  const selectedNode = props.selection.kind === 'node' ? props.selection.node : null;
  const selectedEdge = props.selection.kind === 'edge' ? props.selection.edge : null;

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
    <div className="flex w-full max-w-[360px] flex-col gap-4 p-4">
      {props.selection.kind === 'flow' ? (
        <Card className="gap-0 overflow-hidden">
          <CardHeader className="border-b">
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="text-base">No Selection</CardTitle>
              <Badge variant="outline">Canvas</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4 p-4">
            <div className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
              Click a node or edge to configure its settings.
            </div>
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
                placeholder='e.g., "Review invoice", "Escalate to finance"'
                value={nodeForm.label}
                onChange={(e) => setNodeForm((s) => (s ? { ...s, label: e.target.value } : s))}
                {...nonCredentialFieldProps}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={ids.nodeOwnerRole}>Owner Role</Label>
              <Input
                id={ids.nodeOwnerRole}
                placeholder='e.g., "AP clerk", "Finance manager"'
                value={nodeForm.owner_role}
                onChange={(e) => setNodeForm((s) => (s ? { ...s, owner_role: e.target.value } : s))}
                {...nonCredentialFieldProps}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={ids.nodeSystems}>Systems</Label>
              <Textarea
                id={ids.nodeSystems}
                placeholder='e.g., "NetSuite", "Slack", "Email"'
                value={nodeForm.systems}
                onChange={(e) => setNodeForm((s) => (s ? { ...s, systems: e.target.value } : s))}
                {...nonCredentialFieldProps}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={ids.nodeInputs}>Inputs</Label>
              <Textarea
                id={ids.nodeInputs}
                placeholder='e.g., "Invoice PDF", "Vendor details", "PO number"'
                value={nodeForm.inputs}
                onChange={(e) => setNodeForm((s) => (s ? { ...s, inputs: e.target.value } : s))}
                {...nonCredentialFieldProps}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={ids.nodeOutputs}>Outputs</Label>
              <Textarea
                id={ids.nodeOutputs}
                placeholder='e.g., "Approved invoice", "Payment request", "Status update"'
                value={nodeForm.outputs}
                onChange={(e) => setNodeForm((s) => (s ? { ...s, outputs: e.target.value } : s))}
                {...nonCredentialFieldProps}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={ids.nodePainPoints}>Pain Points</Label>
              <Textarea
                id={ids.nodePainPoints}
                placeholder='e.g., "Manual re-entry causes errors", "Approvals often stall here"'
                value={nodeForm.pain_points}
                onChange={(e) => setNodeForm((s) => (s ? { ...s, pain_points: e.target.value } : s))}
                {...nonCredentialFieldProps}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={ids.nodeNotes}>Notes</Label>
              <Textarea
                id={ids.nodeNotes}
                placeholder='e.g., "Exception path for international vendors", "Only used for urgent requests"'
                value={nodeForm.notes}
                onChange={(e) => setNodeForm((s) => (s ? { ...s, notes: e.target.value } : s))}
                {...nonCredentialFieldProps}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={ids.nodeAutomation}>Automation Opportunity</Label>
              <Textarea
                id={ids.nodeAutomation}
                placeholder='e.g., "Auto-route for approval", "Sync data into ERP"'
                value={nodeForm.automation_opportunity}
                onChange={(e) => setNodeForm((s) => (s ? { ...s, automation_opportunity: e.target.value } : s))}
                {...nonCredentialFieldProps}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={ids.nodeFrequency}>Frequency</Label>
              <Input
                id={ids.nodeFrequency}
                placeholder='e.g., "~200/day", "weekly", "ad-hoc"'
                value={nodeForm.frequency}
                onChange={(e) => setNodeForm((s) => (s ? { ...s, frequency: e.target.value } : s))}
                {...nonCredentialFieldProps}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={ids.nodeEstimatedDuration}>Est. Duration</Label>
              <Input
                id={ids.nodeEstimatedDuration}
                placeholder='e.g., "5-10 min", "2 days waiting on approval"'
                value={nodeForm.estimated_duration}
                onChange={(e) => setNodeForm((s) => (s ? { ...s, estimated_duration: e.target.value } : s))}
                {...nonCredentialFieldProps}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={ids.nodeTimeConstraint}>Time Constraint</Label>
              <Input
                id={ids.nodeTimeConstraint}
                placeholder='e.g., "must complete within 48h", "regulatory: 30 days max"'
                value={nodeForm.time_constraint}
                onChange={(e) => setNodeForm((s) => (s ? { ...s, time_constraint: e.target.value } : s))}
                {...nonCredentialFieldProps}
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
                        frequency: nodeForm.frequency || null,
                        estimated_duration: nodeForm.estimated_duration || null,
                        time_constraint: nodeForm.time_constraint || null,
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
                placeholder='e.g., "Approved", "Needs review", "Enterprise"'
                value={edgeForm.label}
                onChange={(e) => setEdgeForm((s) => (s ? { ...s, label: e.target.value } : s))}
                {...nonCredentialFieldProps}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={ids.edgeCondition}>Condition</Label>
              <Input
                id={ids.edgeCondition}
                placeholder='e.g., "amount > $10,000", "approval denied"'
                value={edgeForm.condition}
                onChange={(e) => setEdgeForm((s) => (s ? { ...s, condition: e.target.value } : s))}
                {...nonCredentialFieldProps}
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
                      data: { label: edgeForm.label || null, condition: edgeForm.condition || null },
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
