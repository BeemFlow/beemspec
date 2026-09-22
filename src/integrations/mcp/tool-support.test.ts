import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createAnnotations,
  describeDbError,
  destructiveAnnotations,
  errorResult,
  successResult,
  updateAnnotations,
  withToolErrorBoundary,
} from './tool-support';

const entityId = '10000000-0000-4000-8000-000000000001';
const flowId = '10000000-0000-4000-8000-000000000002';

describe('MCP tool support', () => {
  afterEach(() => vi.restoreAllMocks());

  it('returns compact structured and text success content', () => {
    const result = successResult({ id: 'item-1' });

    expect(result.structuredContent).toEqual({ ok: true, data: { id: 'item-1' } });
    expect(result.content).toEqual([{ type: 'text', text: '{"ok":true,"data":{"id":"item-1"}}' }]);
  });

  it('returns model-visible tool errors', () => {
    const result = errorResult('Unable to update item', { code: 'P0001' });

    expect(result.isError).toBe(true);
    expect(result.structuredContent).toEqual({
      ok: false,
      error: 'Unable to update item',
      details: { code: 'P0001' },
    });
  });

  it('does not expose raw database diagnostics', () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(
      describeDbError({
        code: '23505',
        message: 'duplicate key violates internal_constraint_name',
        details: 'Key (secret_column) already exists',
        hint: 'Inspect private_table',
      }),
    ).toEqual({ code: '23505' });
    expect(describeDbError(new Error('connection string leaked'))).toEqual({});
    expect(describeDbError({ code: 'P0001', message: 'Unexpected private_table exception' })).toEqual({
      code: 'P0001',
    });
    expect(log).toHaveBeenCalledTimes(3);
  });

  it.each([
    'Order array must contain all sibling ids',
    'Order array includes ids outside target siblings',
    'Target order must include moved story id',
    'Story target task must belong to the same story map',
  ])('preserves the safe recovery message: %s', (message) => {
    expect(describeDbError({ code: 'P0001', message, details: 'private row data', hint: 'private function' })).toEqual({
      code: 'P0001',
      message,
    });
  });

  it('preserves known service validation failures without exposing arbitrary Error messages', () => {
    const message = 'Source and target nodes must belong to the same process flow';
    expect(describeDbError(new Error(message))).toEqual({ message });
  });

  it.each(['node', 'edge'])('identifies stale batch %s IDs without leaking private diagnostics', (entity) => {
    const result = describeDbError({
      code: 'P0001',
      message: `Process flow ${entity} ${entityId} not found in flow ${flowId}`,
      details: 'private row contents',
      hint: 'private function',
    });
    expect(result).toEqual({
      code: 'P0001',
      message: `Process flow ${entity} ${entityId} is not available in flow ${flowId}. Reload with processflow_get and retry using current IDs; the batch was not applied.`,
    });
  });

  it('explains concurrent layout changes safely', () => {
    expect(
      describeDbError({
        code: 'P0001',
        message: `Layout update expected 4 nodes but updated 3 nodes for flow ${flowId}`,
        details: 'private query',
      }),
    ).toEqual({
      code: 'P0001',
      message: 'The process flow changed during layout. Reload with processflow_get and retry autolayout.',
    });
  });

  it.each([
    [
      '23514',
      'new row for relation "process_flow_edges" violates check constraint "chk_process_flow_edges_source_target_distinct"',
      'distinct source and target',
    ],
    [
      '23505',
      'duplicate key value violates unique constraint "uq_process_flow_edges_unique_connection"',
      'already exists',
    ],
    [
      '23503',
      'insert or update on table "process_flow_edges" violates foreign key constraint "fk_process_flow_edges_source_in_flow"',
      'source node is not available',
    ],
    [
      '23503',
      'insert or update on table "process_flow_edges" violates foreign key constraint "fk_process_flow_edges_target_in_flow"',
      'target node is not available',
    ],
  ])('translates the known %s constraint safely: %s', (code, message, expected) => {
    const result = describeDbError({ code, message, details: 'private rows', hint: 'private query' });
    expect(result).toEqual({ code, message: expect.stringContaining(expected) });

    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(describeDbError({ code: 'P0001', message })).toEqual({ code: 'P0001' });
    expect(describeDbError({ code, message: `${message} private suffix` })).toEqual({ code });
    expect(log).toHaveBeenCalledTimes(2);
  });

  it.each([
    ['23505', `Process flow node ${entityId} not found in flow ${flowId}`],
    ['P0001', `Process flow node private_table not found in flow ${flowId}`],
    ['P0001', `Process flow node ${entityId} not found in flow ${flowId}; private details`],
    ['P0001', `Process flow node ${entityId} not found in flow ${flowId}\nprivate details`],
    ['P0001', `prefix Process flow edge ${entityId} not found in flow ${flowId}`],
    ['P0001', `Layout update expected private nodes but updated 3 nodes for flow ${flowId}`],
    ['P0001', `Layout update expected 4 nodes but updated 3 nodes for flow ${flowId} private suffix`],
  ])('does not classify near-matching errors as safe (%#)', (code, message) => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(describeDbError({ code, message })).toEqual({ code });
  });

  it('logs unexpected exceptions once without exposing their contents', async () => {
    const error = new Error('private connection details');
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const tool = withToolErrorBoundary('test_tool', async () => {
      throw error;
    });

    const result = await tool({});
    expect(result).toEqual(errorResult('Unexpected server error'));
    expect(log).toHaveBeenCalledExactlyOnceWith('[mcp] test_tool failed', error);
  });

  it('distinguishes additive creates from idempotent overwrites and deletes', () => {
    expect(createAnnotations).toMatchObject({ idempotentHint: false, destructiveHint: false });
    expect(updateAnnotations).toMatchObject({ idempotentHint: true, destructiveHint: true });
    expect(destructiveAnnotations).toMatchObject({ idempotentHint: true, destructiveHint: true });
  });
});
