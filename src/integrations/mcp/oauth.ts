import { createHash, randomBytes } from 'node:crypto';
import { checkResourceAllowed, resourceUrlFromServerUrl } from '@modelcontextprotocol/sdk/shared/auth-utils.js';
import { CompactEncrypt, compactDecrypt, jwtVerify, SignJWT } from 'jose';
import { env } from '@/lib/env';

interface RegisteredClientPayload {
  redirect_uris: string[];
  client_name?: string;
  issued_at: number;
}

export function normalizeMcpRedirectUri(uri: string): string | null {
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

  const normalizedRequested = normalizeMcpRedirectUri(requested);
  if (!normalizedRequested) return false;

  return allowed.some((uri) => {
    const normalizedAllowed = normalizeMcpRedirectUri(uri);
    return normalizedAllowed !== null && normalizedAllowed === normalizedRequested;
  });
}

export function isSameMcpRedirectUri(a: string, b: string): boolean {
  if (a === b) return true;
  const normalizedA = normalizeMcpRedirectUri(a);
  const normalizedB = normalizeMcpRedirectUri(b);
  return normalizedA !== null && normalizedB !== null && normalizedA === normalizedB;
}

export function isAllowedMcpRedirectUri(uri: string): boolean {
  try {
    const parsed = new URL(uri);
    if (parsed.protocol === 'https:') {
      return true;
    }

    if (parsed.protocol === 'http:') {
      return parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';
    }

    return false;
  } catch {
    return false;
  }
}

export function normalizeMcpResourceUri(uri: string): string | null {
  try {
    const normalized = resourceUrlFromServerUrl(uri);
    const isLoopback = normalized.hostname === 'localhost' || normalized.hostname === '127.0.0.1';
    if (isLoopback) normalized.hostname = '127.0.0.1';
    if (
      (normalized.protocol === 'http:' && normalized.port === '80') ||
      (normalized.protocol === 'https:' && normalized.port === '443')
    ) {
      normalized.port = '';
    }
    if (normalized.pathname.length > 1) {
      normalized.pathname = normalized.pathname.replace(/\/+$/, '');
    }
    return normalized.toString();
  } catch {
    return null;
  }
}

export function isSameMcpResourceUri(a: string, b: string): boolean {
  const normalizedA = normalizeMcpResourceUri(a);
  const normalizedB = normalizeMcpResourceUri(b);
  if (!normalizedA || !normalizedB) return false;

  return (
    checkResourceAllowed({ requestedResource: normalizedA, configuredResource: normalizedB }) &&
    checkResourceAllowed({ requestedResource: normalizedB, configuredResource: normalizedA })
  );
}

interface AuthorizationCodePayload {
  codeId: string;
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  codeChallengeMethod: 'S256';
  userId: string;
  refreshToken: string;
  resource?: string;
  expiresAt: number;
}

const consumedAuthorizationCodes = new Map<string, number>();

function pruneConsumedAuthorizationCodes(now = Date.now()): void {
  for (const [codeId, expiresAt] of consumedAuthorizationCodes.entries()) {
    if (expiresAt <= now) {
      consumedAuthorizationCodes.delete(codeId);
    }
  }
}

function getSigningSecret(): string {
  const secret = env.mcpOAuthSecret();
  if (!secret) {
    throw new Error('Missing BEEMSPEC_MCP_OAUTH_SECRET for MCP OAuth signing');
  }
  return secret;
}

function getSigningKey(): Uint8Array {
  return new TextEncoder().encode(getSigningSecret());
}

function getEncryptionKey(): Uint8Array {
  return createHash('sha256').update(getSigningSecret()).digest();
}

async function encryptPayload(plaintext: string): Promise<string> {
  return new CompactEncrypt(new TextEncoder().encode(plaintext))
    .setProtectedHeader({ alg: 'dir', enc: 'A256GCM' })
    .encrypt(getEncryptionKey());
}

async function decryptPayload(token: string): Promise<string | null> {
  try {
    const decrypted = await compactDecrypt(token, getEncryptionKey());
    return new TextDecoder().decode(decrypted.plaintext);
  } catch {
    return null;
  }
}

async function encodeSignedObject(input: unknown): Promise<string> {
  return new SignJWT({ payload: input })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuedAt()
    .sign(getSigningKey());
}

async function decodeSignedObject<T>(token: string): Promise<T | null> {
  try {
    const verified = await jwtVerify(token, getSigningKey(), { algorithms: ['HS256'] });
    const payload = verified.payload.payload;
    if (!payload || typeof payload !== 'object') return null;
    return payload as T;
  } catch {
    return null;
  }
}

export async function registerMcpOAuthClient(input: { redirect_uris: string[]; client_name?: string }) {
  const payload: RegisteredClientPayload = {
    redirect_uris: input.redirect_uris,
    client_name: input.client_name,
    issued_at: Math.floor(Date.now() / 1000),
  };

  const signed = await encodeSignedObject(payload);

  return {
    client_id: `bsmcp_${signed}`,
    client_id_issued_at: payload.issued_at,
    redirect_uris: payload.redirect_uris,
    client_name: payload.client_name,
    token_endpoint_auth_method: 'none',
    grant_types: ['authorization_code', 'refresh_token'],
    response_types: ['code'],
  };
}

export async function validateRegisteredClient(
  clientId: string,
  redirectUri: string,
): Promise<{ valid: true } | { valid: false; reason: string }> {
  if (!clientId.startsWith('bsmcp_')) return { valid: false, reason: 'unknown_client' };
  const payload = await decodeSignedObject<RegisteredClientPayload>(clientId.slice('bsmcp_'.length));
  if (!payload) return { valid: false, reason: 'invalid_client' };
  if (!redirectUriMatches(payload.redirect_uris, redirectUri)) {
    return { valid: false, reason: 'redirect_uri_mismatch' };
  }
  return { valid: true };
}

export async function issueAuthorizationCode(input: {
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  userId: string;
  refreshToken: string;
  resource?: string;
}): Promise<string> {
  const payload: AuthorizationCodePayload = {
    codeId: randomBytes(16).toString('hex'),
    clientId: input.clientId,
    redirectUri: input.redirectUri,
    codeChallenge: input.codeChallenge,
    codeChallengeMethod: 'S256',
    userId: input.userId,
    refreshToken: input.refreshToken,
    resource: input.resource,
    expiresAt: Date.now() + 5 * 60 * 1000,
  };

  const encoded = await encryptPayload(JSON.stringify(payload));
  return `mcpc_${encoded}`;
}

export async function consumeAuthorizationCode(code: string): Promise<AuthorizationCodePayload | null> {
  pruneConsumedAuthorizationCodes();

  if (!code.startsWith('mcpc_')) return null;
  const plaintext = await decryptPayload(code.slice('mcpc_'.length));
  if (!plaintext) return null;

  try {
    const item = JSON.parse(plaintext) as AuthorizationCodePayload;
    if (item.expiresAt < Date.now()) return null;

    if (!item.codeId || consumedAuthorizationCodes.has(item.codeId)) {
      return null;
    }

    consumedAuthorizationCodes.set(item.codeId, item.expiresAt);
    return item;
  } catch {
    return null;
  }
}

export function verifyPkceS256(codeVerifier: string, codeChallenge: string): boolean {
  const digest = createHash('sha256').update(codeVerifier).digest('base64url');
  return digest === codeChallenge;
}
