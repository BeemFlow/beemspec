import { describe, expect, it } from 'vitest';
import { toCanvasNode } from './adapters';

describe('process flow adapters', () => {
  it('normalizes malformed node data into safe canvas nodes', () => {
    const node = toCanvasNode({
      id: 'node-1',
      process_flow_id: 'flow-1',
      type: 'step',
      position: { x: Number.NaN, y: Number.POSITIVE_INFINITY },
      size: null,
      data: {
        label: '',
        owner_role: null,
        systems: ['Slack', 12 as never],
        inputs: undefined,
        outputs: ['Invoice'],
        pain_points: null,
        notes: null,
        automation_opportunity: null,
      },
    });

    expect(node.position).toEqual({ x: 0, y: 0 });
    expect(node.data.label).toBe('Untitled');
    expect(node.data.systems).toEqual(['Slack']);
    expect(node.data.inputs).toEqual([]);
    expect(node.data.outputs).toEqual(['Invoice']);
    expect(node.data.nodeType).toBe('step');
  });
});
