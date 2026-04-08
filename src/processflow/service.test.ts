import type { ProcessFlowFull } from '@beemspec/processflow';
import { describe, expect, it, vi } from 'vitest';

const { elkLayout } = vi.hoisted(() => ({ elkLayout: vi.fn() }));

vi.mock('elkjs/lib/elk.bundled.js', () => ({
  default: vi.fn(() => ({ layout: elkLayout })),
}));

import {
  autolayoutProcessFlow,
  batchMutateProcessFlowEdges,
  batchMutateProcessFlowNodes,
  buildProcessFlowFull,
  createProcessFlow,
  createProcessFlowEdge,
  createProcessFlowNode,
  deleteProcessFlowEdge,
  getProcessFlowMcpContext,
  listProcessFlows,
  updateProcessFlowEdge,
  updateProcessFlowNode,
  validateProcessFlowById,
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

  it('maps stored graph rows into the full process flow shape', () => {
    const result = buildProcessFlowFull(
      {
        id: 'flow-1',
        team_id: 'team-1',
        name: 'AP Intake',
        description: 'Invoice process',
        context_markdown: '## Notes',
        viewport: { x: 10, y: 20, zoom: 1.25 },
        schema_version: 1,
      },
      [
        {
          id: 'node-1',
          process_flow_id: 'flow-1',
          type: 'step',
          position_x: 40,
          position_y: 80,
          width: 320,
          height: null,
          data: { label: 'Receive invoice' },
        },
      ],
      [
        {
          id: 'edge-1',
          process_flow_id: 'flow-1',
          type: 'flow',
          source_node_id: 'node-1',
          target_node_id: 'node-1',
          data: { label: 'Loop back' },
        },
      ],
    );

    expect(result).toEqual({
      id: 'flow-1',
      team_id: 'team-1',
      name: 'AP Intake',
      description: 'Invoice process',
      context_markdown: '## Notes',
      viewport: { x: 10, y: 20, zoom: 1.25 },
      schema_version: 1,
      nodes: [
        {
          id: 'node-1',
          process_flow_id: 'flow-1',
          type: 'step',
          position: { x: 40, y: 80 },
          size: { width: 320 },
          data: { label: 'Receive invoice' },
        },
      ],
      edges: [
        {
          id: 'edge-1',
          process_flow_id: 'flow-1',
          type: 'flow',
          source_node_id: 'node-1',
          target_node_id: 'node-1',
          data: { label: 'Loop back' },
        },
      ],
    });
  });

  it('rejects creating an edge when referenced nodes are not in the same flow', async () => {
    const insert = vi.fn();
    const validateNodes = vi.fn().mockResolvedValue({
      data: [{ id: 'node-1', process_flow_id: 'flow-1' }],
      error: null,
    });
    const eq = vi.fn().mockReturnValue({ in: validateNodes });
    const selectNodes = vi.fn().mockReturnValue({ eq });
    const from = vi.fn((table: string) => {
      if (table === 'process_flow_nodes') return { select: selectNodes };
      if (table === 'process_flow_edges') return { insert };
      throw new Error(`Unexpected table: ${table}`);
    });

    const result = await createProcessFlowEdge({ from } as never, {
      process_flow_id: 'flow-1',
      type: 'flow',
      source_node_id: 'node-1',
      target_node_id: 'node-2',
      data: { label: 'Approved' },
    });

    expect(result.data).toBeNull();
    expect(result.error).toBeInstanceOf(Error);
    expect((result.error as Error).message).toBe('Source and target nodes must belong to the same process flow');
    expect(insert).not.toHaveBeenCalled();
  });

  it('validates a persisted process flow by loading and building its graph', async () => {
    const flowSingle = vi.fn().mockResolvedValue({
      data: {
        id: 'flow-1',
        team_id: 'team-1',
        name: 'AP Intake',
        description: null,
        context_markdown: null,
        viewport: null,
        schema_version: 1,
      },
      error: null,
    });
    const flowEq = vi.fn().mockReturnValue({ single: flowSingle });
    const flowSelect = vi.fn().mockReturnValue({ eq: flowEq });

    const nodesOrder = vi.fn().mockResolvedValue({
      data: [
        {
          id: 'node-1',
          process_flow_id: 'flow-1',
          type: 'step',
          position_x: 0,
          position_y: 0,
          width: null,
          height: null,
          data: { label: 'Receive invoice' },
        },
        {
          id: 'node-2',
          process_flow_id: 'flow-1',
          type: 'step',
          position_x: 80,
          position_y: 40,
          width: null,
          height: null,
          data: { label: 'Archive invoice' },
        },
      ],
      error: null,
    });
    const nodesEq = vi.fn().mockReturnValue({ order: nodesOrder });
    const nodesSelect = vi.fn().mockReturnValue({ eq: nodesEq });

    const edgesOrder = vi.fn().mockResolvedValue({
      data: [
        {
          id: 'edge-1',
          process_flow_id: 'flow-1',
          type: 'flow',
          source_node_id: 'node-1',
          target_node_id: 'node-1',
          data: null,
        },
      ],
      error: null,
    });
    const edgesEq = vi.fn().mockReturnValue({ order: edgesOrder });
    const edgesSelect = vi.fn().mockReturnValue({ eq: edgesEq });

    const from = vi.fn((table: string) => {
      if (table === 'process_flows') return { select: flowSelect };
      if (table === 'process_flow_nodes') return { select: nodesSelect };
      if (table === 'process_flow_edges') return { select: edgesSelect };
      throw new Error(`Unexpected table: ${table}`);
    });

    const result = await validateProcessFlowById({ from } as never, 'flow-1');

    expect(result.error).toBeNull();
    expect(result.data?.warnings.map((warning) => warning.code)).toContain('self_referential_edge');
    expect(result.data?.warnings.map((warning) => warning.code)).toContain('disconnected_node');
  });

  it('auto-layouts nodes and persists the calculated positions', async () => {
    elkLayout.mockResolvedValue({ children: [{ id: 'node-1', x: 320, y: 180 }] });

    const flowSingle = vi.fn().mockResolvedValue({
      data: {
        id: 'flow-1',
        team_id: 'team-1',
        name: 'AP Intake',
        description: null,
        context_markdown: null,
        viewport: null,
        schema_version: 1,
      },
      error: null,
    });
    const flowEq = vi.fn().mockReturnValue({ single: flowSingle });
    const flowSelect = vi.fn().mockReturnValue({ eq: flowEq });

    const nodesOrder = vi.fn().mockResolvedValue({
      data: [
        {
          id: 'node-1',
          process_flow_id: 'flow-1',
          type: 'step',
          position_x: 0,
          position_y: 0,
          width: null,
          height: null,
          data: { label: 'Receive invoice' },
        },
      ],
      error: null,
    });
    const nodesEq = vi.fn().mockReturnValue({ order: nodesOrder });
    const nodesSelect = vi.fn().mockReturnValue({ eq: nodesEq });

    const edgesOrder = vi.fn().mockResolvedValue({ data: [], error: null });
    const edgesEq = vi.fn().mockReturnValue({ order: edgesOrder });
    const edgesSelect = vi.fn().mockReturnValue({ eq: edgesEq });

    const rpc = vi.fn().mockResolvedValue({ error: null });
    const from = vi.fn((table: string) => {
      if (table === 'process_flows') return { select: flowSelect };
      if (table === 'process_flow_nodes') return { select: nodesSelect };
      if (table === 'process_flow_edges') return { select: edgesSelect };
      throw new Error(`Unexpected table: ${table}`);
    });

    const result = await autolayoutProcessFlow({ from, rpc } as never, 'flow-1');

    expect(elkLayout).toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledWith('apply_process_flow_layout', {
      p_process_flow_id: 'flow-1',
      p_positions: [{ id: 'node-1', x: 320, y: 180 }],
    });
    expect(result).toEqual({
      data: {
        nodes: [
          {
            id: 'node-1',
            process_flow_id: 'flow-1',
            type: 'step',
            position: { x: 320, y: 180 },
            size: null,
            data: { label: 'Receive invoice' },
          },
        ],
        edges: [],
      },
      error: null,
    });
  });

  it('flags note content, verbose labels, and handoff ownership gaps', () => {
    const flow: ProcessFlowFull = {
      id: 'flow-2',
      team_id: 'team-1',
      name: 'Exception handling',
      description: null,
      context_markdown: null,
      viewport: null,
      schema_version: 1,
      nodes: [
        {
          id: 'node-1',
          process_flow_id: 'flow-2',
          type: 'actor',
          position: { x: 0, y: 0 },
          size: null,
          data: { label: 'Accounts payable clerk', owner_role: '' },
        },
        {
          id: 'node-2',
          process_flow_id: 'flow-2',
          type: 'system',
          position: { x: 100, y: 0 },
          size: null,
          data: {
            label:
              'This label is intentionally much longer than eighty characters so validation warns that it should be shortened',
            owner_role: 'ERP',
          },
        },
        {
          id: 'node-3',
          process_flow_id: 'flow-2',
          type: 'note',
          position: { x: 200, y: 0 },
          size: null,
          data: { label: '   ', notes: '   ' },
        },
      ],
      edges: [
        {
          id: 'edge-1',
          process_flow_id: 'flow-2',
          type: 'handoff',
          source_node_id: 'node-1',
          target_node_id: 'node-2',
          data: { label: 'Send to ERP' },
        },
      ],
    };

    const codes = validateProcessFlowGraph(flow).warnings.map((warning) => warning.code);

    expect(codes).toContain('empty_note_node');
    expect(codes).toContain('verbose_node_label');
    expect(codes).toContain('handoff_missing_ownership_context');
  });

  it('propagates node ownership validation query errors', async () => {
    const validateNodes = vi.fn().mockResolvedValue({ data: null, error: { message: 'db exploded' } });
    const eq = vi.fn().mockReturnValue({ in: validateNodes });
    const selectNodes = vi.fn().mockReturnValue({ eq });
    const from = vi.fn((table: string) => {
      if (table === 'process_flow_nodes') return { select: selectNodes };
      throw new Error(`Unexpected table: ${table}`);
    });

    const result = await createProcessFlowEdge({ from } as never, {
      process_flow_id: 'flow-1',
      type: 'flow',
      source_node_id: 'node-1',
      target_node_id: 'node-2',
      data: null,
    });

    expect(result.data).toBeNull();
    expect((result.error as Error).message).toBe('Failed to validate edge nodes');
  });

  it('returns null rpc results when batch node mutations fail', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { message: 'rpc failed' } });

    const result = await batchMutateProcessFlowNodes({ rpc } as never, {
      process_flow_id: 'flow-1',
      mutations: [{ action: 'delete', id: 'node-1' }],
    });

    expect(result).toEqual({ data: null, error: { message: 'rpc failed' } });
  });

  it('returns null rpc results when batch edge mutations fail', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { message: 'rpc failed' } });

    const result = await batchMutateProcessFlowEdges({ rpc } as never, {
      process_flow_id: 'flow-1',
      mutations: [{ action: 'delete', id: 'edge-1' }],
    });

    expect(result).toEqual({ data: null, error: { message: 'rpc failed' } });
  });

  it('returns downstream graph load errors during validation and autolayout', async () => {
    const flowSingle = vi.fn().mockResolvedValue({
      data: {
        id: 'flow-1',
        team_id: 'team-1',
        name: 'AP Intake',
        description: null,
        context_markdown: null,
        viewport: null,
        schema_version: 1,
      },
      error: null,
    });
    const flowEq = vi.fn().mockReturnValue({ single: flowSingle });
    const flowSelect = vi.fn().mockReturnValue({ eq: flowEq });

    const nodesOrder = vi.fn().mockResolvedValue({ data: null, error: { message: 'nodes failed' } });
    const nodesEq = vi.fn().mockReturnValue({ order: nodesOrder });
    const nodesSelect = vi.fn().mockReturnValue({ eq: nodesEq });

    const edgesOrder = vi.fn().mockResolvedValue({ data: null, error: null });
    const edgesEq = vi.fn().mockReturnValue({ order: edgesOrder });
    const edgesSelect = vi.fn().mockReturnValue({ eq: edgesEq });

    const from = vi.fn((table: string) => {
      if (table === 'process_flows') return { select: flowSelect };
      if (table === 'process_flow_nodes') return { select: nodesSelect };
      if (table === 'process_flow_edges') return { select: edgesSelect };
      throw new Error(`Unexpected table: ${table}`);
    });

    await expect(validateProcessFlowById({ from } as never, 'flow-1')).resolves.toEqual({
      data: null,
      error: { message: 'nodes failed' },
    });
    await expect(autolayoutProcessFlow({ from, rpc: vi.fn() } as never, 'flow-1')).resolves.toEqual({
      data: null,
      error: { message: 'nodes failed' },
    });
  });

  it('returns empty layout payloads when a flow has no nodes', async () => {
    const flowSingle = vi.fn().mockResolvedValue({
      data: {
        id: 'flow-1',
        team_id: 'team-1',
        name: 'AP Intake',
        description: null,
        context_markdown: null,
        viewport: null,
        schema_version: 1,
      },
      error: null,
    });
    const flowEq = vi.fn().mockReturnValue({ single: flowSingle });
    const flowSelect = vi.fn().mockReturnValue({ eq: flowEq });

    const nodesOrder = vi.fn().mockResolvedValue({ data: [], error: null });
    const nodesEq = vi.fn().mockReturnValue({ order: nodesOrder });
    const nodesSelect = vi.fn().mockReturnValue({ eq: nodesEq });

    const edgesOrder = vi.fn().mockResolvedValue({
      data: [
        {
          id: 'edge-1',
          process_flow_id: 'flow-1',
          type: 'flow',
          source_node_id: 'node-1',
          target_node_id: 'node-2',
          data: null,
        },
      ],
      error: null,
    });
    const edgesEq = vi.fn().mockReturnValue({ order: edgesOrder });
    const edgesSelect = vi.fn().mockReturnValue({ eq: edgesEq });

    const from = vi.fn((table: string) => {
      if (table === 'process_flows') return { select: flowSelect };
      if (table === 'process_flow_nodes') return { select: nodesSelect };
      if (table === 'process_flow_edges') return { select: edgesSelect };
      throw new Error(`Unexpected table: ${table}`);
    });

    const result = await autolayoutProcessFlow({ from, rpc: vi.fn() } as never, 'flow-1');

    expect(result).toEqual({
      data: {
        nodes: [],
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
      },
      error: null,
    });
  });

  it('returns rpc errors when applying a layout fails', async () => {
    elkLayout.mockResolvedValue({ children: [{ id: 'node-1', x: 10, y: 20 }] });

    const flowSingle = vi.fn().mockResolvedValue({
      data: {
        id: 'flow-1',
        team_id: 'team-1',
        name: 'AP Intake',
        description: null,
        context_markdown: null,
        viewport: null,
        schema_version: 1,
      },
      error: null,
    });
    const flowEq = vi.fn().mockReturnValue({ single: flowSingle });
    const flowSelect = vi.fn().mockReturnValue({ eq: flowEq });

    const nodesOrder = vi.fn().mockResolvedValue({
      data: [
        {
          id: 'node-1',
          process_flow_id: 'flow-1',
          type: 'step',
          position_x: 0,
          position_y: 0,
          width: null,
          height: null,
          data: { label: 'Receive invoice' },
        },
      ],
      error: null,
    });
    const nodesEq = vi.fn().mockReturnValue({ order: nodesOrder });
    const nodesSelect = vi.fn().mockReturnValue({ eq: nodesEq });

    const edgesOrder = vi.fn().mockResolvedValue({ data: [], error: null });
    const edgesEq = vi.fn().mockReturnValue({ order: edgesOrder });
    const edgesSelect = vi.fn().mockReturnValue({ eq: edgesEq });

    const rpc = vi.fn().mockResolvedValue({ error: { message: 'apply failed' } });
    const from = vi.fn((table: string) => {
      if (table === 'process_flows') return { select: flowSelect };
      if (table === 'process_flow_nodes') return { select: nodesSelect };
      if (table === 'process_flow_edges') return { select: edgesSelect };
      throw new Error(`Unexpected table: ${table}`);
    });

    const result = await autolayoutProcessFlow({ from, rpc } as never, 'flow-1');

    expect(result).toEqual({ data: null, error: { message: 'apply failed' } });
  });

  it('passes create, update, query, and list operations through to Supabase', async () => {
    const single = vi.fn().mockResolvedValue({ data: { id: 'flow-1' }, error: null });

    const flowInsertSelect = vi.fn().mockReturnValue({ single });
    const flowInsert = vi.fn().mockReturnValue({ select: flowInsertSelect });
    await createProcessFlow({ from: vi.fn(() => ({ insert: flowInsert })) } as never, {
      team_id: 'team-1',
      name: 'Flow',
      description: undefined,
      context_markdown: undefined,
    });
    expect(flowInsert).toHaveBeenCalledWith({
      team_id: 'team-1',
      name: 'Flow',
      description: null,
      context_markdown: null,
      viewport: null,
      schema_version: 1,
    });

    const nodeInsertSelect = vi.fn().mockReturnValue({ single });
    const nodeInsert = vi.fn().mockReturnValue({ select: nodeInsertSelect });
    await createProcessFlowNode({ from: vi.fn(() => ({ insert: nodeInsert })) } as never, {
      process_flow_id: 'flow-1',
      type: 'note',
      position: { x: 1, y: 2 },
      size: { width: 220, height: 140 },
      data: { label: 'Note', notes: 'Heads up' },
    });
    expect(nodeInsert).toHaveBeenCalledWith({
      process_flow_id: 'flow-1',
      type: 'note',
      position_x: 1,
      position_y: 2,
      width: 220,
      height: 140,
      data: { label: 'Note', notes: 'Heads up' },
    });

    const edgeSelectAfterUpdate = vi.fn().mockReturnValue({ single });
    const edgeEqFlow = vi.fn().mockReturnValue({ select: edgeSelectAfterUpdate });
    const edgeEqId = vi.fn().mockReturnValue({ eq: edgeEqFlow });
    const edgeUpdate = vi.fn().mockReturnValue({ eq: edgeEqId });
    await updateProcessFlowEdge({ from: vi.fn(() => ({ update: edgeUpdate })) } as never, 'flow-1', 'edge-1', {
      type: 'dependency',
      data: { label: 'Wait' },
    });
    expect(edgeUpdate).toHaveBeenCalledWith({ type: 'dependency', data: { label: 'Wait' } });

    const flowOrder = vi.fn().mockResolvedValue({ data: [{ id: 'flow-1' }], error: null });
    const flowEq = vi.fn().mockReturnValue({ order: flowOrder });
    const flowSelect = vi.fn().mockReturnValue({ eq: flowEq });
    await listProcessFlows({ from: vi.fn(() => ({ select: flowSelect })) } as never, 'team-1');
    expect(flowEq).toHaveBeenCalledWith('team_id', 'team-1');

    const mcpFlowSingle = vi.fn().mockResolvedValue({ data: { id: 'flow-1' }, error: null });
    const mcpFlowEq = vi.fn().mockReturnValue({ single: mcpFlowSingle });
    const mcpFlowSelect = vi.fn().mockReturnValue({ eq: mcpFlowEq });
    const mcpNodesOrder = vi.fn().mockResolvedValue({ data: [], error: null });
    const mcpNodesEq = vi.fn().mockReturnValue({ order: mcpNodesOrder });
    const mcpNodesSelect = vi.fn().mockReturnValue({ eq: mcpNodesEq });
    const mcpEdgesOrder = vi.fn().mockResolvedValue({ data: [], error: null });
    const mcpEdgesEq = vi.fn().mockReturnValue({ order: mcpEdgesOrder });
    const mcpEdgesSelect = vi.fn().mockReturnValue({ eq: mcpEdgesEq });
    const mcpFrom = vi.fn((table: string) => {
      if (table === 'process_flows') return { select: mcpFlowSelect };
      if (table === 'process_flow_nodes') return { select: mcpNodesSelect };
      if (table === 'process_flow_edges') return { select: mcpEdgesSelect };
      throw new Error(`Unexpected table: ${table}`);
    });
    await getProcessFlowMcpContext({ from: mcpFrom } as never, 'flow-1');
    expect(mcpFlowEq).toHaveBeenCalledWith('id', 'flow-1');
  });
});
