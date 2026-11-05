import { z } from 'zod';

const uuid = (description: string) => z.string().uuid().describe(description);
const nullableText = (description: string, minimumLength = 1) =>
  z.string().min(minimumLength).nullable().describe(`${description} Pass null to clear it.`);
const name = (description: string) => z.string().min(1, 'Required').max(200).describe(description);
const nonEmptyLabel = (description: string) => z.string().min(1, 'Required').max(200).describe(description);
const metadataText = (description: string) => nullableText(description, 0);
const stringList = (description: string, itemDescription: string) =>
  z.array(z.string().describe(itemDescription)).describe(description);

export const processFlowViewportSchema = z
  .object({
    x: z.number().finite().describe('Canvas viewport horizontal offset in pixels.'),
    y: z.number().finite().describe('Canvas viewport vertical offset in pixels.'),
    zoom: z.number().finite().positive().describe('Positive canvas zoom multiplier.'),
  })
  .strict();

export const processFlowNodeTypeSchema = z
  .enum(['step', 'decision', 'subprocess', 'actor', 'system', 'note'])
  .describe('Semantic node type used to render and interpret the process step.');

export const processFlowEdgeTypeSchema = z
  .enum(['flow', 'handoff', 'exception', 'dependency'])
  .describe('Semantic relationship represented by the edge.');

export const processFlowNodeDataSchema = z
  .object({
    label: nonEmptyLabel('Short text displayed inside the node.'),
    owner_role: metadataText('Role accountable for this step.').optional(),
    systems: stringList('Systems or applications involved in this step.', 'System or application name.').optional(),
    inputs: stringList('Information or artifacts consumed by this step.', 'Input name or description.').optional(),
    outputs: stringList('Information or artifacts produced by this step.', 'Output name or description.').optional(),
    pain_points: metadataText('Known friction, failures, or user pain at this step.').optional(),
    notes: metadataText('Additional operational notes for this step.').optional(),
    automation_opportunity: metadataText('Potential automation or improvement opportunity.').optional(),
    frequency: metadataText('How often this step occurs, expressed in natural language.').optional(),
    estimated_duration: metadataText('Typical elapsed or active duration, including units.').optional(),
    time_constraint: metadataText('Deadline, timing window, or service-level constraint.').optional(),
  })
  .strict();

export const processFlowEdgeDataSchema = z
  .object({
    label: metadataText('Short text displayed on the connection.').optional(),
    condition: metadataText('Rule or event that determines when this path is taken.').optional(),
  })
  .strict();

export const processFlowBase = z
  .object({
    team_id: uuid('Team UUID that owns the process flow.'),
    name: name('Human-readable process flow name.'),
    description: nullableText('Short process flow description.'),
    context_markdown: nullableText(
      'Long-form Markdown operational context, decisions, constraints, and links for agents.',
    ),
    viewport: processFlowViewportSchema
      .nullable()
      .optional()
      .describe(
        'Complete saved viewport. On update, replaces all viewport values. Pass null to clear it; omit to keep it.',
      ),
  })
  .strict();

const mermaidSource = z
  .string()
  .min(1)
  .max(200_000)
  .describe('Mermaid flowchart source. Preserve existing node and edge IDs when editing.');
const mermaidId = z
  .string()
  .regex(/^[A-Za-z_][A-Za-z0-9_-]*$/)
  .describe('Stable Mermaid node or edge ID.');
const position = z.strictObject({ x: z.number().finite(), y: z.number().finite() });
const size = z.strictObject({ width: z.number().finite().optional(), height: z.number().finite().optional() });
const nodeMetadataPatch = z.strictObject({
  position: position.optional(),
  size: size.nullable().optional(),
  data: processFlowNodeDataSchema.omit({ label: true }).optional(),
});
const edgeMetadataPatch = z.strictObject({
  type: z
    .literal('dependency')
    .nullable()
    .optional()
    .describe('Set dependency semantics or clear them to use the Mermaid arrow type.'),
  data: processFlowEdgeDataSchema.omit({ label: true }).optional(),
});
const diagramMetadataPatch = z.strictObject({
  nodes: z.record(mermaidId, nodeMetadataPatch).optional(),
  edges: z.record(mermaidId, edgeMetadataPatch).optional(),
});

const settings = processFlowBase.omit({ team_id: true }).partial();
const documentFields = {
  mermaid_source: mermaidSource.optional(),
  diagram_metadata: diagramMetadataPatch
    .optional()
    .describe('Patch metadata by stable ID. Omitted fields are preserved.'),
};

export const createProcessFlowSchema = processFlowBase
  .partial({ description: true, context_markdown: true, viewport: true })
  .extend(documentFields);

const revision = z.number().int().positive().describe('Current diagram_revision from processflow_get.');
const updateFields = settings.extend({
  ...documentFields,
  expected_revision: revision,
  layout: z.literal('auto').optional().describe('Recompute all positions. Omit to keep saved positions.'),
});

function hasChanges({ expected_revision: _revision, ...changes }: z.infer<typeof updateFields>) {
  return Object.values(changes).some((value) => value !== undefined);
}

export const updateProcessFlowToolSchema = updateFields
  .extend({ process_flow_id: uuid('Process flow UUID to update.') })
  .refine(({ process_flow_id: _flowId, ...changes }) => hasChanges(changes), 'At least one change is required.');

// The canvas submits its derived graph to the same document writer. Its loose
// data schemas validate known fields and preserve unknown fields from older rows.
const canvasNode = z.strictObject({
  id: mermaidId,
  process_flow_id: uuid('Process flow UUID.'),
  type: processFlowNodeTypeSchema,
  position,
  size: size.nullable().optional(),
  data: processFlowNodeDataSchema.loose().extend({ label: z.string() }),
});
const canvasEdge = z.strictObject({
  id: mermaidId,
  process_flow_id: uuid('Process flow UUID.'),
  type: processFlowEdgeTypeSchema,
  source_node_id: mermaidId,
  target_node_id: mermaidId,
  data: processFlowEdgeDataSchema.loose().nullable().optional(),
});
export const updateProcessFlowSchema = updateFields
  .extend({ canvas: z.strictObject({ nodes: z.array(canvasNode), edges: z.array(canvasEdge) }).optional() })
  .refine(
    (input) => !input.canvas || (input.mermaid_source === undefined && input.diagram_metadata === undefined),
    'Provide either canvas changes or Mermaid and metadata changes.',
  )
  .refine(hasChanges, 'At least one change is required.');

export type CreateProcessFlow = z.infer<typeof createProcessFlowSchema>;
export type UpdateProcessFlow = z.infer<typeof updateProcessFlowSchema>;
