import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { env } from '@/lib/env';

interface RegisteredClientPayload {
  redirect_uris: string[];
  client_name?: string;
  issued_at: number;
}

function normalizeRedirectUri(uri: string): string | null {
  try {
    const parsed = new URL(uri);
    parsed.hash = '';

    const isLoopback = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';
    if (isLoopback) {
      parsed.hostname = '127.0.0.1';
    }

    if (
      (parsed.protocol === 'http:' && parsed.port === '80') ||
      (parsed.protocol === 'https:' && parsed.port === '443')
    ) {
      parsed.port = '';
    }

    if (parsed.pathname.length > 1) {
      parsed.pathname = parsed.pathname.replace(/\/+$/, '');
    }

    return parsed.toString();
  } catch {
    return null;
  }
}

function redirectUriMatches(allowed: string[], requested: string): boolean {
  if (allowed.includes(requested)) return true;

  const normalizedRequested = normalizeRedirectUri(requested);
  if (!normalizedRequested) return false;

  return allowed.some((uri) => {
    const normalizedAllowed = normalizeRedirectUri(uri);
    return normalizedAllowed !== null && normalizedAllowed === normalizedRequested;
  });
}

interface AuthorizationCodePayload {
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  codeChallengeMethod: 'S256';
  userId: string;
  refreshToken: string;
  expiresAt: number;
}

declare global {
  // eslint-disable-next-line no-var
  var __beemspecMcpAuthCodes: Map<string, AuthorizationCodePayload> | undefined;
}

function getCodeStore(): Map<string, AuthorizationCodePayload> {
  if (!globalThis.__beemspecMcpAuthCodes) {
    globalThis.__beemspecMcpAuthCodes = new Map();
  }
  return globalThis.__beemspecMcpAuthCodes;
}

function getSigningSecret(): string {
  const secret = env.mcpOAuthSecret();
  if (!secret) {
    throw new Error('Missing BEEMSPEC_MCP_OAUTH_SECRET for MCP OAuth signing');
  }
  return secret;
}

function signPayload(payload: string): string {
  return createHmac('sha256', getSigningSecret()).update(payload).digest('base64url');
}

function encodeSignedObject(input: unknown): string {
  const data = Buffer.from(JSON.stringify(input), 'utf8').toString('base64url');
  const signature = signPayload(data);
  return `${data}.${signature}`;
}

function decodeSignedObject<T>(token: string): T | null {
  const [data, signature] = token.split('.');
  if (!data || !signature) return null;

  const expected = signPayload(data);
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length) return null;
  if (!timingSafeEqual(actualBuffer, expectedBuffer)) return null;

  try {
    return JSON.parse(Buffer.from(data, 'base64url').toString('utf8')) as T;
  } catch {
    return null;
  }
}

export function registerMcpOAuthClient(input: { redirect_uris: string[]; client_name?: string }) {
  const payload: RegisteredClientPayload = {
    redirect_uris: input.redirect_uris,
    client_name: input.client_name,
    issued_at: Math.floor(Date.now() / 1000),
  };

  return {
    client_id: `bsmcp_${encodeSignedObject(payload)}`,
    client_id_issued_at: payload.issued_at,
    redirect_uris: payload.redirect_uris,
    client_name: payload.client_name,
    token_endpoint_auth_method: 'none',
    grant_types: ['authorization_code', 'refresh_token'],
    response_types: ['code'],
  };
}

export function validateRegisteredClient(
  clientId: string,
  redirectUri: string,
): { valid: true } | { valid: false; reason: string } {
  if (!clientId.startsWith('bsmcp_')) return { valid: false, reason: 'unknown_client' };
  const payload = decodeSignedObject<RegisteredClientPayload>(clientId.slice('bsmcp_'.length));
  if (!payload) return { valid: false, reason: 'invalid_client' };
  if (!redirectUriMatches(payload.redirect_uris, redirectUri)) {
    return { valid: false, reason: 'redirect_uri_mismatch' };
  }
  return { valid: true };
}

export function issueAuthorizationCode(input: {
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  userId: string;
  refreshToken: string;
}): string {
  const code = `mcpc_${randomUUID().replaceAll('-', '')}`;
  getCodeStore().set(code, {
    clientId: input.clientId,
    redirectUri: input.redirectUri,
    codeChallenge: input.codeChallenge,
    codeChallengeMethod: 'S256',
    userId: input.userId,
    refreshToken: input.refreshToken,
    expiresAt: Date.now() + 5 * 60 * 1000,
  });
  return code;
}

export function consumeAuthorizationCode(code: string): AuthorizationCodePayload | null {
  const item = getCodeStore().get(code);
  if (!item) return null;
  getCodeStore().delete(code);
  if (item.expiresAt < Date.now()) return null;
  return item;
}

export function verifyPkceS256(codeVerifier: string, codeChallenge: string): boolean {
  const digest = createHash('sha256').update(codeVerifier).digest('base64url');
  return digest === codeChallenge;
}
