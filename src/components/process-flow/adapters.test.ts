import { describe, expect, it } from 'vitest';
import { getStartNodeId, toCanvasEdge, toCanvasNode } from './adapters';

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
        frequency: null,
        estimated_duration: null,
        time_constraint: null,
      },
    });

    expect(node.position).toEqual({ x: 0, y: 0 });
    expect(node.data.label).toBe('Untitled');
    expect(node.data.systems).toEqual(['Slack']);
    expect(node.data.inputs).toEqual([]);
    expect(node.data.outputs).toEqual(['Invoice']);
    expect(node.data.nodeType).toBe('step');
  });

  it('maps each edge type to a fitting canvas style', () => {
    const base = {
      process_flow_id: 'flow-1',
      source_node_id: 'node-1',
      target_node_id: 'node-2',
      data: { label: 'Next' },
    };

    const flow = toCanvasEdge({ id: 'edge-flow', type: 'flow', ...base });
    const handoff = toCanvasEdge({ id: 'edge-handoff', type: 'handoff', ...base });
    const exception = toCanvasEdge({ id: 'edge-exception', type: 'exception', ...base });
    const dependency = toCanvasEdge({ id: 'edge-dependency', type: 'dependency', ...base });

    expect(flow).toEqual(
      expect.objectContaining({
        type: 'smoothstep',
        animated: false,
        style: expect.objectContaining({ strokeWidth: 1.75 }),
      }),
    );
    expect(handoff).toEqual(
      expect.objectContaining({
        type: 'smoothstep',
        animated: true,
        style: expect.objectContaining({ strokeWidth: 2 }),
      }),
    );
    expect(exception).toEqual(
      expect.objectContaining({
        type: 'bezier',
        animated: true,
        style: expect.objectContaining({ strokeDasharray: '7 5' }),
      }),
    );
    expect(dependency).toEqual(
      expect.objectContaining({
        type: 'step',
        animated: false,
        style: expect.objectContaining({ strokeDasharray: '3 5', strokeWidth: 1.5 }),
      }),
    );
  });

  it('prefers root nodes and then left-to-right top-to-bottom ordering for the start node', () => {
    const nodes = [
      { id: 'node-3', position: { x: 400, y: 80 } },
      { id: 'node-2', position: { x: 100, y: 200 } },
      { id: 'node-1', position: { x: 100, y: 40 } },
    ] as any;
    const edges = [{ id: 'edge-1', source: 'node-1', target: 'node-3' }] as any;

    expect(getStartNodeId(nodes, edges)).toBe('node-1');
  });

  it('falls back to the left-most top-most node when every node has an incoming edge', () => {
    const nodes = [
      { id: 'node-1', position: { x: 200, y: 80 } },
      { id: 'node-2', position: { x: 100, y: 120 } },
      { id: 'node-3', position: { x: 100, y: 40 } },
    ] as any;
    const edges = [
      { id: 'edge-1', source: 'node-1', target: 'node-2' },
      { id: 'edge-2', source: 'node-2', target: 'node-3' },
      { id: 'edge-3', source: 'node-3', target: 'node-1' },
    ] as any;

    expect(getStartNodeId(nodes, edges)).toBe('node-3');
  });
});
