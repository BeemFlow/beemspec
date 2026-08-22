import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { createPersonaSchema, updatePersonaSchema } from '@/domain/story-map';
import type { Supabase } from '@/lib/supabase/types';
import { createPersona, deletePersona, listPersonas, updatePersona } from '@/storymap/service';
import { getStoryContext } from '../queries';
import {
  describeDbError,
  destructiveAnnotations,
  errorResult,
  isNotFound,
  mutateAnnotations,
  readAnnotations,
  successResult,
  validateToolInput,
  withToolErrorBoundary,
} from '../tool-support';

export function registerPersonaTools(server: McpServer, supabase: Supabase): void {
  const getUserScopedClient = () => supabase;
  server.registerTool(
    'persona_list',
    {
      title: 'List Personas',
      description: 'List personas attached to a story map. Prefer storymap_get if you already need full map context.',
      inputSchema: {
        story_map_id: z.string().uuid(),
      },
      annotations: readAnnotations,
    },
    withToolErrorBoundary('persona_list', async ({ story_map_id }) => {
      const supabase = getUserScopedClient();
      const { data, error } = await listPersonas(supabase, story_map_id);

      if (error) return errorResult('Failed to load personas', describeDbError(error));
      return successResult(data ?? []);
    }),
  );

  server.registerTool(
    'persona_create',
    {
      title: 'Create Persona',
      description: 'Create a persona for a story map to capture user archetypes and goals.',
      inputSchema: createPersonaSchema.shape,
      annotations: mutateAnnotations,
    },
    withToolErrorBoundary('persona_create', async (input) => {
      const supabase = getUserScopedClient();
      const { data, error } = await createPersona(supabase, input);

      if (error) return errorResult('Failed to create persona', describeDbError(error));
      return successResult(data);
    }),
  );

  server.registerTool(
    'persona_update',
    {
      title: 'Update Persona',
      description: 'Update persona fields like name, description, or goals.',
      inputSchema: {
        persona_id: z.string().uuid(),
        ...updatePersonaSchema.shape,
      },
      annotations: mutateAnnotations,
    },
    withToolErrorBoundary('persona_update', async ({ persona_id, ...changes }) => {
      const validation = validateToolInput(updatePersonaSchema, changes);
      if (!validation.ok) return validation.result;

      const supabase = getUserScopedClient();
      const { data, error } = await updatePersona(supabase, persona_id, validation.data);

      if (error) {
        if (isNotFound(error)) return errorResult('Persona not found');
        return errorResult('Failed to update persona', describeDbError(error));
      }

      return successResult(data);
    }),
  );

  server.registerTool(
    'persona_delete',
    {
      title: 'Delete Persona',
      description: 'Destructive. Deletes a persona from the story map.',
      inputSchema: {
        persona_id: z.string().uuid(),
      },
      annotations: destructiveAnnotations,
    },
    withToolErrorBoundary('persona_delete', async ({ persona_id }) => {
      const supabase = getUserScopedClient();
      const { data, error } = await deletePersona(supabase, persona_id);

      if (error) {
        if (isNotFound(error)) return errorResult('Persona not found');
        return errorResult('Failed to delete persona', describeDbError(error));
      }

      return successResult({ deleted: data });
    }),
  );

  server.registerTool(
    'story_context_get',
    {
      title: 'Get Story Context',
      description:
        'Full implementation context for one story, including workflow placement, personas, and Figma hints when present. Use after selecting a story via storymap_get.',
      inputSchema: {
        story_id: z.string().uuid().describe('BeemSpec story UUID'),
      },
      annotations: readAnnotations,
    },
    withToolErrorBoundary('story_context_get', async ({ story_id }) => {
      const supabase = getUserScopedClient();
      const context = await getStoryContext(supabase, story_id);

      if (!context) {
        return errorResult('Story not found');
      }

      return successResult(context);
    }),
  );
}
