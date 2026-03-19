export interface ProcessFlowViewport {
  x: number;
  y: number;
  zoom: number;
}

export interface ProcessFlow {
  id: string;
  team_id: string;
  name: string;
  description?: string | null;
  context_markdown?: string | null;
  viewport?: ProcessFlowViewport | null;
  schema_version: 1;
}

export type ProcessFlowNodeType = 'step' | 'decision' | 'subprocess' | 'actor' | 'system' | 'note';

export type ProcessFlowEdgeType = 'flow' | 'handoff' | 'exception' | 'dependency';

export interface ProcessFlowNodePosition {
  x: number;
  y: number;
}

export interface ProcessFlowNodeSize {
  width?: number;
  height?: number;
}

export interface ProcessFlowNodeData {
  label: string;
  owner_role?: string | null;
  systems?: string[];
  inputs?: string[];
  outputs?: string[];
  pain_points?: string | null;
  notes?: string | null;
  automation_opportunity?: string | null;
}

export interface ProcessFlowNode {
  id: string;
  process_flow_id: string;
  type: ProcessFlowNodeType;
  position: ProcessFlowNodePosition;
  size?: ProcessFlowNodeSize | null;
  data: ProcessFlowNodeData;
}

export interface ProcessFlowEdgeData {
  label?: string | null;
}

export interface ProcessFlowEdge {
  id: string;
  process_flow_id: string;
  type: ProcessFlowEdgeType;
  source_node_id: string;
  target_node_id: string;
  data?: ProcessFlowEdgeData | null;
}

export interface ProcessFlowFull extends ProcessFlow {
  nodes: ProcessFlowNode[];
  edges: ProcessFlowEdge[];
}

export interface ProcessFlowValidationWarning {
  code: string;
  message: string;
  node_ids?: string[];
  edge_ids?: string[];
}

export interface ProcessFlowValidationResult {
  warnings: ProcessFlowValidationWarning[];
}
