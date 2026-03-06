'use client';

import { Check, Copy } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { Release } from '@/types';

interface Props {
  storyMapId: string;
  storyMapName: string;
  releases: Release[];
}

function buildStarterPrompt(input: {
  storyMapId: string;
  storyMapName: string;
  releaseId: string;
  releaseName: string;
}): string {
  return [
    'You are working in BeemSpec through the MCP server.',
    `Target story map: ${input.storyMapName} (${input.storyMapId})`,
    `Target release: ${input.releaseName} (${input.releaseId})`,
    '',
    'Workflow:',
    '1) CALL storymap_workflow_guide FIRST BEFORE TOUCHING THE STORYMAP.',
    '2) Call storymap_get with the exact story_map_id shown above.',
    '3) Focus only stories assigned to the target release_id.',
    '4) Pick the best next story to implement and call story_context_get for it before coding.',
    '5) Implement the change, then update story status using story_update.',
    '6) If blocked, use story_update to set status and capture blocker details in the story content.',
    '',
    'Do not ask for full map context from me; fetch it through MCP tools now.',
  ].join('\n');
}

export function AgentKickoffPanel({ storyMapId, storyMapName, releases }: Props) {
  const sortedReleases = useMemo(
    () => [...releases].sort((left, right) => left.sort_order - right.sort_order),
    [releases],
  );
  const [selectedReleaseId, setSelectedReleaseId] = useState<string | null>(sortedReleases[0]?.id ?? null);
  const [copied, setCopied] = useState(false);

  const selectedRelease = sortedReleases.find((release) => release.id === selectedReleaseId) ?? null;

  const prompt = selectedRelease
    ? buildStarterPrompt({
        storyMapId,
        storyMapName,
        releaseId: selectedRelease.id,
        releaseName: selectedRelease.name,
      })
    : 'No release selected.';

  async function handleCopyPrompt() {
    if (!selectedRelease || typeof navigator === 'undefined' || !navigator.clipboard) return;
    await navigator.clipboard.writeText(prompt);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }

  if (sortedReleases.length === 0) return null;

  return (
    <Card className="mb-4 gap-4 py-4">
      <CardHeader className="px-4">
        <CardTitle className="text-sm">Agent Kickoff</CardTitle>
        <CardDescription>
          Copy a starter prompt that tells your coding agent to fetch release context via MCP.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 px-4">
        <div className="flex flex-wrap gap-2">
          {sortedReleases.map((release) => {
            const isSelected = release.id === selectedReleaseId;
            return (
              <Button
                key={release.id}
                size="sm"
                variant={isSelected ? 'default' : 'outline'}
                onClick={() => setSelectedReleaseId(release.id)}
              >
                {release.name}
              </Button>
            );
          })}
        </div>

        <div className="rounded-md border bg-muted/30 p-3">
          <pre className="overflow-auto text-xs whitespace-pre-wrap">{prompt}</pre>
        </div>

        <Button size="sm" onClick={handleCopyPrompt} disabled={!selectedRelease}>
          {copied ? <Check className="mr-2 h-4 w-4" /> : <Copy className="mr-2 h-4 w-4" />}
          {copied ? 'Copied' : 'Copy Starter Prompt'}
        </Button>
      </CardContent>
    </Card>
  );
}
