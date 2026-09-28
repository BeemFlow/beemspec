import * as flow from '@/domain/process-flow/schemas';

// Bound database work per MCP tool call; the SDK separately limits HTTP bodies and JSON-RPC batches.
const MAX_BATCH = 100;

export const batchMutateProcessFlowNodesSchema = flow.batchMutateProcessFlowNodesSchema.extend({
  mutations: flow.batchMutateProcessFlowNodesSchema.shape.mutations
    .max(MAX_BATCH)
    .meta(flow.batchMutateProcessFlowNodesSchema.shape.mutations.meta() ?? {}),
});

export const batchMutateProcessFlowEdgesSchema = flow.batchMutateProcessFlowEdgesSchema.extend({
  mutations: flow.batchMutateProcessFlowEdgesSchema.shape.mutations
    .max(MAX_BATCH)
    .meta(flow.batchMutateProcessFlowEdgesSchema.shape.mutations.meta() ?? {}),
});
