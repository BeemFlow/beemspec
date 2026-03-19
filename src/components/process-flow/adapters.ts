import type { Edge, Node } from '@xyflow/react';
import type {
  ProcessFlowEdge,
  ProcessFlowEdgeData,
  ProcessFlowFull,
  ProcessFlowNode,
  ProcessFlowNodeData,
  ProcessFlowNodeType,
} from '@/types';

export type ProcessFlowCanvasNodeData = ProcessFlowNodeData &
  Record<string, unknown> & {
    nodeType: ProcessFlowNodeType;
  };

export type ProcessFlowCanvasEdgeData = ProcessFlowEdgeData &
  Record<string, unknown> & {
    edgeType: ProcessFlowEdge['type'];
  };

export type ProcessFlowCanvasNode = Node<ProcessFlowCanvasNodeData>;
export type ProcessFlowCanvasEdge = Edge<ProcessFlowCanvasEdgeData>;

const validNodeTypes: ProcessFlowNodeType[] = ['step', 'decision', 'subprocess', 'actor', 'system', 'note'];

const edgeStyles = {
  flow: {
    type: 'smoothstep',
    animated: false,
    style: {
      stroke: 'rgba(26, 23, 20, 0.55)',
      strokeWidth: 1.75,
    },
  },
  handoff: {
    type: 'smoothstep',
    animated: true,
    style: {
      stroke: 'rgba(47, 122, 77, 0.8)',
      strokeWidth: 2,
    },
  },
  exception: {
    type: 'bezier',
    animated: true,
    style: {
      stroke: 'rgba(180, 83, 9, 0.85)',
      strokeWidth: 1.75,
      strokeDasharray: '7 5',
    },
  },
  dependency: {
    type: 'step',
    animated: false,
    style: {
      stroke: 'rgba(87, 83, 78, 0.7)',
      strokeWidth: 1.5,
      strokeDasharray: '3 5',
    },
  },
} satisfies Record<
  ProcessFlowEdge['type'],
  { type: ProcessFlowCanvasEdge['type']; animated: boolean; style: NonNullable<ProcessFlowCanvasEdge['style']> }
>;

function normalizeNodeType(type: ProcessFlowNode['type'] | string | undefined): ProcessFlowNodeType {
  return validNodeTypes.includes(type as ProcessFlowNodeType) ? (type as ProcessFlowNodeType) : 'step';
}

function normalizeNodePosition(node: Partial<ProcessFlowNode>): { x: number; y: number } {
  const x = typeof node.position?.x === 'number' && Number.isFinite(node.position.x) ? node.position.x : 0;
  const y = typeof node.position?.y === 'number' && Number.isFinite(node.position.y) ? node.position.y : 0;
  return { x, y };
}

function normalizeNodeData(node: Partial<ProcessFlowNode>, nodeType: ProcessFlowNodeType): ProcessFlowCanvasNodeData {
  const raw: Partial<ProcessFlowNodeData> = node.data ?? {};
  return {
    label: typeof raw.label === 'string' && raw.label.trim() ? raw.label : 'Untitled',
    owner_role: typeof raw.owner_role === 'string' ? raw.owner_role : null,
    systems: Array.isArray(raw.systems)
      ? raw.systems.filter((value: unknown): value is string => typeof value === 'string')
      : [],
    inputs: Array.isArray(raw.inputs)
      ? raw.inputs.filter((value: unknown): value is string => typeof value === 'string')
      : [],
    outputs: Array.isArray(raw.outputs)
      ? raw.outputs.filter((value: unknown): value is string => typeof value === 'string')
      : [],
    pain_points: typeof raw.pain_points === 'string' ? raw.pain_points : null,
    notes: typeof raw.notes === 'string' ? raw.notes : null,
    automation_opportunity: typeof raw.automation_opportunity === 'string' ? raw.automation_opportunity : null,
    frequency: typeof raw.frequency === 'string' ? raw.frequency : null,
    estimated_duration: typeof raw.estimated_duration === 'string' ? raw.estimated_duration : null,
    time_constraint: typeof raw.time_constraint === 'string' ? raw.time_constraint : null,
    nodeType,
  };
}

export function toCanvasNode(node: ProcessFlowNode): ProcessFlowCanvasNode {
  const nodeType = normalizeNodeType(node.type);

  return {
    id: node.id,
    type: nodeType,
    position: normalizeNodePosition(node),
    selected: false,
    data: normalizeNodeData(node, nodeType),
    ...(node.size?.width ? { width: node.size.width } : {}),
    ...(node.size?.height ? { height: node.size.height } : {}),
  };
}

export function toCanvasEdge(edge: ProcessFlowEdge): ProcessFlowCanvasEdge {
  const edgeStyle = edgeStyles[edge.type];

  return {
    id: edge.id,
    source: edge.source_node_id,
    target: edge.target_node_id,
    type: edgeStyle.type,
    data: {
      ...(edge.data ?? {}),
      edgeType: edge.type,
    },
    label: edge.data?.label ?? undefined,
    animated: edgeStyle.animated,
    style: edgeStyle.style,
  };
}

export function toCanvasFlow(flow: ProcessFlowFull) {
  return {
    nodes: (flow.nodes ?? []).map(toCanvasNode),
    edges: (flow.edges ?? []).filter((edge) => Boolean(edge?.source_node_id && edge?.target_node_id)).map(toCanvasEdge),
  };
}

export function mergeCanvasNode(nodes: ProcessFlowCanvasNode[], node: ProcessFlowNode) {
  const next = toCanvasNode(node);
  const existingIndex = nodes.findIndex((item) => item.id === node.id);
  if (existingIndex === -1) return [...nodes, next];

  return nodes.map((item) => (item.id === node.id ? next : item));
}

export function mergeCanvasEdge(edges: ProcessFlowCanvasEdge[], edge: ProcessFlowEdge) {
  const next = toCanvasEdge(edge);
  const existingIndex = edges.findIndex((item) => item.id === edge.id);
  if (existingIndex === -1) return [...edges, next];

  return edges.map((item) => (item.id === edge.id ? next : item));
}
