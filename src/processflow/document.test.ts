import { describe, expect, it } from 'vitest';
import type { ProcessFlowEdge, ProcessFlowNode } from '@/domain/process-flow';
import { readMermaid, serializeMermaid } from './document';

const flowId = 'd7f34189-5d27-4dc0-b2c5-23d11796add4';
const emptyMetadata = { nodes: {}, edges: {} };

describe('Mermaid process flow documents', () => {
  it('round-trips legacy shapes, labels, IDs, geometry, edge conditions and parallel branches', () => {
    const nodes: ProcessFlowNode[] = (['step', 'decision', 'subprocess', 'actor', 'system', 'note'] as const).map(
      (type, i) => ({
        id: `n_${i}`,
        process_flow_id: flowId,
        type,
        position: { x: i, y: -i - 2.5 },
        size: { width: 200 },
        data: { label: i ? '  Contains "quotes", pipes |, #35;, and emoji 🐝\n  ' : '', notes: 'Legacy notes' },
      }),
    );
    const edges: ProcessFlowEdge[] = (['flow', 'handoff', 'exception', 'dependency'] as const).map((type, i) => ({
      id: `e_${i}`,
      process_flow_id: flowId,
      type,
      source_node_id: 'n_0',
      target_node_id: 'n_1',
      data: [{ label: 'Review | amount', condition: ' > 1' }, { label: '' }, { label: null }, null][i],
    }));
    const { mermaid_source, diagram_metadata } = serializeMermaid({ nodes, edges }, 'LR');
    expect(readMermaid(mermaid_source, flowId, diagram_metadata)).toEqual({ nodes, edges });
    expect(readMermaid('flowchart LR', flowId, emptyMetadata)).toEqual({ nodes: [], edges: [] });
  });

  it.each([
    'sequenceDiagram\nA->>B: ping',
    'flowchart LR\nA e@--> B\ne@{ animate: true }',
    'flowchart LR\nA e@--> B\ne@{ animate: false }',
    'flowchart LR\nA e@--> B\ne@{ animation: fast }',
    'flowchart LR\nA e@--> B\ne@{ animation: slow }',
    'flowchart LR\nA --> A',
    'flowchart LR\nA --> B\nA --> B',
    'flowchart LR\nsubgraph Group\nA\nend',
    'flowchart LR\nA --> B\nclick A "https://example.com"',
  ])('rejects source the canvas cannot round-trip: %s', (source) => {
    expect(() => readMermaid(source, flowId, emptyMetadata, true)).toThrow();
  });
});
