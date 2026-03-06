import type { Plugin } from '@opencode-ai/plugin';
import { compactedContextForStories } from './plugin';
import type { OpenCodeSessionContext } from './types';

function getMcpUrl(): string | null {
  const explicit = process.env.BEEMSPEC_MCP_URL?.trim();
  if (explicit) return explicit;

  const apiUrl = process.env.BEEMSPEC_API_URL?.trim();
  if (!apiUrl) return null;
  return `${apiUrl.replace(/\/$/, '')}/api/mcp`;
}

function getMcpToken(): string | null {
  const value = process.env.BEEMSPEC_MCP_TOKEN;
  return value?.trim() || null;
}

function getStoryMapId(): string | null {
  const value = process.env.BEEMSPEC_STORY_MAP_ID;
  return value?.trim() || null;
}

function getTargetReleaseId(): string | null {
  const value = process.env.BEEMSPEC_RELEASE_ID;
  return value?.trim() || null;
}

interface StoryRow {
  id: string;
  release_id: string | null;
  title: string;
  status: string;
  content?: {
    requirements?: string;
    acceptance_criteria?: string;
    technical_guidelines?: string | null;
  };
}

interface StoryMapToolResult {
  activities?: Array<{
    tasks?: Array<{
      stories?: StoryRow[];
    }>;
  }>;
}

async function callMcpStoryMapGet(): Promise<StoryMapToolResult | null> {
  const mcpUrl = getMcpUrl();
  const mcpToken = getMcpToken();
  const storyMapId = getStoryMapId();
  if (!mcpUrl || !mcpToken || !storyMapId) return null;

  const requestBody = {
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/call',
    params: {
      name: 'storymap_get',
      arguments: {
        story_map_id: storyMapId,
      },
    },
  };

  try {
    const response = await fetch(mcpUrl, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${mcpToken}`,
        accept: 'application/json, text/event-stream',
        'content-type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });
    if (!response.ok) return null;

    const payload = (await response.json()) as {
      result?: {
        structuredContent?: {
          ok?: boolean;
          data?: StoryMapToolResult;
        };
      };
    };

    if (!payload.result?.structuredContent?.ok) return null;
    return payload.result.structuredContent.data ?? null;
  } catch {
    return null;
  }
}

function toSessionStories(toolResult: StoryMapToolResult): OpenCodeSessionContext[] {
  const releaseId = getTargetReleaseId();
  const stories: OpenCodeSessionContext[] = [];

  for (const activity of toolResult.activities ?? []) {
    for (const task of activity.tasks ?? []) {
      for (const story of task.stories ?? []) {
        if (releaseId && story.release_id !== releaseId) continue;
        if (story.status === 'done') continue;

        stories.push({
          releaseId: story.release_id ?? '',
          storyId: story.id,
          storyTitle: story.title,
          requirements: story.content?.requirements ?? '',
          acceptanceCriteria: story.content?.acceptance_criteria ?? '',
          technicalGuidelines: story.content?.technical_guidelines ?? null,
        });
      }
    }
  }

  return stories.slice(0, 8);
}

export const BeemSpecPlugin: Plugin = async () => {
  return {
    'experimental.session.compacting': async (_input, output) => {
      output.context.push(
        'BeemSpec workflow: call MCP tool storymap_get first, then story_context_get per story before coding.',
      );

      const toolResult = await callMcpStoryMapGet();
      if (!toolResult) return;

      const stories = toSessionStories(toolResult);
      if (stories.length === 0) return;
      output.context.push(...compactedContextForStories(stories));
    },
  };
};

export default BeemSpecPlugin;
