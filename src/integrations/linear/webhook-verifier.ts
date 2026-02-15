import { createHmac, timingSafeEqual } from 'node:crypto';
import type { LinearWebhookSignatureVerifier } from '@/integrations/linear/types';

const DEFAULT_MAX_DRIFT_MS = 5 * 60 * 1000;

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

export function createLinearWebhookSignatureVerifier(
  options: { secret?: string; maxTimestampDriftMs?: number; now?: () => number } = {},
): LinearWebhookSignatureVerifier | null {
  const secret = (
    options.secret ??
    process.env.BEEMSPEC_LINEAR_WEBHOOK_SECRET ??
    process.env.LINEAR_WEBHOOK_SECRET ??
    ''
  ).trim();
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
