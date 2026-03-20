'use client';

import { Bot, Check, Copy } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { Story } from '@/types';

export function buildReleaseKickoffPrompt(input: {
  storyMapId: string;
  storyMapName: string;
  releaseId: string;
  releaseName: string;
}): string {
  return [
    'Working in BeemSpec via MCP.',
    'Call `storymap_workflow_guide` first and treat it as the operating standard for planning, clarification, and implementation behavior.',
    `Start with story_map_id: ${input.storyMapId}`,
    `Story map: ${input.storyMapName}`,
    `Target release_id: ${input.releaseId}`,
    `Target release: ${input.releaseName}`,
  ].join('\n');
}

export function buildStoryKickoffPrompt(input: { storyMapId: string; storyMapName: string; story: Story }): string {
  return [
    'Working in BeemSpec via MCP.',
    'Call `storymap_workflow_guide` first and treat it as the operating standard for planning, clarification, and implementation behavior.',
    `Start with story_map_id: ${input.storyMapId}`,
    `Story map: ${input.storyMapName}`,
    `Target story_id: ${input.story.id}`,
    `Target story: ${input.story.title}`,
    `Current release_id: ${input.story.release_id ?? 'backlog'}`,
  ].join('\n');
}

interface AgentKickoffButtonProps {
  prompt: string;
  label?: string;
  tooltip: string;
  className?: string;
  iconOnly?: boolean;
  variant?: 'ghost' | 'outline' | 'default';
  size?: 'default' | 'sm' | 'icon';
}

export function AgentKickoffButton({
  prompt,
  label = 'Copy Agent Kickoff Prompt',
  tooltip,
  className,
  iconOnly = false,
  variant = 'outline',
  size = 'sm',
}: AgentKickoffButtonProps) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    if (typeof navigator === 'undefined' || !navigator.clipboard) return;
    await navigator.clipboard.writeText(prompt);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }

  const icon = copied ? (
    <Check className="h-4 w-4" />
  ) : iconOnly ? (
    <Bot className="h-4 w-4" />
  ) : (
    <Copy className="h-4 w-4" />
  );

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant={variant}
          size={size}
          className={className}
          onClick={handleCopy}
          aria-label={copied ? 'Copied agent kickoff prompt' : label}
        >
          {iconOnly ? (
            icon
          ) : (
            <>
              {icon}
              <span className="ml-2">{copied ? 'Copied' : label}</span>
            </>
          )}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{copied ? 'Copied' : tooltip}</TooltipContent>
    </Tooltip>
  );
}
