import type { McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';
import { createPersonaSchema, updatePersonaToolSchema } from '@/domain/story-map/schemas';
import type { Supabase } from '@/lib/supabase/types';
import { createPersona, deletePersona, listPersonas, updatePersona } from '@/storymap/service';
import { deletedRowSchema, successOutputSchema } from '../output-schemas';
import { getStoryContext } from '../queries';
import { personaRowSchema, storyContextSchema } from '../story-output-schemas';
import {
  createAnnotations,
  describeDbError,
  destructiveAnnotations,
  errorResult,
  isNotFound,
  readAnnotations,
  successResult,
  updateAnnotations,
  withToolErrorBoundary,
} from '../tool-support';

export function registerPersonaTools(server: McpServer, supabase: Supabase): void {
  server.registerTool(
    'persona_list',
    {
      title: 'List Personas',
      description: 'List personas attached to a story map. Prefer storymap_get if you already need full map context.',
      inputSchema: z.object({ story_map_id: z.string().uuid() }).strict(),
      outputSchema: successOutputSchema(z.array(personaRowSchema)),
      annotations: readAnnotations,
    },
    withToolErrorBoundary('persona_list', async ({ story_map_id }) => {
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
      inputSchema: createPersonaSchema,
      outputSchema: successOutputSchema(personaRowSchema),
      annotations: createAnnotations,
    },
    withToolErrorBoundary('persona_create', async (input) => {
      const { data, error } = await createPersona(supabase, input);

      if (error) return errorResult('Failed to create persona', describeDbError(error));
      return successResult(data);
    }),
  );

  server.registerTool(
    'persona_update',
    {
      title: 'Update Persona',
      description: 'Update at least one persona field such as name, description, or goals.',
      inputSchema: updatePersonaToolSchema,
      outputSchema: successOutputSchema(personaRowSchema),
      annotations: updateAnnotations,
    },
    withToolErrorBoundary('persona_update', async ({ persona_id, ...changes }) => {
      const { data, error } = await updatePersona(supabase, persona_id, changes);

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
      inputSchema: z.object({ persona_id: z.string().uuid() }).strict(),
      outputSchema: successOutputSchema(deletedRowSchema(personaRowSchema)),
      annotations: destructiveAnnotations,
    },
    withToolErrorBoundary('persona_delete', async ({ persona_id }) => {
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
      inputSchema: z.object({ story_id: z.string().uuid().describe('BeemSpec story UUID') }).strict(),
      outputSchema: successOutputSchema(storyContextSchema),
      annotations: readAnnotations,
    },
    withToolErrorBoundary('story_context_get', async ({ story_id }) => {
      const context = await getStoryContext(supabase, story_id);

      if (!context) {
        return errorResult('Story not found');
      }

      return successResult(context);
    }),
  );
}
