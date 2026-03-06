import { beforeEach, describe, expect, it, vi } from 'vitest';
import { authenticateMcpRequest } from '@/integrations/mcp/auth';
import { handleMcpRequest } from '@/integrations/mcp/server';
import { GET, POST } from './route';

const mockSupabase = {} as never;

vi.mock('@/integrations/mcp/auth', () => ({
  authenticateMcpRequest: vi.fn(),
}));

vi.mock('@/integrations/mcp/server', () => ({
  handleMcpRequest: vi.fn(),
}));

describe('mcp route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(authenticateMcpRequest).mockResolvedValue({
      ok: true,
      user: { id: 'user-1', email: 'user@example.com' },
      supabase: mockSupabase,
    });
    vi.mocked(handleMcpRequest).mockResolvedValue(new Response('{}', { status: 200 }));
  });

  it('allows requests when bearer auth succeeds', async () => {
    const response = await GET(new Request('http://localhost/api/mcp', { method: 'GET' }));

    expect(handleMcpRequest).toHaveBeenCalled();
    expect(response.status).toBe(200);
  });

  it('returns 401 when auth fails', async () => {
    vi.mocked(authenticateMcpRequest).mockResolvedValue({
      ok: false,
      response: new Response('{"error":"Unauthorized"}', { status: 401 }),
    });

    const response = await POST(new Request('http://localhost/api/mcp', { method: 'POST' }));

    expect(handleMcpRequest).not.toHaveBeenCalled();
    expect(response.status).toBe(401);
  });

  it('passes authenticated supabase client into MCP handler', async () => {
    const response = await POST(
      new Request('http://localhost/api/mcp', {
        method: 'POST',
        headers: { authorization: 'Bearer user-token' },
      }),
    );

    expect(authenticateMcpRequest).toHaveBeenCalled();
    expect(handleMcpRequest).toHaveBeenCalledWith(expect.any(Request), mockSupabase, {
      id: 'user-1',
      email: 'user@example.com',
    });
    expect(response.status).toBe(200);
  });
});
