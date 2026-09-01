import { beforeEach, describe, expect, it, vi } from 'vitest';
import { authenticateMcpRequest } from '@/integrations/mcp/auth';
import { mcpHandler } from '@/integrations/mcp/server';
import { GET, OPTIONS, POST } from './route';

const authInfo = {
  token: 'user-token',
  clientId: 'user-1',
  scopes: [],
  expiresAt: Math.floor(Date.now() / 1000) + 3600,
};

vi.mock('@/integrations/mcp/auth', () => ({
  authenticateMcpRequest: vi.fn(),
}));

vi.mock('@/integrations/mcp/server', () => ({
  mcpHandler: { fetch: vi.fn() },
}));

describe('mcp route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(authenticateMcpRequest).mockResolvedValue(authInfo);
    vi.mocked(mcpHandler.fetch).mockResolvedValue(new Response('{}', { status: 200 }));
  });

  it('allows requests when bearer auth succeeds', async () => {
    const response = await GET(new Request('http://localhost/api/mcp', { method: 'GET' }));

    expect(mcpHandler.fetch).toHaveBeenCalled();
    expect(response.status).toBe(200);
  });

  it('returns 401 when auth fails', async () => {
    vi.mocked(authenticateMcpRequest).mockResolvedValue(new Response('{"error":"invalid_token"}', { status: 401 }));

    const response = await POST(new Request('http://localhost/api/mcp', { method: 'POST' }));

    expect(mcpHandler.fetch).not.toHaveBeenCalled();
    expect(response.status).toBe(401);
  });

  it('passes authenticated info into the MCP handler', async () => {
    const response = await POST(
      new Request('http://localhost/api/mcp', {
        method: 'POST',
        headers: { authorization: 'Bearer user-token' },
      }),
    );

    expect(authenticateMcpRequest).toHaveBeenCalled();
    expect(mcpHandler.fetch).toHaveBeenCalledWith(expect.any(Request), { authInfo });
    expect(response.status).toBe(200);
  });

  it('allows Claude web origin and returns CORS headers', async () => {
    const response = await POST(
      new Request('https://beemspec.com/api/mcp', {
        method: 'POST',
        headers: {
          origin: 'https://claude.ai',
          authorization: 'Bearer user-token',
        },
      }),
    );

    expect(authenticateMcpRequest).toHaveBeenCalled();
    expect(mcpHandler.fetch).toHaveBeenCalled();
    expect(response.status).toBe(200);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('https://claude.ai');
    expect(response.headers.get('Access-Control-Allow-Methods')).toContain('POST');
    expect(response.headers.get('Vary')).toContain('Origin');
  });

  it('returns CORS headers for allowed preflight requests', async () => {
    const response = await OPTIONS(
      new Request('https://beemspec.com/api/mcp', {
        method: 'OPTIONS',
        headers: {
          origin: 'https://claude.ai',
        },
      }),
    );

    expect(response.status).toBe(204);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('https://claude.ai');
    expect(response.headers.get('Access-Control-Allow-Headers')).toContain('Authorization');
  });

  it('rejects requests from untrusted origin header', async () => {
    const response = await POST(
      new Request('http://localhost/api/mcp', {
        method: 'POST',
        headers: {
          origin: 'https://evil.example.com',
        },
      }),
    );

    expect(authenticateMcpRequest).not.toHaveBeenCalled();
    expect(mcpHandler.fetch).not.toHaveBeenCalled();
    expect(response.status).toBe(403);
  });
});
