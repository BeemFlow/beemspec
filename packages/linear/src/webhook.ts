import { createHmac, timingSafeEqual } from 'node:crypto';
import type { WebhookEvent, WebhookIngest, WebhookSignatureVerifier } from '@beemspec/sync';

const DEFAULT_MAX_DRIFT_MS = 5 * 60 * 1000;

function getString(value: unknown, key: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`Invalid Linear webhook payload: missing ${key}`);
  }
  return value;
}

function parseTimestampMs(timestamp: string): number | null {
  const trimmed = timestamp.trim();
  if (/^\d+$/.test(trimmed)) {
    const numeric = Number(trimmed);
    if (!Number.isFinite(numeric) || numeric <= 0) return null;
    return numeric < 1_000_000_000_000 ? numeric * 1000 : numeric;
  }

  const value = Date.parse(trimmed);
  return Number.isFinite(value) ? value : null;
}

function getWebhookTimestamp(value: unknown): string {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return String(Math.floor(value));
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed.length > 0) return trimmed;
  }

  throw new Error('Invalid Linear webhook payload: missing webhookTimestamp');
}

function parseSignatureCandidates(signatureHeader: string): string[] {
  return signatureHeader
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const equalsIndex = part.indexOf('=');
      if (equalsIndex < 0) return part;
      return part.slice(equalsIndex + 1);
    })
    .map((value) => value.trim())
    .filter((value) => /^[a-fA-F0-9]+$/.test(value));
}

function isMatchingSignature(expectedHex: string, candidateHex: string): boolean {
  if (expectedHex.length !== candidateHex.length || expectedHex.length % 2 !== 0) {
    return false;
  }

  const expected = Buffer.from(expectedHex, 'hex');
  const candidate = Buffer.from(candidateHex, 'hex');
  if (expected.length !== candidate.length) return false;
  return timingSafeEqual(expected, candidate);
}

/** Parse a raw Linear webhook HTTP body + headers into a typed WebhookEvent. */
export function parseLinearWebhookEvent(rawBody: string, headers: Headers): WebhookEvent {
  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    throw new Error('Invalid Linear webhook payload: malformed JSON');
  }

  if (!body || typeof body !== 'object') {
    throw new Error('Invalid Linear webhook payload: expected object');
  }

  const record = body as Record<string, unknown>;
  const type = getString(record.type, 'type');
  const action = getString(record.action, 'action');
  const occurredAt = getString(record.createdAt, 'createdAt');
  const deliveredAt = getWebhookTimestamp(record.webhookTimestamp);

  const deliveryId = headers.get('Linear-Delivery');
  const webhookId = typeof record.webhookId === 'string' ? record.webhookId : null;
  const idempotencyKey = deliveryId ?? webhookId ?? `${type}:${action}:${deliveredAt}`;

  return {
    idempotencyKey,
    type,
    action,
    occurredAt,
    deliveredAt,
    payload: record.data ?? record,
  };
}

/**
 * Create a WebhookIngest that validates the presence of a Linear-Signature header
 * before parsing the event. The `enabled` flag allows gating at the app layer.
 */
export function createLinearWebhookIngest(enabled: boolean): WebhookIngest | null {
  if (!enabled) return null;

  return {
    parseAndValidate(input: { rawBody: string; headers: Headers }): WebhookEvent {
      const signature = input.headers.get('Linear-Signature');
      if (!signature) {
        throw new Error('Invalid Linear webhook request');
      }
      return parseLinearWebhookEvent(input.rawBody, input.headers);
    },
  };
}

/**
 * Create a WebhookSignatureVerifier for Linear's HMAC-SHA256 signing scheme.
 * The secret is injected -- no env vars are read.
 */
export function createLinearWebhookSignatureVerifier(options: {
  secret: string;
  maxTimestampDriftMs?: number;
  now?: () => number;
}): WebhookSignatureVerifier | null {
  const secret = options.secret.trim();
  if (!secret) return null;

  const maxTimestampDriftMs = options.maxTimestampDriftMs ?? DEFAULT_MAX_DRIFT_MS;
  const now = options.now ?? (() => Date.now());

  return {
    verify(input: { rawBody: string; signature: string; timestamp: string }): boolean {
      const timestampMs = parseTimestampMs(input.timestamp);
      if (timestampMs === null) return false;

      const drift = Math.abs(now() - timestampMs);
      if (drift > maxTimestampDriftMs) return false;

      const expectedSignature = createHmac('sha256', secret).update(input.rawBody).digest('hex');
      const candidates = parseSignatureCandidates(input.signature);
      return candidates.some((candidate) => isMatchingSignature(expectedSignature, candidate));
    },
  };
}
