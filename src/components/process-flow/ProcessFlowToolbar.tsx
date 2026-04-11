'use client';

import { Bot, FileText, GitBranch, Network, Plus, RefreshCw, ScanSearch, Settings, Sparkles, User } from 'lucide-react';
import { EditorHeader } from '@/components/EditorHeader';
import { RouteRefreshButton } from '@/components/RouteRefreshButton';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

interface ProcessFlowToolbarProps {
  name: string;
  warningCount: number;
  validationOpen: boolean;
  onCreateNode: (type: 'step' | 'decision' | 'actor' | 'system' | 'note') => void;
  onAutolayout: () => void;
  onToggleValidation: () => void;
  onOpenContext: () => void;
  onOpenMcpSetup: () => void;
  onRefresh: () => void;
  onOpenSettings: () => void;
}

export function ProcessFlowToolbar(props: ProcessFlowToolbarProps) {
  return (
    <EditorHeader
      title={props.name}
      actions={
        <div className="flex flex-wrap items-center justify-end gap-2">
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
          <Button variant="outline" size="sm" onClick={props.onAutolayout}>
            <RefreshCw className="size-4" />
            Auto-layout
          </Button>
          <div className="relative">
            <Button variant="outline" size="sm" onClick={props.onToggleValidation}>
              <ScanSearch className="size-4" />
              Validate
            </Button>
            {props.warningCount > 0 ? (
              <Badge
                variant="default"
                data-testid="processflow-warning-count"
                className="pointer-events-none absolute -right-1 -top-1.5 h-4 min-w-4 justify-center rounded-sm px-0.5 text-[10px] leading-none shadow-sm"
              >
                {props.warningCount}
              </Badge>
            ) : null}
          </div>
          <Button variant="ghost" size="icon" onClick={props.onOpenContext} aria-label="Process flow context">
            <FileText className="size-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={props.onOpenMcpSetup} aria-label="Connect MCP Client">
            <Bot className="size-4" />
          </Button>
          <RouteRefreshButton onRefresh={props.onRefresh} label="Refresh process flow" />
          <Button variant="ghost" size="icon" onClick={props.onOpenSettings} aria-label="Process flow settings">
            <Settings className="size-4" />
          </Button>
        </div>
      }
    />
  );
}
