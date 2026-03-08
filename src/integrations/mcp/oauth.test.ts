import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  consumeAuthorizationCode,
  isAllowedMcpRedirectUri,
  isSameMcpResourceUri,
  issueAuthorizationCode,
  normalizeMcpResourceUri,
  verifyPkceS256,
} from './oauth';

describe('mcp oauth helpers', () => {
  beforeEach(() => {
    process.env.BEEMSPEC_MCP_OAUTH_SECRET = 'test-secret-for-mcp-oauth';
  });

  it('allows only https or loopback http redirect uris', () => {
    expect(isAllowedMcpRedirectUri('https://example.com/callback')).toBe(true);
    expect(isAllowedMcpRedirectUri('http://127.0.0.1:3000/callback')).toBe(true);
    expect(isAllowedMcpRedirectUri('http://localhost:3000/callback')).toBe(true);
    expect(isAllowedMcpRedirectUri('http://example.com/callback')).toBe(false);
    expect(isAllowedMcpRedirectUri('not-a-uri')).toBe(false);
  });

  it('normalizes resource uris for loopback + trailing slash differences', () => {
    const a = normalizeMcpResourceUri('http://localhost:3000/api/mcp/');
    const b = normalizeMcpResourceUri('http://127.0.0.1:3000/api/mcp');

    expect(a).not.toBeNull();
    expect(b).not.toBeNull();
    expect(isSameMcpResourceUri('http://localhost:3000/api/mcp/', 'http://127.0.0.1:3000/api/mcp')).toBe(true);
  });

  it('marks authorization code as consumed after first use', async () => {
    const codeVerifier = 'abc123-super-secret';
    const challenge = createHash('sha256').update(codeVerifier).digest('base64url');

    const code = await issueAuthorizationCode({
      clientId: 'bsmcp_test',
      redirectUri: 'http://127.0.0.1:3000/callback',
      codeChallenge: challenge,
      userId: 'user-1',
      refreshToken: 'refresh-token-1',
      resource: 'http://127.0.0.1:3000/api/mcp',
    });

    const first = await consumeAuthorizationCode(code);
    const second = await consumeAuthorizationCode(code);

    expect(first).not.toBeNull();
    expect(second).toBeNull();
  });

  it('verifies pkce s256 challenge', () => {
    const verifier = 'super-verifier-value';
    const challenge = createHash('sha256').update(verifier).digest('base64url');
    expect(verifyPkceS256(verifier, challenge)).toBe(true);
    expect(verifyPkceS256('wrong', challenge)).toBe(false);
  });
});
