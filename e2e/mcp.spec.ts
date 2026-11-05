import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import {
  CLIENT_CAPABILITIES_META_KEY,
  CLIENT_INFO_META_KEY,
  DEFAULT_MAX_REQUEST_BODY_SIZE,
  PROTOCOL_VERSION_META_KEY,
  ProtocolErrorCode,
} from '@modelcontextprotocol/server';
import { expect, test } from '@playwright/test';
import { z } from 'zod';
import { loginAsOwner, resetE2EState } from './helpers';
import {
  createPublicClient,
  E2E_NODE_RECEIVE_ID,
  E2E_OWNER_EMAIL,
  E2E_OWNER_PASSWORD,
  E2E_PROCESS_FLOW_ID,
  E2E_STORY_MAP_ID,
  E2E_TEAM_ID,
} from './local-fixtures';

test.beforeEach(async () => {
  await resetE2EState();
});

test('serves authenticated MCP tools over the v2 HTTP transport', async ({ baseURL, request, page }) => {
  if (!baseURL) throw new Error('Playwright baseURL is required for the MCP end-to-end test');

  const unauthorizedResponse = await request.post('/api/mcp', {
    headers: {
      accept: 'application/json, text/event-stream',
      'content-type': 'application/json',
    },
    data: {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-03-26',
        capabilities: {},
        clientInfo: { name: 'beemspec-e2e-unauthenticated', version: '1.0.0' },
      },
    },
  });

  expect(unauthorizedResponse.status()).toBe(401);
  expect(unauthorizedResponse.headers()['www-authenticate']).toContain('Bearer');

  const supabase = createPublicClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: E2E_OWNER_EMAIL,
    password: E2E_OWNER_PASSWORD,
  });

  expect(error).toBeNull();
  expect(data.session?.access_token).toBeTruthy();

  const client = new Client({ name: 'beemspec-e2e', version: '1.0.0' }, { versionNegotiation: { mode: 'auto' } });
  const transport = new StreamableHTTPClientTransport(new URL('/api/mcp', baseURL), {
    authProvider: { token: async () => data.session?.access_token },
  });

  try {
    await client.connect(transport);

    expect(client.getServerVersion()).toMatchObject({ name: 'beemspec' });
    expect(client.getNegotiatedProtocolVersion()).toBe('2026-07-28');
    expect(client.getInstructions()).toContain('expected_revision');

    const { tools } = await client.listTools();
    const toolNames = new Set(tools.map((tool) => tool.name));
    expect(toolNames.has('team_list')).toBe(true);
    expect(toolNames.has('storymap_workflow_guide')).toBe(false);
    expect(toolNames.has('processflow_workflow_guide')).toBe(false);
    expect([...toolNames].filter((name) => name.startsWith('processflow_')).sort()).toEqual([
      'processflow_create',
      'processflow_delete',
      'processflow_get',
      'processflow_list',
      'processflow_update',
    ]);
    expect(tools.every((tool) => tool.outputSchema)).toBe(true);

    await test.step('reject invalid HTTP requests before applying mutations', async () => {
      const headers = {
        authorization: `Bearer ${data.session?.access_token}`,
        accept: 'application/json, text/event-stream',
        'content-type': 'application/json',
        origin: 'https://claude.ai',
      };
      const deletion = {
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: {
          name: 'processflow_delete',
          arguments: { process_flow_id: E2E_PROCESS_FLOW_ID },
        },
      };
      const envelope = {
        [PROTOCOL_VERSION_META_KEY]: '2026-07-28',
        [CLIENT_INFO_META_KEY]: { name: 'beemspec-e2e', version: '1.0.0' },
        [CLIENT_CAPABILITIES_META_KEY]: {},
      };
      const modernHeaders = { ...headers, 'Mcp-Method': deletion.method, 'Mcp-Name': deletion.params.name };
      const missingHeader = await request.post('/api/mcp', {
        headers: modernHeaders,
        data: { ...deletion, params: { ...deletion.params, _meta: envelope } },
      });
      expect(missingHeader.status()).toBe(400);
      expect(await missingHeader.json()).toMatchObject({ id: 1, error: { code: -32020 } });
      expect(missingHeader.headers()['access-control-allow-origin']).toBe('https://claude.ai');

      const oversized = await request.post('/api/mcp', {
        headers: { ...modernHeaders, 'MCP-Protocol-Version': '2026-07-28' },
        data: {
          ...deletion,
          params: { ...deletion.params, _meta: { ...envelope, padding: 'x'.repeat(DEFAULT_MAX_REQUEST_BODY_SIZE) } },
        },
      });
      expect(oversized.status()).toBe(413);
      expect(oversized.headers()['access-control-allow-origin']).toBe('https://claude.ai');

      const batch = await request.post('/api/mcp', {
        headers,
        data: Array.from({ length: 101 }, (_, id) => ({ ...deletion, id })),
      });
      expect(batch.status()).toBe(400);
      expect(await batch.json()).toMatchObject({ error: { code: ProtocolErrorCode.InvalidRequest } });
    });

    const teamList = await client.callTool({ name: 'team_list', arguments: {} });
    expect(teamList.isError).not.toBe(true);
    expect(teamList.structuredContent).toMatchObject({
      ok: true,
      data: expect.arrayContaining([
        {
          team_id: E2E_TEAM_ID,
          name: 'E2E Team',
          role: 'owner',
        },
      ]),
    });

    const storyMap = await client.callTool({
      name: 'storymap_get',
      arguments: { story_map_id: E2E_STORY_MAP_ID },
    });
    expect(storyMap.isError).not.toBe(true);
    expect(storyMap.structuredContent).toMatchObject({
      ok: true,
      data: { id: E2E_STORY_MAP_ID },
    });

    const processFlow = await client.callTool({
      name: 'processflow_get',
      arguments: { process_flow_id: E2E_PROCESS_FLOW_ID },
    });
    expect(processFlow.isError).not.toBe(true);
    expect(processFlow.structuredContent).toMatchObject({
      ok: true,
      data: { id: E2E_PROCESS_FLOW_ID },
    });

    const flowReadSchema = z.object({ data: z.object({ mermaid_source: z.string(), diagram_revision: z.number() }) });
    const read = async () =>
      flowReadSchema.parse(
        (
          await client.callTool({
            name: 'processflow_get',
            arguments: { process_flow_id: E2E_PROCESS_FLOW_ID },
          })
        ).structuredContent,
      ).data;
    const before = flowReadSchema.parse(processFlow.structuredContent).data;

    await test.step('save a canvas edit, read it through MCP, then update the same document', async () => {
      await loginAsOwner(page);
      await page.goto(`/process-flows/${E2E_PROCESS_FLOW_ID}`);
      await page.getByTestId('processflow-node-step').filter({ hasText: 'Receive invoice' }).click();
      await page.getByLabel('Label').fill('Receive and validate invoice');
      await page.getByLabel('Frequency').fill('Daily');
      const [canvasSave] = await Promise.all([
        page.waitForResponse(
          (response) =>
            response.request().method() === 'PUT' &&
            response.url().endsWith(`/api/process-flows/${E2E_PROCESS_FLOW_ID}`),
        ),
        page.getByRole('button', { name: 'Save Node' }).click(),
      ]);
      expect(canvasSave.ok()).toBe(true);

      const canvasVersion = await read();
      expect(canvasVersion.mermaid_source).toContain('Receive and validate invoice');
      const stale = await client.callTool({
        name: 'processflow_update',
        arguments: {
          process_flow_id: E2E_PROCESS_FLOW_ID,
          expected_revision: before.diagram_revision,
          mermaid_source: before.mermaid_source,
        },
      });
      expect(stale.isError).toBe(true);
      expect(stale.structuredContent).toMatchObject({ details: { code: 'revision_conflict' } });

      const saved = await client.callTool({
        name: 'processflow_update',
        arguments: {
          process_flow_id: E2E_PROCESS_FLOW_ID,
          expected_revision: canvasVersion.diagram_revision,
          mermaid_source: `${canvasVersion.mermaid_source}\n  archive["Archive invoice"]\n  ${E2E_NODE_RECEIVE_ID} --> archive`,
        },
      });
      expect(saved.isError).not.toBe(true);
      expect(saved.structuredContent).toMatchObject({
        data: {
          diagram_metadata: {
            nodes: { [E2E_NODE_RECEIVE_ID]: { data: { owner_role: 'Operations', frequency: 'Daily' } } },
          },
        },
      });
      await page.reload();
      await expect(page.getByTestId('processflow-node-step').filter({ hasText: 'Archive invoice' })).toBeVisible();
      await page.getByTestId('processflow-node-step').filter({ hasText: 'Receive and validate invoice' }).click();
      await expect(page.getByLabel('Frequency')).toHaveValue('Daily');
    });

    const created = await client.callTool({
      name: 'processflow_create',
      arguments: {
        team_id: E2E_TEAM_ID,
        name: 'Agent-created flow',
        mermaid_source: 'flowchart LR\nintake["Receive request"] --> approve{"Approved?"}',
      },
    });
    expect(created.isError).not.toBe(true);
    expect(created.structuredContent).toMatchObject({
      data: {
        mermaid_source: expect.stringContaining('Receive request'),
        diagram_revision: 1,
        validation: expect.any(Object),
      },
    });
    await test.step('insert a preceding step through MCP without overlapping saved nodes', async () => {
      const placementSchema = z.object({
        data: z.object({
          id: z.string(),
          mermaid_source: z.string(),
          diagram_revision: z.number(),
          diagram_metadata: z.object({
            nodes: z.record(
              z.string(),
              z.object({
                position: z.object({ x: z.number(), y: z.number() }),
              }),
            ),
          }),
        }),
      });
      const before = placementSchema.parse(created.structuredContent).data;
      const inserted = await client.callTool({
        name: 'processflow_update',
        arguments: {
          process_flow_id: before.id,
          expected_revision: before.diagram_revision,
          mermaid_source: `${before.mermaid_source}\nstart["New first step"] --> intake`,
        },
      });
      expect(inserted.isError).not.toBe(true);
      const after = placementSchema.parse(inserted.structuredContent).data;
      const start = after.diagram_metadata.nodes.start.position;
      for (const [id, node] of Object.entries(before.diagram_metadata.nodes)) {
        expect(after.diagram_metadata.nodes[id].position).toEqual(node.position);
        const width = id === 'approve' ? 220 : 240;
        expect(
          start.x + 240 <= node.position.x ||
            node.position.x + width <= start.x ||
            start.y + 120 <= node.position.y ||
            node.position.y + 120 <= start.y,
        ).toBe(true);
      }
      await page.goto(`/process-flows/${before.id}`);
      await expect(page.getByTestId('processflow-node-step').filter({ hasText: 'New first step' })).toBeVisible();
      await expect(page.getByTestId('processflow-node-step').filter({ hasText: 'Receive request' })).toBeVisible();
    });
  } finally {
    await client.close();
    const { error: signOutError } = await supabase.auth.signOut();
    expect(signOutError).toBeNull();
  }
});
