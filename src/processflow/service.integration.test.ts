import { beforeEach, describe, expect, it } from 'vitest';
import type { UpdateProcessFlow } from '@/domain/process-flow';
import { createLocalSupabaseAdminClient, createLocalSupabasePublicClient } from '@/test/local-supabase';
import {
  E2E_NODE_RECEIVE_ID,
  E2E_OWNER_EMAIL,
  E2E_OWNER_PASSWORD,
  E2E_PROCESS_FLOW_ID,
  E2E_TEAM_ID,
  resetLocalAppState,
} from '../../e2e/local-fixtures';
import { createProcessFlow, getProcessFlow, updateProcessFlow } from './service';

const supabase = createLocalSupabaseAdminClient();

describe('process flow document service', () => {
  beforeEach(async () => {
    await resetLocalAppState();
  });

  it('persists a Mermaid edit and preserves metadata and positions by ID', async () => {
    const { data: before } = await getProcessFlow(supabase, E2E_PROCESS_FLOW_ID);
    if (!before) throw new Error('Missing seeded flow');
    const { data } = await updateProcessFlow(supabase, before.id, {
      expected_revision: before.diagram_revision,
      mermaid_source: before.mermaid_source.replace('Receive invoice', 'Check invoice'),
      diagram_metadata: { nodes: { [E2E_NODE_RECEIVE_ID]: { data: { frequency: 'Daily' } } } },
    });
    expect(data?.nodes[0]).toMatchObject({
      id: E2E_NODE_RECEIVE_ID,
      position: { x: 120, y: 140 },
      data: { label: 'Check invoice', owner_role: 'Operations', frequency: 'Daily' },
    });
    expect((await getProcessFlow(supabase, before.id)).data).toEqual(data);
  });

  it('accepts only one of two concurrent saves and rejects malformed source atomically', async () => {
    const writes = await Promise.allSettled(
      ['First', 'Second'].map((name) =>
        updateProcessFlow(supabase, E2E_PROCESS_FLOW_ID, { expected_revision: 1, name }),
      ),
    );
    expect(writes.filter(({ status }) => status === 'fulfilled')).toHaveLength(1);
    expect(writes).toContainEqual({ status: 'rejected', reason: expect.objectContaining({ status: 409 }) });
    const current = await getProcessFlow(supabase, E2E_PROCESS_FLOW_ID);
    expect(current.data?.diagram_revision).toBe(2);
    await expect(
      updateProcessFlow(supabase, E2E_PROCESS_FLOW_ID, {
        expected_revision: 2,
        mermaid_source: 'flowchart LR\nA --> A',
      }),
    ).rejects.toMatchObject({ status: 400 });
    expect(await getProcessFlow(supabase, E2E_PROCESS_FLOW_ID)).toEqual(current);
  });

  it('saves ELK layout under the same team authorization as document edits', async () => {
    const user = createLocalSupabasePublicClient();
    const login = await user.auth.signInWithPassword({ email: E2E_OWNER_EMAIL, password: E2E_OWNER_PASSWORD });
    expect(login.error).toBeNull();
    const result = await updateProcessFlow(user, E2E_PROCESS_FLOW_ID, { expected_revision: 1, layout: 'auto' });
    expect(result.error).toBeNull();
    expect(result.data?.nodes[0]?.position).not.toEqual({ x: 120, y: 140 });
    expect((await getProcessFlow(user, E2E_PROCESS_FLOW_ID)).data).toEqual(result.data);
  });
});

it('does not commit a canvas graph whose derived view fails validation', async () => {
  await resetLocalAppState();
  const before = await getProcessFlow(supabase, E2E_PROCESS_FLOW_ID);
  if (!before.data) throw new Error('Missing seeded flow');
  const nodes = before.data.nodes.map((node) => ({ ...node, data: { ...node.data, owner_role: 42 } }));
  const edges = before.data.edges.map((edge) => ({ ...edge, type: 'handoff' }));
  // Bypass the HTTP schema to verify the service validates before committing.
  await expect(
    updateProcessFlow(supabase, E2E_PROCESS_FLOW_ID, {
      expected_revision: before.data.diagram_revision,
      canvas: { nodes, edges },
    } as unknown as UpdateProcessFlow),
  ).rejects.toThrow();
  expect(await getProcessFlow(supabase, E2E_PROCESS_FLOW_ID)).toEqual(before);
});

it.each(['LR', 'RL', 'TB', 'TD', 'BT'])(
  'places new nodes without overlaps or moving saved nodes (%s)',
  async (direction) => {
    await resetLocalAppState();
    const { data: before } = await createProcessFlow(supabase, {
      team_id: E2E_TEAM_ID,
      name: 'Insertion layout regression',
      mermaid_source: `flowchart ${direction}\nA --> B`,
      diagram_metadata: { nodes: { A: { size: { width: 500, height: 300 } } } },
    });
    if (!before) throw new Error('Missing created flow');
    const { data: after } = await updateProcessFlow(supabase, before.id, {
      expected_revision: before.diagram_revision,
      mermaid_source: `${before.mermaid_source}\nX --> A\nY --> A`,
    });
    if (!after) throw new Error('Missing updated flow');
    for (const node of before.nodes) {
      expect(after.nodes.find(({ id }) => id === node.id)).toEqual(node);
    }
    for (let i = 0; i < after.nodes.length; i++) {
      const a = after.nodes[i];
      for (const b of after.nodes.slice(i + 1)) {
        const separated =
          a.position.x + (a.size?.width ?? 240) <= b.position.x ||
          b.position.x + (b.size?.width ?? 240) <= a.position.x ||
          a.position.y + (a.size?.height ?? 120) <= b.position.y ||
          b.position.y + (b.size?.height ?? 120) <= a.position.y;
        expect(separated, `${a.id} overlaps ${b.id}`).toBe(true);
      }
    }
    expect((await getProcessFlow(supabase, before.id)).data).toEqual(after);
  },
);
