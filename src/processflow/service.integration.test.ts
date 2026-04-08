import { beforeEach, describe, expect, it } from 'vitest';
import { createLocalSupabaseAdminClient } from '@/test/local-supabase';
import {
  createPublicClient,
  E2E_EDGE_REVIEW_ID,
  E2E_NODE_APPROVED_ID,
  E2E_NODE_RECEIVE_ID,
  E2E_OWNER_EMAIL,
  E2E_OWNER_PASSWORD,
  E2E_PROCESS_FLOW_ID,
  resetLocalAppState,
} from '../../e2e/local-fixtures';
import {
  autolayoutProcessFlow,
  batchMutateProcessFlowEdges,
  batchMutateProcessFlowNodes,
  createProcessFlowEdge,
  getProcessFlowGraph,
} from './service';

const supabase = createLocalSupabaseAdminClient();

describe.sequential('processflow service integration', () => {
  beforeEach(async () => {
    await resetLocalAppState();
  });

  it('persists real batch node and edge mutations in local Supabase', async () => {
    const createNodeResult = await batchMutateProcessFlowNodes(supabase as never, {
      process_flow_id: E2E_PROCESS_FLOW_ID,
      mutations: [
        {
          action: 'create',
          payload: {
            type: 'step',
            position: { x: 760, y: 160 },
            size: null,
            data: { label: 'Archive invoice', owner_role: 'Operations' },
          },
        },
      ],
    });

    expect(createNodeResult.error).toBeNull();
    expect(createNodeResult.data?.created).toHaveLength(1);
    const createdNodeId = createNodeResult.data?.created[0]?.id;
    expect(createdNodeId).toBeTruthy();
    if (!createdNodeId) {
      throw new Error('Expected batch node mutation to create a node');
    }

    const createEdgeResult = await createProcessFlowEdge(supabase as never, {
      process_flow_id: E2E_PROCESS_FLOW_ID,
      type: 'handoff',
      source_node_id: E2E_NODE_APPROVED_ID,
      target_node_id: createdNodeId,
      data: { label: 'Approved', condition: 'invoice total <= $10,000' },
    });

    expect(createEdgeResult.error).toBeNull();
    expect(createEdgeResult.data?.source_node_id).toBe(E2E_NODE_APPROVED_ID);
    if (!createEdgeResult.data?.id) {
      throw new Error('Expected process flow edge creation to return an id');
    }

    const updateEdgeResult = await batchMutateProcessFlowEdges(supabase as never, {
      process_flow_id: E2E_PROCESS_FLOW_ID,
      mutations: [
        {
          action: 'update',
          id: createEdgeResult.data.id,
          payload: {
            data: { label: 'Approved', condition: 'invoice total < $5,000' },
          },
        },
      ],
    });

    expect(updateEdgeResult.error).toBeNull();
    expect(updateEdgeResult.data?.updated[0]?.data).toEqual({
      label: 'Approved',
      condition: 'invoice total < $5,000',
    });

    const deleteNodeResult = await batchMutateProcessFlowNodes(supabase as never, {
      process_flow_id: E2E_PROCESS_FLOW_ID,
      mutations: [{ action: 'delete', id: createdNodeId }],
    });

    expect(deleteNodeResult.error).toBeNull();
    expect(deleteNodeResult.data?.deleted[0]?.id).toBe(createdNodeId);

    const graph = await getProcessFlowGraph(supabase as never, E2E_PROCESS_FLOW_ID);
    expect(graph.nodesResult.data?.map((node) => node.id)).toEqual([E2E_NODE_RECEIVE_ID, E2E_NODE_APPROVED_ID]);
    expect(graph.edgesResult.data?.map((edge) => edge.id)).toEqual([E2E_EDGE_REVIEW_ID]);
  });

  it('auto-layouts a real persisted process flow and writes the new positions', async () => {
    const before = await getProcessFlowGraph(supabase as never, E2E_PROCESS_FLOW_ID);
    const originalPositions = new Map(
      (before.nodesResult.data ?? []).map((node) => [node.id, [node.position_x, node.position_y]]),
    );

    const result = await autolayoutProcessFlow(supabase as never, E2E_PROCESS_FLOW_ID);

    expect(result.error).toBeNull();
    expect(result.data?.nodes).toHaveLength(2);

    const after = await getProcessFlowGraph(supabase as never, E2E_PROCESS_FLOW_ID);
    const updatedPositions = new Map(
      (after.nodesResult.data ?? []).map((node) => [node.id, [node.position_x, node.position_y]]),
    );

    expect(updatedPositions.get(E2E_NODE_RECEIVE_ID)).not.toEqual(originalPositions.get(E2E_NODE_RECEIVE_ID));
    expect(updatedPositions.get(E2E_NODE_APPROVED_ID)).not.toEqual(originalPositions.get(E2E_NODE_APPROVED_ID));
  });

  it('auto-layouts successfully for an authenticated user client too', async () => {
    const client = createPublicClient();
    const signIn = await client.auth.signInWithPassword({
      email: E2E_OWNER_EMAIL,
      password: E2E_OWNER_PASSWORD,
    });
    expect(signIn.error).toBeNull();

    const result = await autolayoutProcessFlow(client as never, E2E_PROCESS_FLOW_ID);

    expect(result.error).toBeNull();
    expect(result.data?.nodes).toHaveLength(2);
  });
});
