import { createHmac, timingSafeEqual } from 'node:crypto';
import { isValidUuid } from '@/lib/validations';
import { env } from './env';

const SHARE_LINK_CONTEXT = 'share-link:v1';

export type ShareResource = 'process-flow' | 'story-map' | 'roadmap';

type ShareTokenPayload = {
  v: 1;
  resource: ShareResource;
  resourceId: string;
  exp?: number;
};

export type ShareTokenVerificationResult =
  | { ok: true; resource: ShareResource; resourceId: string; expiresAt: Date | null }
  | { ok: false; reason: 'invalid' | 'expired' };

function getShareLinkSecret(): string {
  const secret = env.shareLinkSecret();
  if (!secret) {
    throw new Error('Missing share link secret');
  }

  return secret;
}

function encodeBase64Url(value: string | Uint8Array): string {
  return Buffer.from(value).toString('base64url');
}

function decodeBase64Url(value: string): string {
  return Buffer.from(value, 'base64url').toString('utf8');
}

function signPayload(encodedPayload: string): string {
  return createHmac('sha256', getShareLinkSecret())
    .update(SHARE_LINK_CONTEXT)
    .update('.')
    .update(encodedPayload)
    .digest('base64url');
}

function isShareResource(value: unknown): value is ShareResource {
  return value === 'process-flow' || value === 'story-map' || value === 'roadmap';
}

function parsePayload(encodedPayload: string): ShareTokenPayload | null {
  try {
    const parsed = JSON.parse(decodeBase64Url(encodedPayload)) as Partial<ShareTokenPayload>;
    if (parsed.v !== 1) return null;
    if (!isShareResource(parsed.resource)) return null;
    if (typeof parsed.resourceId !== 'string' || !isValidUuid(parsed.resourceId)) return null;
    if (parsed.exp !== undefined && (!Number.isInteger(parsed.exp) || parsed.exp <= 0)) return null;

    return parsed as ShareTokenPayload;
  } catch {
    return null;
  }
}

export function createShareToken(input: {
  resource: ShareResource;
  resourceId: string;
  expiresAt?: Date | null;
}): string {
  if (!isValidUuid(input.resourceId)) {
    throw new Error('Invalid share resource id');
  }

  const payload: ShareTokenPayload = {
    v: 1,
    resource: input.resource,
    resourceId: input.resourceId,
    ...(input.expiresAt ? { exp: Math.floor(input.expiresAt.getTime() / 1000) } : {}),
  };
  const encodedPayload = encodeBase64Url(JSON.stringify(payload));
  const signature = signPayload(encodedPayload);
  return `${encodedPayload}.${signature}`;
}

export function verifyShareToken(token: string): ShareTokenVerificationResult {
  const [encodedPayload, providedSignature, ...extraParts] = token.split('.');
  if (!encodedPayload || !providedSignature || extraParts.length > 0) {
    return { ok: false, reason: 'invalid' };
  }

  const expectedSignature = signPayload(encodedPayload);
  const provided = Buffer.from(providedSignature);
  const expected = Buffer.from(expectedSignature);
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
    return { ok: false, reason: 'invalid' };
  }

  const payload = parsePayload(encodedPayload);
  if (!payload) {
    return { ok: false, reason: 'invalid' };
  }

  if (payload.exp !== undefined && payload.exp <= Math.floor(Date.now() / 1000)) {
    return { ok: false, reason: 'expired' };
  }

  return {
    ok: true,
    resource: payload.resource,
    resourceId: payload.resourceId,
    expiresAt: payload.exp ? new Date(payload.exp * 1000) : null,
  };
}
