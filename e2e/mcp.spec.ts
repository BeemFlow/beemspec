import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { expect, test } from '@playwright/test';
import { resetE2EState } from './helpers';
import { createPublicClient, E2E_OWNER_EMAIL, E2E_OWNER_PASSWORD, E2E_TEAM_ID } from './local-fixtures';

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

    const { tools } = await client.listTools();
    expect(tools).toEqual(expect.arrayContaining([expect.objectContaining({ name: 'team_list' })]));

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
  } finally {
    await client.close();
    const { error: signOutError } = await supabase.auth.signOut();
    expect(signOutError).toBeNull();
  }
});
