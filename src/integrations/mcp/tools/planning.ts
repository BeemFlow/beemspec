import type { McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';
import {
  createActivitySchema,
  createReleaseSchema,
  createTaskSchema,
  moveTaskSchema,
  reorderActivitiesSchema,
  reorderReleasesSchema,
  reorderTasksSchema,
} from '@/domain/story-map';
import { updateActivityToolSchema, updateReleaseToolSchema, updateTaskToolSchema } from '@/domain/story-map/schemas';
import type { Supabase } from '@/lib/supabase/types';
import {
  createActivity,
  createRelease,
  createTask,
  deleteActivity,
  deleteRelease,
  deleteTask,
  moveTask,
  reorderActivities,
  reorderReleases,
  reorderTasks,
  updateActivity,
  updateRelease,
  updateTask,
} from '@/storymap/service';
import { buildMutationGuidance } from '../insights/story-map';
import { deletedRowSchema, mcpUuidSchema, nonNegativeCountSchema, successOutputSchema } from '../output-schemas';
import {
  createAnnotations,
  describeDbError,
  destructiveAnnotations,
  errorResult,
  isNotFound,
  successResult,
  updateAnnotations,
  withToolErrorBoundary,
} from '../tool-support';

const moveTaskToolSchema = moveTaskSchema.extend({ task_id: z.string().uuid() });
const nullableTextSchema = z.string().nullable();
const mutationGuidanceSchema = z
  .object({
    next_recommended_reads: z.array(z.string()),
    verification_hints: z.array(z.string()),
    warnings: z.array(z.string()),
  })
  .strict();
const activityRowSchema = z
  .object({
    id: mcpUuidSchema,
    story_map_id: mcpUuidSchema,
    name: z.string(),
    description: nullableTextSchema,
    sort_order: z.number().int(),
  })
  .passthrough();
const taskRowSchema = z
  .object({
    id: mcpUuidSchema,
    activity_id: mcpUuidSchema,
    name: z.string(),
    description: nullableTextSchema,
    sort_order: z.number().int(),
  })
  .passthrough();
const releaseRowSchema = z
  .object({
    id: mcpUuidSchema,
    story_map_id: mcpUuidSchema,
    name: z.string(),
    description: nullableTextSchema,
    context_markdown: nullableTextSchema,
    sort_order: z.number().int(),
  })
  .passthrough();
const activityMutationSchema = activityRowSchema.extend({ agent_guidance: mutationGuidanceSchema });
const taskMutationSchema = taskRowSchema.extend({ agent_guidance: mutationGuidanceSchema });
const releaseMutationSchema = releaseRowSchema.extend({ agent_guidance: mutationGuidanceSchema });
const reorderedOutputSchema = z
  .object({
    reordered: nonNegativeCountSchema,
    agent_guidance: mutationGuidanceSchema,
  })
  .passthrough();

export function registerPlanningTools(server: McpServer, supabase: Supabase): void {
  const getUserScopedClient = () => supabase;
  server.registerTool(
    'activity_create',
    {
      title: 'Create Activity',
      description: 'Create an activity column in a story map. Use IDs from storymap_get and refresh after mutation.',
      inputSchema: createActivitySchema,
      outputSchema: successOutputSchema(activityMutationSchema),
      annotations: createAnnotations,
    },
    withToolErrorBoundary('activity_create', async (input) => {
      const supabase = getUserScopedClient();
      const { data, error } = await createActivity(supabase, input);

      if (error) return errorResult('Failed to create activity', describeDbError(error));
      return successResult({
        ...data,
        agent_guidance: buildMutationGuidance({
          entityType: 'activity',
          operation: 'create',
          entity: data,
        }),
      });
    }),
  );

  server.registerTool(
    'activity_update',
    {
      title: 'Update Activity',
      description:
        'Update at least one activity field such as name or description. Use reorder tools for position changes.',
      inputSchema: updateActivityToolSchema,
      outputSchema: successOutputSchema(activityMutationSchema),
      annotations: updateAnnotations,
    },
    withToolErrorBoundary('activity_update', async ({ activity_id, ...changes }) => {
      const supabase = getUserScopedClient();
      const { data, error } = await updateActivity(supabase, activity_id, changes);

      if (error) {
        if (isNotFound(error)) return errorResult('Activity not found');
        return errorResult('Failed to update activity', describeDbError(error));
      }
      return successResult({
        ...data,
        agent_guidance: buildMutationGuidance({
          entityType: 'activity',
          operation: 'update',
          entity: data,
        }),
      });
    }),
  );

  server.registerTool(
    'activity_delete',
    {
      title: 'Delete Activity',
      description: 'Destructive. Deletes an activity and all nested tasks/stories under it.',
      inputSchema: z.object({ activity_id: z.string().uuid() }).strict(),
      outputSchema: successOutputSchema(deletedRowSchema(activityRowSchema)),
      annotations: destructiveAnnotations,
    },
    withToolErrorBoundary('activity_delete', async ({ activity_id }) => {
      const supabase = getUserScopedClient();
      const { data, error } = await deleteActivity(supabase, activity_id);

      if (error) {
        if (isNotFound(error)) return errorResult('Activity not found');
        return errorResult('Failed to delete activity', describeDbError(error));
      }
      return successResult({ deleted: data });
    }),
  );

  server.registerTool(
    'activity_reorder',
    {
      title: 'Reorder Activities',
      description: 'Reorder activities in final sequence. Provide full ordered ID list from storymap_get context.',
      inputSchema: reorderActivitiesSchema,
      outputSchema: successOutputSchema(reorderedOutputSchema),
      annotations: updateAnnotations,
    },
    withToolErrorBoundary('activity_reorder', async ({ story_map_id, order }) => {
      const supabase = getUserScopedClient();
      const { error } = await reorderActivities(supabase, { story_map_id, order });

      if (error) return errorResult('Failed to reorder activities', describeDbError(error));
      return successResult({
        reordered: order.length,
        agent_guidance: buildMutationGuidance({
          entityType: 'activity',
          operation: 'reorder',
          ids: { story_map_id },
        }),
      });
    }),
  );

  server.registerTool(
    'task_create',
    {
      title: 'Create Task',
      description: 'Create a task under an activity. Choose target activity from storymap_get output.',
      inputSchema: createTaskSchema,
      outputSchema: successOutputSchema(taskMutationSchema),
      annotations: createAnnotations,
    },
    withToolErrorBoundary('task_create', async (input) => {
      const supabase = getUserScopedClient();
      const { data, error } = await createTask(supabase, input);

      if (error) return errorResult('Failed to create task', describeDbError(error));
      return successResult({
        ...data,
        agent_guidance: buildMutationGuidance({
          entityType: 'task',
          operation: 'create',
          entity: data,
        }),
      });
    }),
  );

  server.registerTool(
    'task_update',
    {
      title: 'Update Task',
      description:
        'Update at least one task field such as name or description. Use move/reorder for placement changes.',
      inputSchema: updateTaskToolSchema,
      outputSchema: successOutputSchema(taskMutationSchema),
      annotations: updateAnnotations,
    },
    withToolErrorBoundary('task_update', async ({ task_id, ...changes }) => {
      const supabase = getUserScopedClient();
      const { data, error } = await updateTask(supabase, task_id, changes);

      if (error) {
        if (isNotFound(error)) return errorResult('Task not found');
        return errorResult('Failed to update task', describeDbError(error));
      }
      return successResult({
        ...data,
        agent_guidance: buildMutationGuidance({
          entityType: 'task',
          operation: 'update',
          entity: data,
        }),
      });
    }),
  );

  server.registerTool(
    'task_delete',
    {
      title: 'Delete Task',
      description: 'Destructive. Deletes a task and all stories under it.',
      inputSchema: z.object({ task_id: z.string().uuid() }).strict(),
      outputSchema: successOutputSchema(deletedRowSchema(taskRowSchema)),
      annotations: destructiveAnnotations,
    },
    withToolErrorBoundary('task_delete', async ({ task_id }) => {
      const supabase = getUserScopedClient();
      const { data, error } = await deleteTask(supabase, task_id);

      if (error) {
        if (isNotFound(error)) return errorResult('Task not found');
        return errorResult('Failed to delete task', describeDbError(error));
      }
      return successResult({ deleted: data });
    }),
  );

  server.registerTool(
    'task_reorder',
    {
      title: 'Reorder Tasks',
      description: 'Reorder tasks within an activity. Provide full ordered ID list for that activity.',
      inputSchema: reorderTasksSchema,
      outputSchema: successOutputSchema(reorderedOutputSchema),
      annotations: updateAnnotations,
    },
    withToolErrorBoundary('task_reorder', async ({ activity_id, order }) => {
      const supabase = getUserScopedClient();
      const { error } = await reorderTasks(supabase, { activity_id, order });

      if (error) return errorResult('Failed to reorder tasks', describeDbError(error));
      return successResult({
        reordered: order.length,
        agent_guidance: buildMutationGuidance({
          entityType: 'task',
          operation: 'reorder',
          ids: { activity_id },
        }),
      });
    }),
  );

  server.registerTool(
    'task_move',
    {
      title: 'Move Task',
      description: 'Atomically move a task to another activity and set full target order in one operation.',
      inputSchema: moveTaskToolSchema,
      outputSchema: successOutputSchema(
        z
          .object({
            moved: mcpUuidSchema,
            target_activity_id: mcpUuidSchema,
            target_order_size: nonNegativeCountSchema,
            agent_guidance: mutationGuidanceSchema,
          })
          .strict(),
      ),
      annotations: updateAnnotations,
    },
    withToolErrorBoundary('task_move', async ({ task_id, ...input }) => {
      const supabase = getUserScopedClient();
      const { error } = await moveTask(supabase, task_id, input);

      if (error) return errorResult('Failed to move task', describeDbError(error));
      return successResult({
        moved: task_id,
        target_activity_id: input.target_activity_id,
        target_order_size: input.target_order.length,
        agent_guidance: buildMutationGuidance({
          entityType: 'task',
          operation: 'move',
          ids: { task_id, target_activity_id: input.target_activity_id },
        }),
      });
    }),
  );

  server.registerTool(
    'release_create',
    {
      title: 'Create Release',
      description: 'Create a release lane (row) in a story map. Useful before placing or moving stories.',
      inputSchema: createReleaseSchema,
      outputSchema: successOutputSchema(releaseMutationSchema),
      annotations: createAnnotations,
    },
    withToolErrorBoundary('release_create', async (input) => {
      const supabase = getUserScopedClient();
      const { data, error } = await createRelease(supabase, input);

      if (error) return errorResult('Failed to create release', describeDbError(error));
      return successResult({
        ...data,
        agent_guidance: buildMutationGuidance({
          entityType: 'release',
          operation: 'create',
          entity: data,
        }),
      });
    }),
  );

  server.registerTool(
    'release_update',
    {
      title: 'Update Release',
      description:
        'Update at least one release field such as name, description, or context. Use reorder for position changes.',
      inputSchema: updateReleaseToolSchema,
      outputSchema: successOutputSchema(releaseMutationSchema),
      annotations: updateAnnotations,
    },
    withToolErrorBoundary('release_update', async ({ release_id, ...changes }) => {
      const supabase = getUserScopedClient();
      const { data, error } = await updateRelease(supabase, release_id, changes);

      if (error) {
        if (isNotFound(error)) return errorResult('Release not found');
        return errorResult('Failed to update release', describeDbError(error));
      }
      return successResult({
        ...data,
        agent_guidance: buildMutationGuidance({
          entityType: 'release',
          operation: 'update',
          entity: data,
        }),
      });
    }),
  );

  server.registerTool(
    'release_delete',
    {
      title: 'Delete Release',
      description: 'Destructive. Deletes a release and stories currently assigned to that release.',
      inputSchema: z.object({ release_id: z.string().uuid() }).strict(),
      outputSchema: successOutputSchema(deletedRowSchema(releaseRowSchema)),
      annotations: destructiveAnnotations,
    },
    withToolErrorBoundary('release_delete', async ({ release_id }) => {
      const supabase = getUserScopedClient();
      const { data, error } = await deleteRelease(supabase, release_id);

      if (error) {
        if (isNotFound(error)) return errorResult('Release not found');
        return errorResult('Failed to delete release', describeDbError(error));
      }
      return successResult({ deleted: data });
    }),
  );

  server.registerTool(
    'release_reorder',
    {
      title: 'Reorder Releases',
      description: 'Reorder release lanes in final sequence. Provide full ordered release ID list.',
      inputSchema: reorderReleasesSchema,
      outputSchema: successOutputSchema(reorderedOutputSchema),
      annotations: updateAnnotations,
    },
    withToolErrorBoundary('release_reorder', async ({ story_map_id, order }) => {
      const supabase = getUserScopedClient();
      const { error } = await reorderReleases(supabase, { story_map_id, order });

      if (error) return errorResult('Failed to reorder releases', describeDbError(error));
      return successResult({
        reordered: order.length,
        agent_guidance: buildMutationGuidance({
          entityType: 'release',
          operation: 'reorder',
          ids: { story_map_id },
        }),
      });
    }),
  );
}
