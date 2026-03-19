import { afterEach, describe, expect, it } from 'vitest';
import { applyMcpCorsHeaders, getAllowedMcpRequestOrigin, isTrustedRequestOrigin } from './origin';

describe('mcp origin', () => {
  afterEach(() => {
    delete process.env.MCP_ALLOWED_ORIGINS;
  });

  it('allows same-origin browser requests', () => {
    const request = new Request('https://beemspec.com/api/mcp', {
      headers: {
        origin: 'https://beemspec.com',
      },
    });

    expect(isTrustedRequestOrigin(request)).toBe(true);
    expect(getAllowedMcpRequestOrigin(request)).toBe('https://beemspec.com');
  });

  it('allows Claude web by default', () => {
    const request = new Request('https://beemspec.com/api/mcp', {
      headers: {
        origin: 'https://claude.ai',
      },
    });

    expect(isTrustedRequestOrigin(request)).toBe(true);
    expect(getAllowedMcpRequestOrigin(request)).toBe('https://claude.ai');
  });

  it('allows extra configured origins', () => {
    process.env.MCP_ALLOWED_ORIGINS = 'https://example-client.com, https://app.example.com';

    const request = new Request('https://beemspec.com/api/mcp', {
      headers: {
        origin: 'https://app.example.com',
      },
    });

    expect(isTrustedRequestOrigin(request)).toBe(true);
    expect(getAllowedMcpRequestOrigin(request)).toBe('https://app.example.com');
  });

  it('rejects unknown cross-origin browser requests', () => {
    const request = new Request('https://beemspec.com/api/mcp', {
      headers: {
        origin: 'https://evil.example.com',
      },
    });

    expect(isTrustedRequestOrigin(request)).toBe(false);
    expect(getAllowedMcpRequestOrigin(request)).toBe(null);
  });

  it('adds CORS headers for allowed browser origins', () => {
    const request = new Request('https://beemspec.com/api/mcp', {
      headers: {
        origin: 'https://claude.ai',
      },
    });
    const response = applyMcpCorsHeaders(new Response(null, { status: 204 }), request);

    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('https://claude.ai');
    expect(response.headers.get('Access-Control-Allow-Headers')).toContain('Authorization');
    expect(response.headers.get('Vary')).toContain('Origin');
  });
});
