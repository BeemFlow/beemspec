import ELK from 'elkjs/lib/elk.bundled.js';
import type {
  CreateProcessFlow,
  ProcessFlowDiagramMetadata,
  ProcessFlowDocument,
  ProcessFlowEdge,
  ProcessFlowFull,
  ProcessFlowNode,
  ProcessFlowValidationResult,
  ProcessFlowValidationWarning,
  ProcessFlowView,
  UpdateProcessFlow,
} from '@/domain/process-flow';
import type { Supabase } from '@/lib/supabase/types';
import { pickDefined } from '@/lib/validations';
import {
  type DiagramDirection,
  EMPTY_MERMAID,
  layoutDirection,
  ProcessFlowDocumentError,
  patchDiagramMetadata,
  readDiagramDirection,
  readMermaid,
  serializeMermaid,
} from './document';

const flowSummaryFields =
  'id, team_id, name, description, context_markdown, viewport, schema_version, created_at, updated_at';
const emptyMetadata: ProcessFlowDiagramMetadata = { nodes: {}, edges: {} };
const revisionConflict = () =>
  new ProcessFlowDocumentError('This process flow changed. Reload it and retry with the current revision.', 409);

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
  flow: FlowGraph,
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
  flow: FlowGraph,
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

export function validateProcessFlowGraph(flow: FlowGraph): ProcessFlowValidationResult {
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

type FlowGraph = Pick<ProcessFlowFull, 'nodes' | 'edges'>;

function validatedGraph(graph: FlowGraph) {
  return { nodes: graph.nodes, edges: graph.edges, validation: validateProcessFlowGraph(graph) };
}

function toView(document: ProcessFlowDocument, graph: ReturnType<typeof validatedGraph>): ProcessFlowView {
  return { ...document, ...graph };
}

function nodeBounds(node: ProcessFlowNode) {
  const defaults = defaultNodeSize(node.type);
  return {
    ...node.position,
    width: Math.max(1, node.size?.width ?? defaults.width),
    height: Math.max(1, node.size?.height ?? defaults.height),
  };
}

async function placeNodes(
  graph: FlowGraph,
  direction: DiagramDirection,
  shouldPlace: (node: ProcessFlowNode) => boolean,
) {
  if (!graph.nodes.some(shouldPlace)) return;
  const layout = await new ELK().layout({
    id: 'flow',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': layoutDirection(direction),
      'elk.layered.spacing.nodeNodeBetweenLayers': '120',
      'elk.spacing.nodeNode': '60',
      'elk.edgeRouting': 'ORTHOGONAL',
    },
    children: graph.nodes.map((node) => {
      const defaults = defaultNodeSize(node.type);
      return { id: node.id, width: node.size?.width ?? defaults.width, height: node.size?.height ?? defaults.height };
    }),
    edges: graph.edges.map((edge) => ({
      id: edge.id,
      sources: [edge.source_node_id],
      targets: [edge.target_node_id],
    })),
  });
  const positions = new Map(layout.children?.map(({ id, x, y }) => [id, { x, y }]));
  const occupied = graph.nodes.filter((node) => !shouldPlace(node)).map(nodeBounds);
  const horizontal = direction === 'LR' || direction === 'RL';
  for (const node of graph.nodes.filter(shouldPlace)) {
    const position = positions.get(node.id);
    if (position?.x !== undefined && position.y !== undefined) {
      const candidate = { ...nodeBounds(node), x: position.x, y: position.y };
      // ELK places the whole graph. Retained manual positions are obstacles in
      // that layout, so move only new nodes past collisions on the cross axis.
      while (true) {
        const collision = occupied.find(
          (box) =>
            candidate.x < box.x + box.width + 60 &&
            candidate.x + candidate.width + 60 > box.x &&
            candidate.y < box.y + box.height + 60 &&
            candidate.y + candidate.height + 60 > box.y,
        );
        if (!collision) break;
        if (horizontal) candidate.y = collision.y + collision.height + 60;
        else candidate.x = collision.x + collision.width + 60;
      }
      node.position = { x: candidate.x, y: candidate.y };
      occupied.push(candidate);
    }
  }
}

async function prepareDiagram(
  flowId: string,
  source: string,
  metadata: ProcessFlowDiagramMetadata,
  patch: UpdateProcessFlow['diagram_metadata'],
  autoLayout: boolean,
) {
  const direction = readDiagramDirection(source);
  const patchedMetadata = patchDiagramMetadata(metadata, patch);
  const graph = readMermaid(source, flowId, patchedMetadata, true);
  const nodeIds = new Set(graph.nodes.map((node) => node.id));
  const edgeIds = new Set(graph.edges.map((edge) => edge.id));
  if (
    Object.keys(patch?.nodes ?? {}).some((id) => !nodeIds.has(id)) ||
    Object.keys(patch?.edges ?? {}).some((id) => !edgeIds.has(id))
  ) {
    throw new ProcessFlowDocumentError('Metadata must refer to a node or edge ID in the Mermaid document.');
  }
  await placeNodes(
    graph,
    direction,
    (node) => autoLayout || !Object.hasOwn(patchedMetadata.nodes, node.id) || !patchedMetadata.nodes[node.id]?.position,
  );
  return { graph, diagram: serializeMermaid(graph, direction) };
}

export async function listProcessFlows(supabase: Supabase, teamId: string) {
  return supabase
    .from('process_flows')
    .select(flowSummaryFields)
    .eq('team_id', teamId)
    .order('updated_at', { ascending: false });
}

export async function getProcessFlow(supabase: Supabase, flowId: string) {
  const { data, error } = await supabase.from('process_flows').select('*').eq('id', flowId).single();
  if (error || !data) return { data: null, error };
  const document: ProcessFlowDocument = data;
  return {
    data: toView(document, validatedGraph(readMermaid(document.mermaid_source, flowId, document.diagram_metadata))),
    error: null,
  };
}

export async function createProcessFlow(supabase: Supabase, input: CreateProcessFlow) {
  const { mermaid_source, diagram_metadata, ...settings } = input;
  const id = crypto.randomUUID();
  const { graph, diagram } = await prepareDiagram(
    id,
    mermaid_source ?? EMPTY_MERMAID,
    emptyMetadata,
    diagram_metadata,
    false,
  );
  const view = validatedGraph(graph);
  const { data, error } = await supabase
    .from('process_flows')
    .insert({ ...settings, id, ...diagram })
    .select()
    .single();
  return { data: data ? toView(data, view) : null, error };
}

export async function updateProcessFlow(supabase: Supabase, flowId: string, input: UpdateProcessFlow) {
  const { expected_revision, mermaid_source, diagram_metadata, layout, canvas, ...settings } = input;
  const current = await getProcessFlow(supabase, flowId);
  if (!current.data) return current;
  if (current.data.diagram_revision !== expected_revision) throw revisionConflict();

  const source = mermaid_source ?? current.data.mermaid_source;
  const canvasDocument = canvas ? serializeMermaid(canvas, readDiagramDirection(source)) : null;
  const prepared =
    canvas || mermaid_source !== undefined || diagram_metadata || layout
      ? await prepareDiagram(
          flowId,
          canvasDocument?.mermaid_source ?? source,
          canvasDocument?.diagram_metadata ?? current.data.diagram_metadata,
          diagram_metadata,
          layout === 'auto',
        )
      : null;

  const view = validatedGraph(prepared?.graph ?? current.data);
  const { data, error } = await supabase
    .from('process_flows')
    .update({ ...pickDefined(settings), ...prepared?.diagram, diagram_revision: expected_revision + 1 })
    .eq('id', flowId)
    .eq('diagram_revision', expected_revision)
    .select()
    .maybeSingle();
  if (error) return { data: null, error };
  if (!data) throw revisionConflict();
  return { data: toView(data, view), error: null };
}

export async function deleteProcessFlow(supabase: Supabase, flowId: string) {
  return supabase.from('process_flows').delete().eq('id', flowId).select('id').single();
}
