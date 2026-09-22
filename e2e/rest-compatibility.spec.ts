import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { z } from 'zod';
import { loginAsOwner, resetE2EState } from './helpers';
import { E2E_NODE_RECEIVE_ID, E2E_PROCESS_FLOW_ID, E2E_STORY_MAP_ID } from './local-fixtures';

test.beforeEach(async ({ page }) => {
  await resetE2EState();
  await loginAsOwner(page);
});

test('REST title edits retain existing long story content', async ({ page }) => {
  const response = await page.request.get(`/api/story-maps/${E2E_STORY_MAP_ID}`);
  expect(response.ok()).toBe(true);
  const map = z
    .object({
      activities: z.array(
        z.object({
          tasks: z.array(
            z.object({
              stories: z.array(z.object({ id: z.string(), content: z.record(z.string(), z.unknown()) })),
            }),
          ),
        }),
      ),
    })
    .parse(await response.json());
  const story = map.activities[0].tasks[0].stories[0];
  const content = { ...story.content, technical_guidelines: 'g'.repeat(20_001) };

  const contentResponse = await page.request.put(`/api/stories/${story.id}`, { data: { content } });
  expect(contentResponse.ok()).toBe(true);

  // The editor submits the entire content object even when only the title changed.
  const titleResponse = await page.request.put(`/api/stories/${story.id}`, {
    data: { title: 'Updated title with retained guidance', content },
  });
  expect(titleResponse.ok()).toBe(true);
  const persisted = await page.request.get(`/api/stories/${story.id}`);
  expect(persisted.ok()).toBe(true);
  expect(await persisted.json()).toMatchObject({ title: 'Updated title with retained guidance', content });

  const contextMarkdown = 'c'.repeat(100_001);
  const mapResponse = await page.request.put(`/api/story-maps/${E2E_STORY_MAP_ID}`, {
    data: { context_markdown: contextMarkdown },
  });
  expect(mapResponse.ok()).toBe(true);
  expect(await mapResponse.json()).toMatchObject({ context_markdown: contextMarkdown });
});

test('REST bulk deletion supports over 100 items and retains atomic rollback', async ({ page }) => {
  const nodesResponse = await page.request.put(`/api/process-flows/${E2E_PROCESS_FLOW_ID}/nodes`, {
    data: {
      mutations: Array.from({ length: 101 }, (_, index) => ({
        action: 'create',
        payload: {
          type: 'step',
          position: { x: index * 10, y: 0 },
          data: {
            label: `Bulk node ${index}`,
            ...(index === 0 ? { notes: 'n'.repeat(20_001), systems: Array(201).fill('s'.repeat(2_001)) } : {}),
          },
        },
      })),
    },
  });
  expect(nodesResponse.ok()).toBe(true);
  const createdRows = z.object({ created: z.array(z.object({ id: z.string() })) });
  const nodes = createdRows.parse(await nodesResponse.json()).created;
  expect(nodes).toHaveLength(101);

  const edgesResponse = await page.request.put(`/api/process-flows/${E2E_PROCESS_FLOW_ID}/edges`, {
    data: {
      mutations: nodes.map((node) => ({
        action: 'create',
        payload: { type: 'flow', source_node_id: E2E_NODE_RECEIVE_ID, target_node_id: node.id },
      })),
    },
  });
  expect(edgesResponse.ok()).toBe(true);
  const edges = createdRows.parse(await edgesResponse.json()).created;
  expect(edges).toHaveLength(101);

  // A stale last ID must roll back all preceding deletions, for both kinds of batch.
  for (const [entity, rows] of [
    ['edges', edges],
    ['nodes', nodes],
  ] as const) {
    const failed = await page.request.put(`/api/process-flows/${E2E_PROCESS_FLOW_ID}/${entity}`, {
      data: {
        mutations: [...rows.slice(0, 100), { id: randomUUID() }].map(({ id }) => ({ action: 'delete', id })),
      },
    });
    expect(failed.status()).toBe(500);

    const flowResponse = await page.request.get(`/api/process-flows/${E2E_PROCESS_FLOW_ID}`);
    expect(flowResponse.ok()).toBe(true);
    const flow = z
      .object({ nodes: z.array(z.object({ id: z.string() })), edges: z.array(z.object({ id: z.string() })) })
      .parse(await flowResponse.json());
    expect(flow[entity].map(({ id }) => id)).toEqual(expect.arrayContaining(rows.map(({ id }) => id)));
  }

  for (const [entity, rows] of [
    ['edges', edges],
    ['nodes', nodes],
  ] as const) {
    const deleted = await page.request.put(`/api/process-flows/${E2E_PROCESS_FLOW_ID}/${entity}`, {
      data: { mutations: rows.map(({ id }) => ({ action: 'delete', id })) },
    });
    expect(deleted.ok()).toBe(true);
    expect(z.object({ deleted: z.array(z.unknown()) }).parse(await deleted.json()).deleted).toHaveLength(101);
  }

  const remainingResponse = await page.request.get(`/api/process-flows/${E2E_PROCESS_FLOW_ID}`);
  expect(remainingResponse.ok()).toBe(true);
  const remaining = z
    .object({ nodes: z.array(z.unknown()), edges: z.array(z.unknown()) })
    .parse(await remainingResponse.json());
  expect(remaining.nodes).toHaveLength(2);
  expect(remaining.edges).toHaveLength(1);
});
