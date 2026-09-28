import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import {
  CLIENT_CAPABILITIES_META_KEY,
  CLIENT_INFO_META_KEY,
  DEFAULT_MAX_REQUEST_BODY_SIZE,
  PROTOCOL_VERSION_META_KEY,
  ProtocolErrorCode,
} from '@modelcontextprotocol/server';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { mcpHandler } from '@/integrations/mcp/server';
import { POST } from './route';

const { supabase } = vi.hoisted(() => ({
  supabase: { auth: { getClaims: vi.fn() }, from: vi.fn(), rpc: vi.fn() },
}));

vi.mock('@/lib/supabase/token', () => ({ createClientForAccessToken: () => supabase }));

const endpoint = 'http://localhost/api/mcp';
const modernEnvelope = {
  [PROTOCOL_VERSION_META_KEY]: '2026-07-28',
  [CLIENT_INFO_META_KEY]: { name: 'mcp-http-test', version: '1.0.0' },
  [CLIENT_CAPABILITIES_META_KEY]: {},
};

function deletion(era: 'modern' | 'legacy') {
  return {
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/call',
    params: {
      name: 'story_delete',
      arguments: { story_id: '10000000-0000-4000-8000-000000000004' },
      _meta: era === 'modern' ? modernEnvelope : {},
    },
  };
}

function post(body: unknown, era: 'modern' | 'legacy' = 'legacy') {
  const headers = new Headers({
    authorization: 'Bearer test-token',
    'content-type': 'application/json',
    accept: 'application/json, text/event-stream',
  });
  if (era === 'modern') {
    headers.set('MCP-Protocol-Version', '2026-07-28');
    headers.set('Mcp-Method', 'tools/call');
    headers.set('Mcp-Name', 'story_delete');
  }
  return new Request(endpoint, { method: 'POST', headers, body: JSON.stringify(body) });
}

describe('MCP HTTP transport guards', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    supabase.auth.getClaims.mockResolvedValue({
      data: { claims: { sub: 'user-1', email: 'owner@example.com', exp: Math.floor(Date.now() / 1000) + 3600 } },
      error: null,
    });
  });

  afterAll(() => mcpHandler.close());

  it.each(['modern', 'legacy'] as const)('still serves an authenticated %s SDK client', async (era) => {
    const client = new Client(
      { name: 'mcp-http-test', version: '1.0.0' },
      { versionNegotiation: { mode: era === 'modern' ? 'auto' : 'legacy' } },
    );
    try {
      await client.connect(
        new StreamableHTTPClientTransport(new URL(endpoint), {
          authProvider: { token: async () => 'test-token' },
          fetch: (url, init) => POST(new Request(url, init)),
        }),
      );
      expect(client.getProtocolEra()).toBe(era);
      expect((await client.listTools()).tools.some((tool) => tool.name === 'story_delete')).toBe(true);
    } finally {
      await client.close();
    }
  });

  it.each(['modern', 'legacy'] as const)('bounds the actual %s body before executing a tool', async (era) => {
    const body = deletion(era);
    const request = post(
      {
        ...body,
        params: { ...body.params, _meta: { ...body.params._meta, padding: 'x'.repeat(DEFAULT_MAX_REQUEST_BODY_SIZE) } },
      },
      era,
    );
    // No declared length: this exercises the SDK's bounded stream reader.
    expect(request.headers.has('content-length')).toBe(false);
    const response = await POST(request);
    expect(response.status).toBe(413);
    expect(supabase.auth.getClaims).toHaveBeenCalled();
    expect(supabase.from).not.toHaveBeenCalled();
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it.each(['MCP-Protocol-Version', 'Mcp-Method', 'Mcp-Name'])(
    'rejects a missing modern %s header before mutation',
    async (header) => {
      const request = post(deletion('modern'), 'modern');
      request.headers.delete(header);
      const response = await POST(request);
      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toMatchObject({
        id: 1,
        error: { code: -32020 },
      });
      expect(supabase.from).not.toHaveBeenCalled();
      expect(supabase.rpc).not.toHaveBeenCalled();
    },
  );

  it('rejects an oversized JSON-RPC batch without dispatching any mutation', async () => {
    const response = await POST(post(Array.from({ length: 101 }, (_, id) => ({ ...deletion('legacy'), id }))));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: { code: ProtocolErrorCode.InvalidRequest } });
    expect(supabase.from).not.toHaveBeenCalled();
    expect(supabase.rpc).not.toHaveBeenCalled();
  });
});
