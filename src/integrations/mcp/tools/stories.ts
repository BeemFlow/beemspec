import type { McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';
import { createStorySchema, moveStorySchema, reorderStoriesSchema } from '@/domain/story-map';
import { updateStoryToolSchema } from '@/domain/story-map/schemas';
import type { Supabase } from '@/lib/supabase/types';
import { createStory, deleteStory, getStory, moveStory, reorderStories, updateStory } from '@/storymap/service';
import { buildMutationGuidance } from '../insights/story-map';
import { getStoryContext } from '../queries';
import {
  describeDbError,
  destructiveAnnotations,
  errorResult,
  isNotFound,
  mutateAnnotations,
  readAnnotations,
  successResult,
  withToolErrorBoundary,
} from '../tool-support';

const moveStoryToolSchema = moveStorySchema.extend({ story_id: z.string().uuid() });

export function registerStoryTools(server: McpServer, supabase: Supabase): void {
  const getUserScopedClient = () => supabase;
  server.registerTool(
    'story_get',
    {
      title: 'Get Story',
      description: 'Load one story by ID when full map context is not required.',
      inputSchema: z.object({ story_id: z.string().uuid() }).strict(),
      annotations: readAnnotations,
    },
    withToolErrorBoundary('story_get', async ({ story_id }) => {
      const supabase = getUserScopedClient();
      const { data, error } = await getStory(supabase, story_id);

      if (error) {
        if (isNotFound(error)) return errorResult('Story not found');
        return errorResult('Failed to load story', describeDbError(error));
      }
      const context = await getStoryContext(supabase, story_id);
      return successResult({
        ...data,
        agent_context: context,
      });
    }),
  );

  server.registerTool(
    'story_create',
    {
      title: 'Create Story',
      description: 'Create a story in a task/release cell. Requires task_id and structured story content.',
      inputSchema: createStorySchema,
      annotations: mutateAnnotations,
    },
    withToolErrorBoundary('story_create', async (input) => {
      const supabase = getUserScopedClient();
      const { data, error } = await createStory(supabase, input);

      if (error) return errorResult('Failed to create story', describeDbError(error));
      return successResult({
        ...data,
        agent_guidance: buildMutationGuidance({
          entityType: 'story',
          operation: 'create',
          ids: { story_id: data.id, task_id: data.task_id, release_id: data.release_id },
          entity: data,
        }),
      });
    }),
  );

  server.registerTool(
    'story_update',
    {
      title: 'Update Story',
      description:
        'Update story fields like title, status, or content. Use story_move for task/release placement changes.',
      inputSchema: updateStoryToolSchema,
      annotations: mutateAnnotations,
    },
    withToolErrorBoundary('story_update', async ({ story_id, ...changes }) => {
      const supabase = getUserScopedClient();
      const { data, error } = await updateStory(supabase, story_id, changes);

      if (error) {
        if (isNotFound(error)) return errorResult('Story not found');
        return errorResult('Failed to update story', describeDbError(error));
      }
      return successResult({
        ...data,
        agent_guidance: buildMutationGuidance({
          entityType: 'story',
          operation: 'update',
          ids: { story_id: data.id, task_id: data.task_id, release_id: data.release_id },
          entity: data,
        }),
      });
    }),
  );

  server.registerTool(
    'story_delete',
    {
      title: 'Delete Story',
      description: 'Destructive. Deletes a story from the map.',
      inputSchema: z.object({ story_id: z.string().uuid() }).strict(),
      annotations: destructiveAnnotations,
    },
    withToolErrorBoundary('story_delete', async ({ story_id }) => {
      const supabase = getUserScopedClient();
      const { data, error } = await deleteStory(supabase, story_id);

      if (error) {
        if (isNotFound(error)) return errorResult('Story not found');
        return errorResult('Failed to delete story', describeDbError(error));
      }

      return successResult({ deleted: data });
    }),
  );

  server.registerTool(
    'story_reorder',
    {
      title: 'Reorder Stories',
      description: 'Reorder stories within a specific task+release cell using a full ordered story ID list.',
      inputSchema: reorderStoriesSchema,
      annotations: mutateAnnotations,
    },
    withToolErrorBoundary('story_reorder', async ({ task_id, release_id, order }) => {
      const supabase = getUserScopedClient();
      const { error } = await reorderStories(supabase, { task_id, release_id, order });

      if (error) return errorResult('Failed to reorder stories', describeDbError(error));
      return successResult({
        reordered: order.length,
        task_id,
        release_id,
        agent_guidance: buildMutationGuidance({
          entityType: 'story',
          operation: 'reorder',
          ids: { task_id, release_id },
        }),
      });
    }),
  );

  server.registerTool(
    'story_move',
    {
      title: 'Move Story',
      description: 'Atomically move a story to another task/release cell and set full target order in one operation.',
      inputSchema: moveStoryToolSchema,
      annotations: mutateAnnotations,
    },
    withToolErrorBoundary('story_move', async ({ story_id, ...input }) => {
      const supabase = getUserScopedClient();
      const { error } = await moveStory(supabase, story_id, input);

      if (error) return errorResult('Failed to move story', describeDbError(error));
      return successResult({
        moved: story_id,
        target_task_id: input.target_task_id,
        target_release_id: input.target_release_id,
        target_order_size: input.target_order.length,
        agent_guidance: buildMutationGuidance({
          entityType: 'story',
          operation: 'move',
          ids: { story_id, task_id: input.target_task_id, release_id: input.target_release_id },
        }),
      });
    }),
  );
}
