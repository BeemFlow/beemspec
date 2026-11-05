import { expect, test } from '@playwright/test';
import { z } from 'zod';
import { loginAsOwner, resetE2EState } from './helpers';
import { E2E_PROCESS_FLOW_ID, E2E_STORY_MAP_ID } from './local-fixtures';

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

test('REST saves a large flow atomically and rejects a stale revision', async ({ page }) => {
  const url = `/api/process-flows/${E2E_PROCESS_FLOW_ID}`;
  const existing = await (await page.request.get(url)).json();
  const mermaid_source = [
    'flowchart LR',
    ...Array.from({ length: 101 }, (_, index) => `n_${index}["Bulk step ${index}"]`),
  ].join('\n');
  const saved = await page.request.put(url, { data: { expected_revision: existing.diagram_revision, mermaid_source } });
  expect(saved.ok()).toBe(true);
  const updated = await saved.json();
  expect(updated.nodes).toHaveLength(101);

  const stale = await page.request.put(url, {
    data: { expected_revision: existing.diagram_revision, mermaid_source: 'flowchart LR' },
  });
  expect(stale.status()).toBe(409);
  const invalid = await page.request.put(url, {
    data: { expected_revision: updated.diagram_revision, mermaid_source: 'flowchart LR\nA --> A' },
  });
  expect(invalid.status()).toBe(400);
  const current = await (await page.request.get(url)).json();
  expect(current).toMatchObject({ diagram_revision: updated.diagram_revision, mermaid_source: updated.mermaid_source });
});

test('rejects malformed canvas metadata and unsupported Mermaid without changing the saved flow', async ({ page }) => {
  const url = `/api/process-flows/${E2E_PROCESS_FLOW_ID}`;
  const before = await (await page.request.get(url)).json();
  for (const patch of [
    {
      canvas: {
        nodes: before.nodes.map((node: { data: object }) => ({ ...node, data: { ...node.data, owner_role: 42 } })),
        edges: before.edges,
      },
    },
    {
      canvas: {
        nodes: before.nodes,
        edges: before.edges.map((edge: { data: object }) => ({ ...edge, data: { ...edge.data, condition: 42 } })),
      },
    },
    { mermaid_source: 'flowchart LR\nA e@--> B\ne@{ animate: true }' },
    { mermaid_source: 'flowchart LR\nA e@--> B\ne@{ animation: fast }' },
  ]) {
    const response = await page.request.put(url, { data: { expected_revision: before.diagram_revision, ...patch } });
    expect(response.status()).toBe(400);
    expect(await (await page.request.get(url)).json()).toEqual(before);
  }
  await page.goto(`/process-flows/${E2E_PROCESS_FLOW_ID}`);
  await expect(page.getByTestId('processflow-node-step').filter({ hasText: 'Receive invoice' })).toBeVisible();
});
