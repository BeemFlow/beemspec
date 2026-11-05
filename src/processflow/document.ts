import { type FlowchartModel, PeleError, parse } from 'pele';
import type {
  ProcessFlowDiagramMetadata,
  ProcessFlowEdge,
  ProcessFlowEdgeType,
  ProcessFlowFull,
  ProcessFlowNode,
  ProcessFlowNodeType,
  UpdateProcessFlow,
} from '@/domain/process-flow';

const nodeShapes = {
  step: { shape: 'square', open: '[', close: ']' },
  decision: { shape: 'diamond', open: '{', close: '}' },
  subprocess: { shape: 'subroutine', open: '[[', close: ']]' },
  actor: { shape: 'round', open: '(', close: ')' },
  system: { shape: 'cylinder', open: '[(', close: ')]' },
  note: { shape: 'stadium', open: '([', close: '])' },
} satisfies Record<ProcessFlowNodeType, { shape: string; open: string; close: string }>;

const edgeArrows = { flow: '-->', handoff: '==>', exception: '-.->', dependency: '-->' };
const namedEntities = new Map([
  ['quot', '"'],
  ['apos', "'"],
  ['amp', '&'],
  ['lt', '<'],
  ['gt', '>'],
  ['nbsp', '\u00a0'],
]);
const directions = { LR: 'RIGHT', RL: 'LEFT', TB: 'DOWN', TD: 'DOWN', BT: 'UP' } as const;
export type DiagramDirection = keyof typeof directions;

export const EMPTY_MERMAID = 'flowchart LR';
const stableId = /^[A-Za-z_][A-Za-z0-9_-]*$/;

export class ProcessFlowDocumentError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 409 = 400,
  ) {
    super(message);
  }
}

function encodeLabel(label: string) {
  const characters = [...label];
  if (characters.length === 0) return '#0;';
  return characters
    .map((character, index) => {
      const code = character.codePointAt(0) ?? 0;
      if (code === 0) throw new ProcessFlowDocumentError('Labels cannot contain a NUL character.');
      const boundarySpace = character === ' ' && (index === 0 || index === characters.length - 1);
      return code < 32 || code > 126 || '"#&<>|\\`'.includes(character) || boundarySpace ? `#${code};` : character;
    })
    .join('');
}

function decodeLabel(label: string) {
  // Pele 1.13 protects Mermaid entity codes in its parsed model before rendering.
  return label.replace(/ﬂ°(°\d+|[A-Za-z][A-Za-z0-9]*)¶ß/g, (_, entity: string) => {
    if (entity.startsWith('°')) {
      const code = Number(entity.slice(1));
      if (code === 0) return '';
      if (code <= 0x10ffff && (code < 0xd800 || code > 0xdfff)) return String.fromCodePoint(code);
    }
    const named = namedEntities.get(entity);
    if (named !== undefined) return named;
    throw new ProcessFlowDocumentError(`Unsupported label entity: ${entity}.`);
  });
}

function entry<T>(values: Record<string, T> | undefined, id: string): T | undefined {
  return values && Object.hasOwn(values, id) ? values[id] : undefined;
}

export function layoutDirection(direction: DiagramDirection) {
  return directions[direction];
}

export function readDiagramDirection(source: string): DiagramDirection {
  const direction = /^\s*(?:flowchart|graph)\s+(LR|RL|TB|TD|BT)\b/.exec(source)?.[1];
  return (direction as DiagramDirection | undefined) ?? 'LR';
}

export function readMermaid(
  source: string,
  flowId: string,
  metadata: ProcessFlowDiagramMetadata,
  assignEdgeIds = false,
): Pick<ProcessFlowFull, 'nodes' | 'edges'> {
  if (!/^\s*(?:flowchart|graph)\s+(?:LR|RL|TB|TD|BT)\b/.test(source)) {
    throw new ProcessFlowDocumentError('Use a Mermaid flowchart beginning with a direction, for example flowchart LR.');
  }
  if (/^\s*(?:%%|click\s|style\s|class(?:Def)?\s|linkStyle\s)/m.test(source)) {
    throw new ProcessFlowDocumentError(
      'Comments, links, and styling are outside the editable Mermaid flowchart subset.',
    );
  }

  let diagram: FlowchartModel;
  try {
    const parsed = parse(source, {
      limit: source.length,
      maxEdges: Math.max(10_000, Object.keys(metadata.edges).length),
    });
    if (parsed.type !== 'flowchart') throw new ProcessFlowDocumentError('Use a Mermaid flowchart.');
    diagram = parsed;
  } catch (error) {
    if (error instanceof PeleError) throw new ProcessFlowDocumentError(error.message);
    throw error;
  }

  if (
    diagram.subgraphs.length ||
    diagram.classes.size ||
    diagram.tooltips.size ||
    diagram.defaultEdgeStyle ||
    diagram.defaultInterpolate ||
    diagram.accTitle ||
    diagram.accDescr
  ) {
    throw new ProcessFlowDocumentError(
      'Subgraphs, styling, and other diagram directives are outside the editable Mermaid subset.',
    );
  }

  const nodes = Array.from(diagram.nodes.values(), (node): ProcessFlowNode => {
    const type = (Object.keys(nodeShapes) as ProcessFlowNodeType[]).find(
      (candidate) => nodeShapes[candidate].shape === (node.type ?? 'square'),
    );
    if (
      !stableId.test(node.id) ||
      !type ||
      node.labelType === 'markdown' ||
      node.link ||
      node.classes.length ||
      node.styles.length ||
      Object.keys(node.props ?? {}).length
    ) {
      throw new ProcessFlowDocumentError(
        `Unsupported node syntax for "${node.id}". Use a standard shape and a plain-text label.`,
      );
    }
    const saved = entry(metadata.nodes, node.id);
    return {
      id: node.id,
      process_flow_id: flowId,
      type,
      position: saved?.position ?? { x: 0, y: 0 },
      size: saved?.size ?? null,
      data: { ...saved?.data, label: decodeLabel(node.text ?? node.id) },
    };
  });
  const edgeIds = new Set<string>();
  const connections = new Set<string>();
  const edges = diagram.edges.map((edge): ProcessFlowEdge => {
    if (
      edge.type !== 'arrow_point' ||
      edge.labelType === 'markdown' ||
      edge.classes.length ||
      edge.style ||
      edge.interpolate ||
      edge.animate !== undefined ||
      edge.animation !== undefined ||
      (edge.length ?? 1) !== 1 ||
      !['normal', 'thick', 'dotted'].includes(edge.stroke ?? 'normal')
    ) {
      throw new ProcessFlowDocumentError(
        'Use plain directed arrows (-->), handoffs (==>), or exception arrows (-.->).',
      );
    }
    const id = edge.isUserDefinedId ? edge.id : assignEdgeIds ? `e_${crypto.randomUUID()}` : edge.id;
    if (!id || !stableId.test(id) || edgeIds.has(id)) {
      throw new ProcessFlowDocumentError('Each Mermaid edge must have a unique ID.');
    }
    edgeIds.add(id);
    const saved = entry(metadata.edges, id);
    const type: ProcessFlowEdgeType =
      saved?.type ?? (edge.stroke === 'thick' ? 'handoff' : edge.stroke === 'dotted' ? 'exception' : 'flow');
    const key = JSON.stringify([edge.start, edge.end, type]);
    if (edge.start === edge.end || connections.has(key)) {
      throw new ProcessFlowDocumentError(
        'An edge must connect two distinct steps, and each connection of the same type must be unique.',
      );
    }
    connections.add(key);
    const label = edge.text === '' ? undefined : decodeLabel(edge.text);
    return {
      id,
      process_flow_id: flowId,
      type,
      source_node_id: edge.start,
      target_node_id: edge.end,
      data: label === undefined ? (saved?.data ?? null) : { ...saved?.data, label },
    };
  });
  return { nodes, edges };
}

export function serializeMermaid(graph: Pick<ProcessFlowFull, 'nodes' | 'edges'>, direction: DiagramDirection) {
  const lines = [`flowchart ${direction}`];
  const nodes: ProcessFlowDiagramMetadata['nodes'] = Object.create(null);
  const edges: ProcessFlowDiagramMetadata['edges'] = Object.create(null);

  for (const node of graph.nodes) {
    if (!stableId.test(node.id) || Object.hasOwn(nodes, node.id)) {
      throw new ProcessFlowDocumentError('Each Mermaid node must have a valid, unique ID.');
    }
    const { label, ...data } = node.data;
    const { open, close } = nodeShapes[node.type];
    lines.push(`  ${node.id}${open}"${encodeLabel(label)}"${close}`);
    nodes[node.id] = { position: node.position, size: node.size ?? null, data };
  }
  for (const edge of graph.edges) {
    if (
      !stableId.test(edge.id) ||
      Object.hasOwn(edges, edge.id) ||
      !Object.hasOwn(nodes, edge.source_node_id) ||
      !Object.hasOwn(nodes, edge.target_node_id)
    ) {
      throw new ProcessFlowDocumentError('Each Mermaid edge needs a unique ID and two existing endpoints.');
    }
    const label = edge.data?.label;
    const caption = typeof label === 'string' ? `|"${encodeLabel(label)}"|` : '';
    lines.push(`  ${edge.source_node_id} ${edge.id}@${edgeArrows[edge.type]}${caption} ${edge.target_node_id}`);
    const data = edge.data ? { ...edge.data } : null;
    if (typeof data?.label === 'string') delete data.label;
    edges[edge.id] = {
      ...(edge.type === 'dependency' ? { type: 'dependency' } : {}),
      data: data as ProcessFlowDiagramMetadata['edges'][string]['data'],
    };
  }
  return { mermaid_source: lines.join('\n'), diagram_metadata: { nodes, edges } };
}

export function patchDiagramMetadata(
  current: ProcessFlowDiagramMetadata,
  patch: UpdateProcessFlow['diagram_metadata'],
): ProcessFlowDiagramMetadata {
  if (!patch) return current;
  const nodes: ProcessFlowDiagramMetadata['nodes'] = Object.assign(Object.create(null), current.nodes);
  const edges: ProcessFlowDiagramMetadata['edges'] = Object.assign(Object.create(null), current.edges);
  for (const [id, update] of Object.entries(patch.nodes ?? {})) {
    const previous = nodes[id];
    nodes[id] = {
      ...previous,
      ...update,
      ...(update.data ? { data: { ...previous?.data, ...update.data } } : {}),
    };
  }
  for (const [id, { type, data }] of Object.entries(patch.edges ?? {})) {
    const previous = edges[id];
    edges[id] = {
      type: type === null ? undefined : (type ?? previous?.type),
      data: data ? { ...previous?.data, ...data } : previous?.data,
    };
  }
  return { nodes, edges };
}
