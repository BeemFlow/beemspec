'use client';

import { Handle, type NodeProps, Position } from '@xyflow/react';
import { Circle, Diamond, FileText, Server, User } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { cn } from '@/components/ui/utils';
import type { ProcessFlowCanvasNode } from './adapters';

const typeStyles = {
  step: {
    icon: Circle,
    border: 'border-border-accent',
    badge: 'bg-accent text-accent-foreground border-border-accent',
    glow: 'shadow-[0_10px_30px_rgba(180,83,9,0.08)]',
  },
  decision: {
    icon: Diamond,
    border: 'border-primary/30',
    badge: 'bg-primary/10 text-primary border-primary/20',
    glow: 'shadow-[0_10px_30px_rgba(180,83,9,0.12)]',
  },
  subprocess: {
    icon: Circle,
    border: 'border-foreground/15',
    badge: 'bg-secondary text-secondary-foreground border-border',
    glow: 'shadow-[0_10px_30px_rgba(26,23,20,0.07)]',
  },
  actor: {
    icon: User,
    border: 'border-success/30',
    badge: 'bg-success/10 text-success border-success/20',
    glow: 'shadow-[0_10px_30px_rgba(47,122,77,0.1)]',
  },
  system: {
    icon: Server,
    border: 'border-foreground/20',
    badge: 'bg-muted text-foreground border-border',
    glow: 'shadow-[0_10px_30px_rgba(26,23,20,0.08)]',
  },
  note: {
    icon: FileText,
    border: 'border-warning-foreground/20',
    badge: 'bg-warning text-warning-foreground border-warning-foreground/10',
    glow: 'shadow-[0_10px_30px_rgba(180,83,9,0.08)]',
  },
} as const;

const typeLabels = {
  step: 'Step',
  decision: 'Decision',
  subprocess: 'Subprocess',
  actor: 'Actor',
  system: 'System',
  note: 'Note',
} as const;

function ProcessFlowNodeCard({ id, selected, data }: NodeProps<ProcessFlowCanvasNode>) {
  const nodeType = data.nodeType in typeStyles ? data.nodeType : 'step';
  const style = typeStyles[nodeType];
  const Icon = style.icon;

  return (
    <>
      <Handle
        type="target"
        position={Position.Left}
        data-testid={`processflow-handle-target-${id}`}
        className="!h-3 !w-3 !border-2 !border-background !bg-primary"
      />
      <div
        data-testid={`processflow-node-${nodeType}`}
        className={cn(
          'min-w-[220px] max-w-[280px] rounded-lg border bg-card px-4 py-3 text-left transition-all',
          style.border,
          style.glow,
          selected ? 'ring-2 ring-primary/35' : 'hover:border-primary/30',
        )}
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-background text-muted-foreground">
              <Icon className="size-4" />
            </div>
            <Badge variant="outline" className={cn('font-mono text-[10px] uppercase tracking-[0.08em]', style.badge)}>
              {typeLabels[nodeType]}
            </Badge>
          </div>
          {data.owner_role ? (
            <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
              {data.owner_role}
            </span>
          ) : null}
        </div>

        <div className="space-y-2">
          <div className="font-serif text-lg leading-tight text-foreground">{data.label}</div>
          {data.systems && data.systems.length > 0 ? (
            <div className="font-mono text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
              {data.systems.join(' / ')}
            </div>
          ) : null}
          {data.pain_points ? <p className="line-clamp-3 text-sm text-muted-foreground">{data.pain_points}</p> : null}
        </div>
      </div>
      <Handle
        type="source"
        position={Position.Right}
        data-testid={`processflow-handle-source-${id}`}
        className="!h-3 !w-3 !border-2 !border-background !bg-primary"
      />
    </>
  );
}

export const processFlowNodeTypes = {
  step: ProcessFlowNodeCard,
  decision: ProcessFlowNodeCard,
  subprocess: ProcessFlowNodeCard,
  actor: ProcessFlowNodeCard,
  system: ProcessFlowNodeCard,
  note: ProcessFlowNodeCard,
};
