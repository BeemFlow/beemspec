'use client';

import { ArrowLeft, GitBranch, Network, Plus, RefreshCw, ScanSearch, Sparkles, User } from 'lucide-react';
import Link from 'next/link';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';

interface ProcessFlowToolbarProps {
  name: string;
  nodeCount: number;
  edgeCount: number;
  warningCount: number;
  onCreateNode: (type: 'step' | 'decision' | 'actor' | 'system' | 'note') => void;
  onAutolayout: () => void;
  onValidate: () => void;
  onReload: () => void;
}

export function ProcessFlowToolbar(props: ProcessFlowToolbarProps) {
  return (
    <div className="border-b bg-background/90 px-4 py-3 backdrop-blur-sm">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/">
              <ArrowLeft className="size-4" />
              Back
            </Link>
          </Button>
          <div>
            <div className="font-serif text-2xl text-foreground">{props.name}</div>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <Badge variant="outline">{props.nodeCount} nodes</Badge>
              <Badge variant="outline">{props.edgeCount} edges</Badge>
              <Badge variant="outline">{props.warningCount} warnings</Badge>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => props.onCreateNode('step')}>
            <Plus className="size-4" />
            Step
          </Button>
          <Button variant="outline" size="sm" onClick={() => props.onCreateNode('decision')}>
            <GitBranch className="size-4" />
            Decision
          </Button>
          <Button variant="outline" size="sm" onClick={() => props.onCreateNode('actor')}>
            <User className="size-4" />
            Actor
          </Button>
          <Button variant="outline" size="sm" onClick={() => props.onCreateNode('system')}>
            <Network className="size-4" />
            System
          </Button>
          <Button variant="outline" size="sm" onClick={() => props.onCreateNode('note')}>
            <Sparkles className="size-4" />
            Note
          </Button>
          <Button variant="secondary" size="sm" onClick={props.onAutolayout}>
            <RefreshCw className="size-4" />
            Auto-layout
          </Button>
          <Button variant="secondary" size="sm" onClick={props.onValidate}>
            <ScanSearch className="size-4" />
            Validate
          </Button>
          <Button variant="ghost" size="sm" onClick={props.onReload}>
            Reload
          </Button>
        </div>
      </div>
    </div>
  );
}
