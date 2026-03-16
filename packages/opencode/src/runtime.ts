import { compactedContextForStories } from './plugin';
import type { OpenCodeSessionContext } from './types';

type SessionCompactingHook = (_input: unknown, output: { context: string[] }) => Promise<void> | void;
type Plugin = () => Promise<{
  'experimental.session.compacting': SessionCompactingHook;
}>;

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
    user_story?: string;
    acceptance_criteria?: string;
    edge_cases?: string | null;
    technical_guidelines?: string | null;
    figma_link?: string | null;
  };
}

interface StoryMapToolResult {
  releases?: Array<{
    id: string;
    name: string;
  }>;
  personas?: Array<{
    name: string;
    goals?: string | null;
  }>;
  activities?: Array<{
    name?: string;
    tasks?: Array<{
      name?: string;
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
  const releaseNames = new Map((toolResult.releases ?? []).map((release) => [release.id, release.name]));
  const stories: OpenCodeSessionContext[] = [];

  for (const activity of toolResult.activities ?? []) {
    for (const task of activity.tasks ?? []) {
      for (const story of task.stories ?? []) {
        if (releaseId && story.release_id !== releaseId) continue;
        if (story.status === 'done') continue;

        stories.push({
          releaseId: story.release_id ?? '',
          releaseName: story.release_id ? (releaseNames.get(story.release_id) ?? null) : null,
          storyId: story.id,
          storyTitle: story.title,
          activityName: activity.name ?? '',
          taskName: task.name ?? '',
          userStory: story.content?.user_story ?? '',
          acceptanceCriteria: story.content?.acceptance_criteria ?? '',
          edgeCases: story.content?.edge_cases ?? null,
          technicalGuidelines: story.content?.technical_guidelines ?? null,
          figmaLink: story.content?.figma_link ?? null,
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
        'BeemSpec workflow: call storymap_workflow_guide first and treat it as the operating standard for planning, clarification, and implementation behavior; then use storymap_get for whole-map or release planning and story_context_get only for the specific story you are implementing or deeply refining.',
      );

      const toolResult = await callMcpStoryMapGet();
      if (!toolResult) return;

      if ((toolResult.personas ?? []).length > 0) {
        const personaSummary = toolResult.personas
          ?.map((persona) => `${persona.name}${persona.goals ? ` - Goals: ${persona.goals}` : ''}`)
          .join(' | ');
        if (personaSummary) {
          output.context.push(`BeemSpec personas: ${personaSummary}`);
        }
      }

      const stories = toSessionStories(toolResult);
      if (stories.length === 0) return;
      output.context.push(...compactedContextForStories(stories));
    },
  };
};

export default BeemSpecPlugin;
