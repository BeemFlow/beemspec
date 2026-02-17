import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handleOpenCodeMcpRequest } from '@/integrations/opencode/mcp-server';
import { GET, POST } from './route';

vi.mock('@/integrations/opencode/mcp-server', () => ({
  handleOpenCodeMcpRequest: vi.fn(),
}));

describe('mcp route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.BEEMSPEC_OPENCODE_TOKEN;
    vi.mocked(handleOpenCodeMcpRequest).mockResolvedValue(new Response('{}', { status: 200 }));
  });

  it('allows requests when token is not configured', async () => {
    const response = await GET(new Request('http://localhost/api/mcp', { method: 'GET' }));

    expect(handleOpenCodeMcpRequest).toHaveBeenCalled();
    expect(response.status).toBe(200);
  });

  it('returns 401 when token is configured and missing', async () => {
    process.env.BEEMSPEC_OPENCODE_TOKEN = 'token_123';

    const response = await POST(new Request('http://localhost/api/mcp', { method: 'POST' }));

    expect(handleOpenCodeMcpRequest).not.toHaveBeenCalled();
    expect(response.status).toBe(401);
  });

  it('accepts bearer token when configured', async () => {
    process.env.BEEMSPEC_OPENCODE_TOKEN = 'token_123';

    const response = await POST(
      new Request('http://localhost/api/mcp', {
        method: 'POST',
        headers: { authorization: 'Bearer token_123' },
      }),
    );

    expect(handleOpenCodeMcpRequest).toHaveBeenCalled();
    expect(response.status).toBe(200);
  });
});
