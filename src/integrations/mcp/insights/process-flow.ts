type ProcessFlowNodeLike = {
  id: string;
  type: string;
  data?: {
    label?: string;
    owner_role?: string | null;
    automation_opportunity?: string | null;
    frequency?: string | null;
    time_constraint?: string | null;
  } | null;
};

type ProcessFlowEdgeLike = {
  id: string;
  type: string;
  source_node_id: string;
  target_node_id: string;
  data?: {
    label?: string | null;
    condition?: string | null;
  } | null;
};

export function buildProcessFlowAgentInsights(nodes: ProcessFlowNodeLike[], edges: ProcessFlowEdgeLike[]) {
  const nodeCountsByType = nodes.reduce<Record<string, number>>((acc, node) => {
    acc[node.type] = (acc[node.type] ?? 0) + 1;
    return acc;
  }, {});

  const automationCandidates = nodes.filter((node) => node.data?.automation_opportunity?.trim()).length;
  const ownershipTaggedNodes = nodes.filter((node) => node.data?.owner_role?.trim()).length;
  const frequencyTaggedNodes = nodes.filter((node) => node.data?.frequency?.trim()).length;
  const timeConstrainedNodes = nodes.filter((node) => node.data?.time_constraint?.trim()).length;
  const labeledEdges = edges.filter((edge) => edge.data?.label?.trim()).length;
  const conditionedEdges = edges.filter((edge) => edge.data?.condition?.trim()).length;

  return {
    nodeCountsByType,
    edgeCount: edges.length,
    automationCandidates,
    ownershipTaggedNodes,
    frequencyTaggedNodes,
    timeConstrainedNodes,
    labeledEdges,
    conditionedEdges,
  };
}
