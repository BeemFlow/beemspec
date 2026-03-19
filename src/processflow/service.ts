import type {
  BatchMutateProcessFlowEdges,
  BatchMutateProcessFlowNodes,
  CreateProcessFlow,
  CreateProcessFlowEdge,
  CreateProcessFlowNode,
  ProcessFlowEdge,
  ProcessFlowFull,
  ProcessFlowNode,
  ProcessFlowValidationResult,
  ProcessFlowValidationWarning,
  UpdateProcessFlow,
  UpdateProcessFlowEdge,
  UpdateProcessFlowNode,
} from '@beemspec/processflow';
import ELK from 'elkjs/lib/elk.bundled.js';
import type { Supabase } from '@/lib/supabase/types';
import { pickDefined } from '@/lib/validations';

type ProcessFlowRow = {
  id: string;
  team_id: string;
  name: string;
  description: string | null;
  context_markdown: string | null;
  viewport: { x: number; y: number; zoom: number } | null;
  schema_version: 1;
  created_at?: string;
  updated_at?: string;
};

type ProcessFlowNodeRow = {
  id: string;
  process_flow_id: string;
  type: ProcessFlowNode['type'];
  position_x: number;
  position_y: number;
  width: number | null;
  height: number | null;
  data: ProcessFlowNode['data'];
  created_at?: string;
  updated_at?: string;
};

type ProcessFlowEdgeRow = {
  id: string;
  process_flow_id: string;
  type: ProcessFlowEdge['type'];
  source_node_id: string;
  target_node_id: string;
  data: ProcessFlowEdge['data'] | null;
  created_at?: string;
  updated_at?: string;
};

type DbResult<T> = { data: T | null; error: unknown };

type RpcMutationResult<T> = {
  created: T[];
  updated: T[];
  deleted: T[];
};

function mapProcessFlowRow(row: ProcessFlowRow) {
  return {
    id: row.id,
    team_id: row.team_id,
    name: row.name,
    description: row.description,
    context_markdown: row.context_markdown,
    viewport: row.viewport,
    schema_version: row.schema_version,
  };
}

function mapProcessFlowNodeRow(row: ProcessFlowNodeRow): ProcessFlowNode {
  return {
    id: row.id,
    process_flow_id: row.process_flow_id,
    type: row.type,
    position: {
      x: row.position_x,
      y: row.position_y,
    },
    size:
      row.width == null && row.height == null
        ? null
        : {
            ...(row.width == null ? {} : { width: row.width }),
            ...(row.height == null ? {} : { height: row.height }),
          },
    data: row.data,
  };
}

function mapProcessFlowEdgeRow(row: ProcessFlowEdgeRow): ProcessFlowEdge {
  return {
    id: row.id,
    process_flow_id: row.process_flow_id,
    type: row.type,
    source_node_id: row.source_node_id,
    target_node_id: row.target_node_id,
    data: row.data,
  };
}

function defaultNodeSize(type: ProcessFlowNode['type']) {
  switch (type) {
    case 'decision':
      return { width: 220, height: 120 };
    case 'actor':
    case 'system':
      return { width: 260, height: 110 };
    case 'note':
      return { width: 220, height: 140 };
    case 'subprocess':
      return { width: 300, height: 140 };
    default:
      return { width: 240, height: 120 };
  }
}

function buildNodeLevelWarnings(
  flow: ProcessFlowFull,
  incoming: Map<string, ProcessFlowEdge[]>,
  outgoing: Map<string, ProcessFlowEdge[]>,
  labelGroups: Map<string, string[]>,
): ProcessFlowValidationWarning[] {
  const warnings: ProcessFlowValidationWarning[] = [];

  for (const node of flow.nodes) {
    const normalizedLabel = node.data.label.trim().toLowerCase();
    labelGroups.set(normalizedLabel, [...(labelGroups.get(normalizedLabel) ?? []), node.id]);

    if (node.type !== 'note' && !incoming.has(node.id) && !outgoing.has(node.id)) {
      warnings.push({
        code: 'disconnected_node',
        message: `Node "${node.data.label}" is disconnected from the process flow.`,
        node_ids: [node.id],
      });
    }

    if (node.type === 'decision') {
      const decisionEdges = outgoing.get(node.id) ?? [];
      if (decisionEdges.length < 2) {
        warnings.push({
          code: 'decision_needs_multiple_paths',
          message: `Decision node "${node.data.label}" should have at least two outgoing paths.`,
          node_ids: [node.id],
          edge_ids: decisionEdges.map((edge) => edge.id),
        });
      }

      const unlabeledEdges = decisionEdges.filter((edge) => !edge.data?.label?.trim());
      if (unlabeledEdges.length > 0) {
        warnings.push({
          code: 'decision_missing_branch_labels',
          message: `Decision node "${node.data.label}" has outgoing paths without labels.`,
          node_ids: [node.id],
          edge_ids: unlabeledEdges.map((edge) => edge.id),
        });
      }
    }

    if (node.type === 'note' && !node.data.notes?.trim() && !node.data.label.trim()) {
      warnings.push({
        code: 'empty_note_node',
        message: 'Note nodes should contain some explanatory content.',
        node_ids: [node.id],
      });
    }

    if (node.data.label.length > 80) {
      warnings.push({
        code: 'verbose_node_label',
        message: `Node "${node.data.label}" has a very long label; consider shortening it.`,
        node_ids: [node.id],
      });
    }
  }

  return warnings;
}

function buildDuplicateLabelWarnings(
  nodeMap: Map<string, ProcessFlowNode>,
  labelGroups: Map<string, string[]>,
): ProcessFlowValidationWarning[] {
  const warnings: ProcessFlowValidationWarning[] = [];

  for (const [label, ids] of labelGroups.entries()) {
    if (label && ids.length > 1) {
      warnings.push({
        code: 'duplicate_node_label',
        message: `Multiple nodes share the label "${nodeMap.get(ids[0])?.data.label ?? label}".`,
        node_ids: ids,
      });
    }
  }

  return warnings;
}

function buildEdgeLevelWarnings(
  flow: ProcessFlowFull,
  nodeMap: Map<string, ProcessFlowNode>,
): ProcessFlowValidationWarning[] {
  const warnings: ProcessFlowValidationWarning[] = [];

  for (const edge of flow.edges) {
    if (edge.type === 'handoff') {
      const sourceOwner = nodeMap.get(edge.source_node_id)?.data.owner_role?.trim();
      const targetOwner = nodeMap.get(edge.target_node_id)?.data.owner_role?.trim();
      if (!sourceOwner || !targetOwner) {
        warnings.push({
          code: 'handoff_missing_ownership_context',
          message: 'Handoff edges work best when both connected nodes have owner_role set.',
          node_ids: [edge.source_node_id, edge.target_node_id],
          edge_ids: [edge.id],
        });
      }
    }
  }

  return warnings;
}

async function assertNodesBelongToFlow(
  supabase: Supabase,
  processFlowId: string,
  nodeIds: string[],
): Promise<{ ok: true } | { ok: false; error: Error }> {
  const uniqueNodeIds = [...new Set(nodeIds)];
  const { data, error } = await supabase
    .from('process_flow_nodes')
    .select('id, process_flow_id')
    .eq('process_flow_id', processFlowId)
    .in('id', uniqueNodeIds);

  if (error) return { ok: false, error: new Error('Failed to validate edge nodes') };
  if ((data ?? []).length !== uniqueNodeIds.length) {
    return { ok: false, error: new Error('Source and target nodes must belong to the same process flow') };
  }

  return { ok: true };
}

export async function listProcessFlows(supabase: Supabase, teamId: string) {
  return supabase.from('process_flows').select('*').eq('team_id', teamId).order('updated_at', { ascending: false });
}

export async function getProcessFlowGraph(supabase: Supabase, processFlowId: string) {
  const [flowResult, nodesResult, edgesResult] = await Promise.all([
    supabase.from('process_flows').select('*').eq('id', processFlowId).single(),
    supabase.from('process_flow_nodes').select('*').eq('process_flow_id', processFlowId).order('created_at'),
    supabase.from('process_flow_edges').select('*').eq('process_flow_id', processFlowId).order('created_at'),
  ]);

  return {
    flowResult,
    nodesResult,
    edgesResult,
  };
}

export async function getProcessFlowMcpContext(supabase: Supabase, processFlowId: string) {
  const [flowResult, nodesResult, edgesResult] = await Promise.all([
    supabase
      .from('process_flows')
      .select('id, team_id, name, description, context_markdown, viewport, schema_version')
      .eq('id', processFlowId)
      .single(),
    supabase
      .from('process_flow_nodes')
      .select('id, process_flow_id, type, position_x, position_y, width, height, data')
      .eq('process_flow_id', processFlowId)
      .order('created_at'),
    supabase
      .from('process_flow_edges')
      .select('id, process_flow_id, type, source_node_id, target_node_id, data')
      .eq('process_flow_id', processFlowId)
      .order('created_at'),
  ]);

  return {
    flowResult,
    nodesResult,
    edgesResult,
  };
}

export async function createProcessFlow(supabase: Supabase, input: CreateProcessFlow) {
  return supabase
    .from('process_flows')
    .insert({
      team_id: input.team_id,
      name: input.name,
      description: input.description ?? null,
      context_markdown: input.context_markdown ?? null,
      viewport: input.viewport ?? null,
      schema_version: 1,
    })
    .select()
    .single();
}

export async function updateProcessFlow(supabase: Supabase, processFlowId: string, changes: UpdateProcessFlow) {
  return supabase.from('process_flows').update(pickDefined(changes)).eq('id', processFlowId).select().single();
}

export async function deleteProcessFlow(supabase: Supabase, processFlowId: string) {
  return supabase.from('process_flows').delete().eq('id', processFlowId).select().single();
}

export async function createProcessFlowNode(supabase: Supabase, input: CreateProcessFlowNode) {
  return supabase
    .from('process_flow_nodes')
    .insert({
      process_flow_id: input.process_flow_id,
      type: input.type,
      position_x: input.position.x,
      position_y: input.position.y,
      width: input.size?.width ?? null,
      height: input.size?.height ?? null,
      data: input.data,
    })
    .select()
    .single();
}

export async function updateProcessFlowNode(
  supabase: Supabase,
  processFlowId: string,
  nodeId: string,
  changes: UpdateProcessFlowNode,
) {
  const dbChanges = pickDefined({
    type: changes.type,
    position_x: changes.position?.x,
    position_y: changes.position?.y,
    width: changes.size === undefined ? undefined : (changes.size?.width ?? null),
    height: changes.size === undefined ? undefined : (changes.size?.height ?? null),
    data: changes.data,
  });

  return supabase
    .from('process_flow_nodes')
    .update(dbChanges)
    .eq('id', nodeId)
    .eq('process_flow_id', processFlowId)
    .select()
    .single();
}

export async function deleteProcessFlowNode(supabase: Supabase, processFlowId: string, nodeId: string) {
  return supabase
    .from('process_flow_nodes')
    .delete()
    .eq('id', nodeId)
    .eq('process_flow_id', processFlowId)
    .select()
    .single();
}

export async function createProcessFlowEdge(
  supabase: Supabase,
  input: CreateProcessFlowEdge,
): Promise<DbResult<ProcessFlowEdgeRow>> {
  const validation = await assertNodesBelongToFlow(supabase, input.process_flow_id, [
    input.source_node_id,
    input.target_node_id,
  ]);
  if (!validation.ok) {
    return { data: null, error: validation.error };
  }

  return supabase
    .from('process_flow_edges')
    .insert({
      process_flow_id: input.process_flow_id,
      type: input.type,
      source_node_id: input.source_node_id,
      target_node_id: input.target_node_id,
      data: input.data ?? null,
    })
    .select()
    .single();
}

export async function updateProcessFlowEdge(
  supabase: Supabase,
  processFlowId: string,
  edgeId: string,
  changes: UpdateProcessFlowEdge,
) {
  return supabase
    .from('process_flow_edges')
    .update(
      pickDefined({
        type: changes.type,
        data: changes.data,
      }),
    )
    .eq('id', edgeId)
    .eq('process_flow_id', processFlowId)
    .select()
    .single();
}

export async function deleteProcessFlowEdge(supabase: Supabase, processFlowId: string, edgeId: string) {
  return supabase
    .from('process_flow_edges')
    .delete()
    .eq('id', edgeId)
    .eq('process_flow_id', processFlowId)
    .select()
    .single();
}

export async function batchMutateProcessFlowNodes(supabase: Supabase, input: BatchMutateProcessFlowNodes) {
  const { data, error } = await supabase.rpc('batch_mutate_process_flow_nodes', {
    p_process_flow_id: input.process_flow_id,
    p_mutations: input.mutations,
  });

  if (error || !data) {
    return { data: null, error };
  }

  const mutationResult = data as RpcMutationResult<ProcessFlowNodeRow>;

  return {
    data: {
      created: (mutationResult.created ?? []).map(mapProcessFlowNodeRow),
      updated: (mutationResult.updated ?? []).map(mapProcessFlowNodeRow),
      deleted: (mutationResult.deleted ?? []).map(mapProcessFlowNodeRow),
    },
    error: null,
  };
}

export async function batchMutateProcessFlowEdges(supabase: Supabase, input: BatchMutateProcessFlowEdges) {
  const { data, error } = await supabase.rpc('batch_mutate_process_flow_edges', {
    p_process_flow_id: input.process_flow_id,
    p_mutations: input.mutations,
  });

  if (error || !data) {
    return { data: null, error };
  }

  const mutationResult = data as RpcMutationResult<ProcessFlowEdgeRow>;

  return {
    data: {
      created: (mutationResult.created ?? []).map(mapProcessFlowEdgeRow),
      updated: (mutationResult.updated ?? []).map(mapProcessFlowEdgeRow),
      deleted: (mutationResult.deleted ?? []).map(mapProcessFlowEdgeRow),
    },
    error: null,
  };
}

export function buildProcessFlowFull(
  flow: ProcessFlowRow,
  nodes: ProcessFlowNodeRow[],
  edges: ProcessFlowEdgeRow[],
): ProcessFlowFull {
  return {
    ...mapProcessFlowRow(flow),
    nodes: nodes.map(mapProcessFlowNodeRow),
    edges: edges.map(mapProcessFlowEdgeRow),
  };
}

export function validateProcessFlowGraph(flow: ProcessFlowFull): ProcessFlowValidationResult {
  const warnings: ProcessFlowValidationWarning[] = [];
  const nodeMap = new Map(flow.nodes.map((node) => [node.id, node]));
  const outgoing = new Map<string, ProcessFlowEdge[]>();
  const incoming = new Map<string, ProcessFlowEdge[]>();
  const labelGroups = new Map<string, string[]>();

  for (const edge of flow.edges) {
    const out = outgoing.get(edge.source_node_id) ?? [];
    out.push(edge);
    outgoing.set(edge.source_node_id, out);

    const inEdges = incoming.get(edge.target_node_id) ?? [];
    inEdges.push(edge);
    incoming.set(edge.target_node_id, inEdges);

    if (edge.source_node_id === edge.target_node_id) {
      warnings.push({
        code: 'self_referential_edge',
        message: 'Edges cannot connect a node to itself.',
        edge_ids: [edge.id],
      });
    }
  }

  warnings.push(...buildNodeLevelWarnings(flow, incoming, outgoing, labelGroups));
  warnings.push(...buildDuplicateLabelWarnings(nodeMap, labelGroups));
  warnings.push(...buildEdgeLevelWarnings(flow, nodeMap));

  return { warnings };
}

export async function validateProcessFlowById(supabase: Supabase, processFlowId: string) {
  const { flowResult, nodesResult, edgesResult } = await getProcessFlowGraph(supabase, processFlowId);

  if (flowResult.error || !flowResult.data) {
    return { data: null, error: flowResult.error };
  }
  if (nodesResult.error) return { data: null, error: nodesResult.error };
  if (edgesResult.error) return { data: null, error: edgesResult.error };

  const flow = buildProcessFlowFull(
    flowResult.data as ProcessFlowRow,
    (nodesResult.data ?? []) as ProcessFlowNodeRow[],
    (edgesResult.data ?? []) as ProcessFlowEdgeRow[],
  );

  return {
    data: validateProcessFlowGraph(flow),
    error: null,
  };
}

export async function autolayoutProcessFlow(supabase: Supabase, processFlowId: string) {
  const { flowResult, nodesResult, edgesResult } = await getProcessFlowGraph(supabase, processFlowId);

  if (flowResult.error || !flowResult.data) {
    return { data: null, error: flowResult.error };
  }
  if (nodesResult.error) return { data: null, error: nodesResult.error };
  if (edgesResult.error) return { data: null, error: edgesResult.error };

  const nodes = ((nodesResult.data ?? []) as ProcessFlowNodeRow[]).map(mapProcessFlowNodeRow);
  const edges = ((edgesResult.data ?? []) as ProcessFlowEdgeRow[]).map(mapProcessFlowEdgeRow);

  if (nodes.length === 0) {
    return {
      data: {
        nodes: [],
        edges,
      },
      error: null,
    };
  }

  const elk = new ELK();
  const layout = await elk.layout({
    id: processFlowId,
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': 'RIGHT',
      'elk.layered.spacing.nodeNodeBetweenLayers': '120',
      'elk.spacing.nodeNode': '60',
      'elk.edgeRouting': 'ORTHOGONAL',
    },
    children: nodes.map((node) => {
      const size = node.size ?? defaultNodeSize(node.type);
      return {
        id: node.id,
        width: size.width ?? defaultNodeSize(node.type).width,
        height: size.height ?? defaultNodeSize(node.type).height,
      };
    }),
    edges: edges.map((edge) => ({
      id: edge.id,
      sources: [edge.source_node_id],
      targets: [edge.target_node_id],
    })),
  });

  const layoutedNodes = nodes.map((node) => {
    const layoutNode = layout.children?.find((child: { id?: string; x?: number; y?: number }) => child.id === node.id);
    return {
      ...node,
      position: {
        x: layoutNode?.x ?? node.position.x,
        y: layoutNode?.y ?? node.position.y,
      },
    };
  });

  const { error } = await supabase.rpc('apply_process_flow_layout', {
    p_process_flow_id: processFlowId,
    p_positions: layoutedNodes.map((node) => ({
      id: node.id,
      x: node.position.x,
      y: node.position.y,
    })),
  });

  if (error) {
    return { data: null, error };
  }

  return {
    data: {
      nodes: layoutedNodes,
      edges,
    },
    error: null,
  };
}
