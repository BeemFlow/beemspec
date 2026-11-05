import { describe, expect, it } from 'vitest';
import type { ProcessFlowFull } from '@/domain/process-flow';
import { validateProcessFlowGraph } from './service';

describe('process flow validation', () => {
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
});
