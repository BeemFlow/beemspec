import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createLinearWebhookSignatureVerifier } from './webhook-ingest';

describe('linear webhook verifier', () => {
  it('verifies matching signature and recent timestamp', () => {
    const nowMs = Date.parse('2026-02-14T12:00:00.000Z');
    const body = JSON.stringify({ hello: 'world' });
    const signature = createHmac('sha256', 'secret_123').update(body).digest('hex');

    const verifier = createLinearWebhookSignatureVerifier({
      secret: 'secret_123',
      now: () => nowMs,
    });

    expect(verifier?.verify({ rawBody: body, signature, timestamp: '2026-02-14T11:58:00.000Z' })).toBe(true);
  });

  it('rejects stale timestamp or invalid signature', () => {
    const verifier = createLinearWebhookSignatureVerifier({
      secret: 'secret_123',
      now: () => Date.parse('2026-02-14T12:00:00.000Z'),
      maxTimestampDriftMs: 60_000,
    });

    expect(
      verifier?.verify({
        rawBody: '{}',
        signature: 'deadbeef',
        timestamp: '2026-02-14T11:00:00.000Z',
      }),
    ).toBe(false);
  });
});
