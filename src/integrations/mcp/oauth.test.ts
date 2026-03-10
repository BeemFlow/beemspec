import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  consumeAuthorizationCode,
  isAllowedMcpRedirectUri,
  isSameMcpResourceUri,
  issueAuthorizationCode,
  issueAuthorizeConsentToken,
  normalizeMcpResourceUri,
  registerMcpOAuthClient,
  validateRegisteredClient,
  verifyAuthorizeConsentToken,
  verifyPkceS256,
} from './oauth';

describe('mcp oauth helpers', () => {
  beforeEach(() => {
    process.env.BEEMSPEC_MCP_OAUTH_SECRET = 'test-secret-for-mcp-oauth';
  });

  it('allows only loopback http redirect uris', () => {
    expect(isAllowedMcpRedirectUri('https://example.com/callback')).toBe(false);
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

  it('issues and verifies consent tokens', async () => {
    const token = await issueAuthorizeConsentToken({
      clientId: 'bsmcp_client',
      redirectUri: 'https://example.com/callback',
      codeChallenge: 'challenge',
      codeChallengeMethod: 'S256',
      state: 'state-1',
      scope: 'read',
      resource: 'https://beemspec.com/api/mcp',
      userId: 'user-1',
    });

    await expect(
      verifyAuthorizeConsentToken(token, {
        clientId: 'bsmcp_client',
        redirectUri: 'https://example.com/callback',
        codeChallenge: 'challenge',
        codeChallengeMethod: 'S256',
        state: 'state-1',
        scope: 'read',
        resource: 'https://beemspec.com/api/mcp',
        userId: 'user-1',
      }),
    ).resolves.toBe(true);

    await expect(
      verifyAuthorizeConsentToken(token, {
        clientId: 'bsmcp_client',
        redirectUri: 'https://example.com/callback',
        codeChallenge: 'challenge',
        codeChallengeMethod: 'S256',
        state: 'state-1',
        scope: 'write',
        resource: 'https://beemspec.com/api/mcp',
        userId: 'user-1',
      }),
    ).resolves.toBe(false);
  });

  it('rejects expired consent tokens', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));

    const token = await issueAuthorizeConsentToken({
      clientId: 'bsmcp_client',
      redirectUri: 'https://example.com/callback',
      codeChallenge: 'challenge',
      codeChallengeMethod: 'S256',
      state: 'state-1',
      scope: 'read',
      resource: 'https://beemspec.com/api/mcp',
      userId: 'user-1',
    });

    vi.setSystemTime(new Date('2026-01-01T00:11:00.000Z'));

    await expect(
      verifyAuthorizeConsentToken(token, {
        clientId: 'bsmcp_client',
        redirectUri: 'https://example.com/callback',
        codeChallenge: 'challenge',
        codeChallengeMethod: 'S256',
        state: 'state-1',
        scope: 'read',
        resource: 'https://beemspec.com/api/mcp',
        userId: 'user-1',
      }),
    ).resolves.toBe(false);

    vi.useRealTimers();
  });

  it('rejects registered clients with non-loopback redirect uris', async () => {
    const registered = await registerMcpOAuthClient({
      redirect_uris: ['https://example.com/callback'],
      client_name: 'web-client',
    });

    await expect(validateRegisteredClient(registered.client_id, 'https://example.com/callback')).resolves.toEqual({
      valid: false,
      reason: 'redirect_uri_not_allowed',
    });
  });
});
