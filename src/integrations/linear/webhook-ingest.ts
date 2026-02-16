import { createHmac, timingSafeEqual } from 'node:crypto';
import type {
  LinearWebhookEvent,
  LinearWebhookIngest,
  LinearWebhookSignatureVerifier,
} from '@/integrations/linear/types';
import { env } from '@/lib/env';

const DEFAULT_MAX_DRIFT_MS = 5 * 60 * 1000;

function getString(value: unknown, key: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`Invalid Linear webhook payload: missing ${key}`);
  }
  return value;
}

function parseTimestampMs(timestamp: string): number | null {
  const value = Date.parse(timestamp);
  return Number.isFinite(value) ? value : null;
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

export function parseLinearWebhookEvent(rawBody: string, headers: Headers): LinearWebhookEvent {
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
  const createdAt = getString(record.createdAt, 'createdAt');
  getString(record.webhookTimestamp, 'webhookTimestamp');

  const deliveryId = headers.get('Linear-Delivery');
  const webhookId = typeof record.webhookId === 'string' ? record.webhookId : null;
  const idempotencyKey = deliveryId ?? webhookId ?? `${type}:${action}:${createdAt}`;

  return {
    idempotencyKey,
    type,
    action,
    createdAt,
    payload: record.data ?? record,
  };
}

export function createLinearWebhookIngest(enabled: boolean): LinearWebhookIngest | null {
  if (!enabled) return null;

  return {
    parseAndValidate(input: { rawBody: string; headers: Headers }): LinearWebhookEvent {
      const signature = input.headers.get('Linear-Signature');
      if (!signature) {
        throw new Error('Invalid Linear webhook request');
      }
      return parseLinearWebhookEvent(input.rawBody, input.headers);
    },
  };
}

export function createLinearWebhookSignatureVerifier(
  options: { secret?: string; maxTimestampDriftMs?: number; now?: () => number } = {},
): LinearWebhookSignatureVerifier | null {
  const secret = (options.secret ?? env.linearWebhookSecret() ?? '').trim();
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
