import type { ProcessFlowFull } from '@beemspec/processflow';
import { describe, expect, it, vi } from 'vitest';
import {
  batchMutateProcessFlowEdges,
  batchMutateProcessFlowNodes,
  deleteProcessFlowEdge,
  updateProcessFlowNode,
  validateProcessFlowGraph,
} from './service';

describe('processflow service', () => {
  it('flags common structural warnings', () => {
    const flow: ProcessFlowFull = {
      id: 'flow-1',
      team_id: 'team-1',
      name: 'AP Intake',
      description: null,
      context_markdown: null,
      viewport: null,
      schema_version: 1,
      nodes: [
        {
          id: 'node-1',
          process_flow_id: 'flow-1',
          type: 'decision',
          position: { x: 0, y: 0 },
          size: null,
          data: { label: 'Approved?' },
        },
        {
          id: 'node-2',
          process_flow_id: 'flow-1',
          type: 'step',
          position: { x: 100, y: 0 },
          size: null,
          data: { label: 'Review invoice' },
        },
        {
          id: 'node-3',
          process_flow_id: 'flow-1',
          type: 'step',
          position: { x: 200, y: 0 },
          size: null,
          data: { label: 'Review invoice' },
        },
      ],
      edges: [
        {
          id: 'edge-1',
          process_flow_id: 'flow-1',
          type: 'flow',
          source_node_id: 'node-1',
          target_node_id: 'node-2',
          data: null,
        },
      ],
    };

    const result = validateProcessFlowGraph(flow);
    const codes = result.warnings.map((warning) => warning.code);

    expect(codes).toContain('decision_needs_multiple_paths');
    expect(codes).toContain('decision_missing_branch_labels');
    expect(codes).toContain('duplicate_node_label');
    expect(codes).toContain('disconnected_node');
  });

  it('scopes node updates to the owning flow', async () => {
    const single = vi.fn().mockResolvedValue({ data: { id: 'node-1' }, error: null });
    const select = vi.fn().mockReturnValue({ single });
    const eqFlow = vi.fn().mockReturnValue({ select });
    const eqId = vi.fn().mockReturnValue({ eq: eqFlow });
    const update = vi.fn().mockReturnValue({ eq: eqId });
    const from = vi.fn(() => ({ update }));
    const supabase = { from } as never;

    await updateProcessFlowNode(supabase, 'flow-1', 'node-1', { data: { label: 'Updated' } });

    expect(update).toHaveBeenCalledWith({ data: { label: 'Updated' } });
    expect(eqId).toHaveBeenCalledWith('id', 'node-1');
    expect(eqFlow).toHaveBeenCalledWith('process_flow_id', 'flow-1');
  });

  it('scopes edge deletes to the owning flow', async () => {
    const single = vi.fn().mockResolvedValue({ data: { id: 'edge-1' }, error: null });
    const select = vi.fn().mockReturnValue({ single });
    const eqFlow = vi.fn().mockReturnValue({ select });
    const eqId = vi.fn().mockReturnValue({ eq: eqFlow });
    const remove = vi.fn().mockReturnValue({ eq: eqId });
    const from = vi.fn(() => ({ delete: remove }));
    const supabase = { from } as never;

    await deleteProcessFlowEdge(supabase, 'flow-1', 'edge-1');

    expect(eqId).toHaveBeenCalledWith('id', 'edge-1');
    expect(eqFlow).toHaveBeenCalledWith('process_flow_id', 'flow-1');
  });

  it('preserves operational metadata through batch node rpc mutations', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: {
        created: [
          {
            id: 'node-1',
            process_flow_id: 'flow-1',
            type: 'step',
            position_x: 1,
            position_y: 2,
            width: null,
            height: null,
            data: {
              label: 'Receive invoice',
              frequency: '~200/day',
              estimated_duration: '5-10 min',
              time_constraint: 'must complete within 48h',
            },
          },
        ],
        updated: [],
        deleted: [],
      },
      error: null,
    });
    const supabase = { rpc } as never;

    const result = await batchMutateProcessFlowNodes(supabase, {
      process_flow_id: 'flow-1',
      mutations: [
        {
          action: 'create',
          payload: {
            type: 'step',
            position: { x: 1, y: 2 },
            data: {
              label: 'Receive invoice',
              frequency: '~200/day',
              estimated_duration: '5-10 min',
              time_constraint: 'must complete within 48h',
            },
          },
        },
      ],
    });

    expect(rpc).toHaveBeenCalledWith('batch_mutate_process_flow_nodes', {
      p_process_flow_id: 'flow-1',
      p_mutations: [
        {
          action: 'create',
          payload: {
            type: 'step',
            position: { x: 1, y: 2 },
            data: {
              label: 'Receive invoice',
              frequency: '~200/day',
              estimated_duration: '5-10 min',
              time_constraint: 'must complete within 48h',
            },
          },
        },
      ],
    });
    expect(result.data?.created[0]).toEqual({
      id: 'node-1',
      process_flow_id: 'flow-1',
      type: 'step',
      position: { x: 1, y: 2 },
      size: null,
      data: {
        label: 'Receive invoice',
        frequency: '~200/day',
        estimated_duration: '5-10 min',
        time_constraint: 'must complete within 48h',
      },
    });
  });

  it('preserves edge conditions through batch edge rpc mutations', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: {
        created: [],
        updated: [
          {
            id: 'edge-1',
            process_flow_id: 'flow-1',
            type: 'handoff',
            source_node_id: 'node-a',
            target_node_id: 'node-b',
            data: { label: 'Hand off', condition: 'approval denied' },
          },
        ],
        deleted: [],
      },
      error: null,
    });
    const supabase = { rpc } as never;

    const result = await batchMutateProcessFlowEdges(supabase, {
      process_flow_id: 'flow-1',
      mutations: [
        {
          action: 'update',
          id: 'edge-1',
          payload: { type: 'handoff', data: { label: 'Hand off', condition: 'approval denied' } },
        },
      ],
    });

    expect(rpc).toHaveBeenCalledWith('batch_mutate_process_flow_edges', {
      p_process_flow_id: 'flow-1',
      p_mutations: [
        {
          action: 'update',
          id: 'edge-1',
          payload: { type: 'handoff', data: { label: 'Hand off', condition: 'approval denied' } },
        },
      ],
    });
    expect(result.data?.updated[0]).toEqual({
      id: 'edge-1',
      process_flow_id: 'flow-1',
      type: 'handoff',
      source_node_id: 'node-a',
      target_node_id: 'node-b',
      data: { label: 'Hand off', condition: 'approval denied' },
    });
  });
});
