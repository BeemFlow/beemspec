import { randomUUID } from 'node:crypto';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { expect, test } from '@playwright/test';
import { z } from 'zod';
import { resetE2EState } from './helpers';
import {
  createPublicClient,
  E2E_EDGE_REVIEW_ID,
  E2E_NODE_APPROVED_ID,
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

test('serves authenticated MCP tools over the v2 HTTP transport', async ({ baseURL, request }) => {
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
    expect(client.getInstructions()).toContain('processflow_nodes_mutate');

    const { tools } = await client.listTools();
    const toolNames = new Set(tools.map((tool) => tool.name));
    expect(toolNames.has('team_list')).toBe(true);
    expect(toolNames.has('storymap_workflow_guide')).toBe(false);
    expect(toolNames.has('processflow_workflow_guide')).toBe(false);
    expect(toolNames.has('processflow_nodes_mutate')).toBe(true);
    expect(toolNames.has('processflow_edges_mutate')).toBe(true);
    expect(toolNames.has('processflow_autolayout')).toBe(true);
    expect(tools.every((tool) => tool.outputSchema)).toBe(true);

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

    const flowData = z
      .object({
        data: z.object({ nodes: z.array(z.object({ id: z.string(), data: z.looseObject({ label: z.string() }) })) }),
      })
      .parse(processFlow.structuredContent).data;
    const receiveNode = flowData.nodes.find((node) => node.id === E2E_NODE_RECEIVE_ID);
    if (!receiveNode) throw new Error('Seeded receive-invoice node is missing');
    expect(receiveNode.data.owner_role).toBe('Operations');
    const updatedNodeData = { ...receiveNode.data, label: 'Receive and validate invoice' };

    const batchResult = await client.callTool({
      name: 'processflow_nodes_mutate',
      arguments: {
        process_flow_id: E2E_PROCESS_FLOW_ID,
        mutations: [
          {
            action: 'update',
            id: E2E_NODE_RECEIVE_ID,
            payload: { data: updatedNodeData },
          },
        ],
      },
    });
    expect(batchResult.isError).not.toBe(true);
    expect(batchResult.structuredContent).toMatchObject({
      ok: true,
      data: {
        updated: [
          {
            id: E2E_NODE_RECEIVE_ID,
            data: updatedNodeData,
          },
        ],
      },
    });

    await test.step('reject oversized MCP batches without applying changes', async () => {
      for (const [name, id] of [
        ['processflow_nodes_mutate', E2E_NODE_RECEIVE_ID],
        ['processflow_edges_mutate', E2E_EDGE_REVIEW_ID],
      ]) {
        const result = await client.callTool({
          name,
          arguments: {
            process_flow_id: E2E_PROCESS_FLOW_ID,
            mutations: Array.from({ length: 101 }, () => ({ action: 'delete', id })),
          },
        });
        expect(result.isError).toBe(true);
        expect(JSON.stringify(result.content)).toContain('100');
      }
    });

    await test.step('report stale records and roll back earlier batch updates', async () => {
      for (const [name, id, payload] of [
        ['processflow_nodes_mutate', E2E_NODE_RECEIVE_ID, { data: { label: 'Must roll back' } }],
        ['processflow_edges_mutate', E2E_EDGE_REVIEW_ID, { data: { label: 'Must roll back' } }],
      ] as const) {
        const missingId = randomUUID();
        const result = await client.callTool({
          name,
          arguments: {
            process_flow_id: E2E_PROCESS_FLOW_ID,
            mutations: [
              { action: 'update', id, payload },
              { action: 'delete', id: missingId },
            ],
          },
        });
        expect(result.isError).toBe(true);
        expect(result.structuredContent).toMatchObject({
          ok: false,
          details: { code: 'P0001', message: expect.stringContaining(missingId) },
        });
        expect(JSON.stringify(result.structuredContent)).toContain('processflow_get');
        expect(JSON.stringify(result.structuredContent)).toContain('batch was not applied');
      }
    });

    await test.step('explain known edge constraints without exposing database diagnostics', async () => {
      for (const { source, target, code, message } of [
        { source: E2E_NODE_RECEIVE_ID, target: E2E_NODE_RECEIVE_ID, code: '23514', message: 'cannot connect' },
        { source: E2E_NODE_RECEIVE_ID, target: E2E_NODE_APPROVED_ID, code: '23505', message: 'already exists' },
        { source: randomUUID(), target: E2E_NODE_APPROVED_ID, code: '23503', message: 'source node' },
        { source: E2E_NODE_RECEIVE_ID, target: randomUUID(), code: '23503', message: 'target node' },
      ]) {
        const result = await client.callTool({
          name: 'processflow_edges_mutate',
          arguments: {
            process_flow_id: E2E_PROCESS_FLOW_ID,
            mutations: [
              {
                action: 'create',
                payload: { type: 'flow', source_node_id: source, target_node_id: target },
              },
            ],
          },
        });
        expect(result.isError).toBe(true);
        expect(result.structuredContent).toMatchObject({
          ok: false,
          details: { code, message: expect.stringContaining(message) },
        });
        expect(JSON.stringify(result.structuredContent)).not.toMatch(/constraint|process_flow_edges|Key \(/);
      }
    });

    const layoutResult = await client.callTool({
      name: 'processflow_autolayout',
      arguments: { process_flow_id: E2E_PROCESS_FLOW_ID },
    });
    expect(layoutResult.isError).not.toBe(true);
    expect(layoutResult.structuredContent).toMatchObject({
      ok: true,
      data: {
        nodes: expect.arrayContaining([expect.objectContaining({ id: E2E_NODE_RECEIVE_ID, data: updatedNodeData })]),
        edges: [expect.objectContaining({ id: E2E_EDGE_REVIEW_ID, data: { label: 'Review' } })],
      },
    });
  } finally {
    await client.close();
    const { error: signOutError } = await supabase.auth.signOut();
    expect(signOutError).toBeNull();
  }
});
