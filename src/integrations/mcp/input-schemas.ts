import { z } from 'zod';
import * as flow from '@/domain/process-flow/schemas';
import * as story from '@/domain/story-map/schemas';

// MCP request budgets are transport policy, not limits on existing UI/REST data.
// Compose over the domain schemas so required fields, refinements and descriptions stay shared.
const MAX_TEXT = 20_000;
const MAX_MARKDOWN = 100_000;
const MAX_ORDER = 1_000;
const MAX_BATCH = 100;

function boundedText(schema: z.ZodNullable<z.ZodString>, max = MAX_TEXT) {
  return schema
    .unwrap()
    .max(max)
    .nullable()
    .meta(schema.meta() ?? {});
}

const mapText = {
  description: boundedText(story.storyMapBase.shape.description).optional(),
  context_markdown: boundedText(story.storyMapBase.shape.context_markdown, MAX_MARKDOWN).optional(),
};
const releaseText = {
  description: boundedText(story.releaseBase.shape.description).optional(),
  context_markdown: boundedText(story.releaseBase.shape.context_markdown, MAX_MARKDOWN).optional(),
};
const activityText = { description: boundedText(story.activityBase.shape.description).optional() };
const taskText = { description: boundedText(story.taskBase.shape.description).optional() };
const personaText = {
  description: boundedText(story.personaBase.shape.description).optional(),
  goals: boundedText(story.personaBase.shape.goals).optional(),
};
const content = story.storyBase.shape.content
  .safeExtend({
    user_story: story.storyContentSchema.shape.user_story.max(MAX_MARKDOWN),
    acceptance_criteria: story.storyContentSchema.shape.acceptance_criteria.max(MAX_MARKDOWN),
    figma_link: story.storyContentSchema.shape.figma_link
      .unwrap()
      .unwrap()
      .max(2_048)
      .nullable()
      .optional()
      .meta(story.storyContentSchema.shape.figma_link.meta() ?? {}),
    edge_cases: boundedText(story.storyContentSchema.shape.edge_cases.unwrap()).optional(),
    technical_guidelines: boundedText(story.storyContentSchema.shape.technical_guidelines.unwrap()).optional(),
  })
  .meta(story.storyBase.shape.content.meta() ?? {});

export const createStoryMapSchema = story.createStoryMapSchema.safeExtend(mapText);
export const updateStoryMapToolSchema = story.updateStoryMapToolSchema
  .safeExtend(mapText)
  .meta(story.updateStoryMapToolSchema.meta() ?? {});
export const createReleaseSchema = story.createReleaseSchema.safeExtend(releaseText);
export const updateReleaseToolSchema = story.updateReleaseToolSchema
  .safeExtend(releaseText)
  .meta(story.updateReleaseToolSchema.meta() ?? {});
export const createActivitySchema = story.createActivitySchema.safeExtend(activityText);
export const updateActivityToolSchema = story.updateActivityToolSchema
  .safeExtend(activityText)
  .meta(story.updateActivityToolSchema.meta() ?? {});
export const createTaskSchema = story.createTaskSchema.safeExtend(taskText);
export const updateTaskToolSchema = story.updateTaskToolSchema
  .safeExtend(taskText)
  .meta(story.updateTaskToolSchema.meta() ?? {});
export const createPersonaSchema = story.createPersonaSchema.safeExtend(personaText);
export const updatePersonaToolSchema = story.updatePersonaToolSchema
  .safeExtend(personaText)
  .meta(story.updatePersonaToolSchema.meta() ?? {});
export const createStorySchema = story.createStorySchema.safeExtend({ content });
export const updateStoryToolSchema = story.updateStoryToolSchema
  .safeExtend({ content: content.optional() })
  .meta(story.updateStoryToolSchema.meta() ?? {});
export const reorderActivitiesSchema = story.reorderActivitiesSchema.safeExtend({
  order: story.reorderActivitiesSchema.shape.order.max(MAX_ORDER),
});
export const reorderTasksSchema = story.reorderTasksSchema.safeExtend({
  order: story.reorderTasksSchema.shape.order.max(MAX_ORDER),
});
export const reorderReleasesSchema = story.reorderReleasesSchema.safeExtend({
  order: story.reorderReleasesSchema.shape.order.max(MAX_ORDER),
});
export const reorderStoriesSchema = story.reorderStoriesSchema.safeExtend({
  order: story.reorderStoriesSchema.shape.order.max(MAX_ORDER),
});
export const moveTaskSchema = story.moveTaskSchema.safeExtend({
  target_order: story.moveTaskSchema.shape.target_order.max(MAX_ORDER),
});
export const moveStorySchema = story.moveStorySchema.safeExtend({
  target_order: story.moveStorySchema.shape.target_order.max(MAX_ORDER),
});

const flowText = {
  description: boundedText(flow.processFlowBase.shape.description).optional(),
  context_markdown: boundedText(flow.processFlowBase.shape.context_markdown, MAX_MARKDOWN).optional(),
};

function boundedList(schema: z.ZodOptional<z.ZodArray<z.ZodString>>) {
  const array = schema.unwrap();
  return z
    .array(array.element.max(2_000))
    .max(200)
    .meta(array.meta() ?? {})
    .optional();
}

const nodeFields = flow.processFlowNodeDataSchema.shape;
const nodeData = flow.processFlowNodeBase.shape.data
  .safeExtend({
    owner_role: boundedText(nodeFields.owner_role.unwrap()).optional(),
    systems: boundedList(nodeFields.systems),
    inputs: boundedList(nodeFields.inputs),
    outputs: boundedList(nodeFields.outputs),
    pain_points: boundedText(nodeFields.pain_points.unwrap()).optional(),
    notes: boundedText(nodeFields.notes.unwrap()).optional(),
    automation_opportunity: boundedText(nodeFields.automation_opportunity.unwrap()).optional(),
    frequency: boundedText(nodeFields.frequency.unwrap()).optional(),
    estimated_duration: boundedText(nodeFields.estimated_duration.unwrap()).optional(),
    time_constraint: boundedText(nodeFields.time_constraint.unwrap()).optional(),
  })
  .meta(flow.processFlowNodeBase.shape.data.meta() ?? {});
const edgeFields = flow.processFlowEdgeDataSchema.shape;
const edgeData = flow.processFlowEdgeDataSchema
  .safeExtend({
    label: boundedText(edgeFields.label.unwrap()).optional(),
    condition: boundedText(edgeFields.condition.unwrap()).optional(),
  })
  .nullable()
  .optional()
  .meta(flow.processFlowEdgeBase.shape.data.meta() ?? {});

export const createProcessFlowSchema = flow.createProcessFlowSchema.safeExtend(flowText);
export const updateProcessFlowToolSchema = flow.updateProcessFlowToolSchema
  .safeExtend(flowText)
  .meta(flow.updateProcessFlowToolSchema.meta() ?? {});
export const createProcessFlowNodeSchema = flow.createProcessFlowNodeSchema.safeExtend({ data: nodeData });
export const updateProcessFlowNodeToolSchema = flow.updateProcessFlowNodeToolSchema
  .safeExtend({
    data: nodeData.optional(),
  })
  .meta(flow.updateProcessFlowNodeToolSchema.meta() ?? {});
export const createProcessFlowEdgeSchema = flow.createProcessFlowEdgeSchema.safeExtend({ data: edgeData });
export const updateProcessFlowEdgeToolSchema = flow.updateProcessFlowEdgeToolSchema
  .safeExtend({ data: edgeData })
  .meta(flow.updateProcessFlowEdgeToolSchema.meta() ?? {});

const [createNode, updateNode, deleteNode] = flow.batchProcessFlowNodeMutationSchema.options;
const nodeMutation = z.discriminatedUnion('action', [
  createNode.safeExtend({
    payload: createNode.shape.payload.safeExtend({ data: nodeData }).meta(createNode.shape.payload.meta() ?? {}),
  }),
  updateNode.safeExtend({
    payload: updateNode.shape.payload
      .safeExtend({ data: nodeData.optional() })
      .meta(updateNode.shape.payload.meta() ?? {}),
  }),
  deleteNode,
]);
const [createEdge, updateEdge, deleteEdge] = flow.batchProcessFlowEdgeMutationSchema.options;
const edgeMutation = z.discriminatedUnion('action', [
  createEdge.safeExtend({
    payload: createEdge.shape.payload.safeExtend({ data: edgeData }).meta(createEdge.shape.payload.meta() ?? {}),
  }),
  updateEdge.safeExtend({
    payload: updateEdge.shape.payload.safeExtend({ data: edgeData }).meta(updateEdge.shape.payload.meta() ?? {}),
  }),
  deleteEdge,
]);
export const batchMutateProcessFlowNodesSchema = flow.batchMutateProcessFlowNodesSchema.safeExtend({
  mutations: z
    .array(nodeMutation)
    .min(1)
    .max(MAX_BATCH)
    .meta(flow.batchMutateProcessFlowNodesSchema.shape.mutations.meta() ?? {}),
});
export const batchMutateProcessFlowEdgesSchema = flow.batchMutateProcessFlowEdgesSchema.safeExtend({
  mutations: z
    .array(edgeMutation)
    .min(1)
    .max(MAX_BATCH)
    .meta(flow.batchMutateProcessFlowEdgesSchema.shape.mutations.meta() ?? {}),
});
