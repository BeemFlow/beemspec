import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createLinearWebhookIngest, createLinearWebhookSignatureVerifier, parseLinearWebhookEvent } from './webhook';

describe('linear webhook verifier', () => {
  it('verifies matching signature and recent timestamp', () => {
    const nowMs = Date.parse('2026-02-14T12:00:00.000Z');
    const body = JSON.stringify({ hello: 'world' });
    const signature = createHmac('sha256', 'secret_123').update(body).digest('hex');

    const verifier = createLinearWebhookSignatureVerifier({
      secret: 'secret_123',
      now: () => nowMs,
    });

    expect(verifier?.verify({ rawBody: body, signature, timestamp: '2026-02-14T11:59:30.000Z' })).toBe(true);
    expect(verifier?.verify({ rawBody: body, signature, timestamp: String(nowMs - 30_000) })).toBe(true);
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

describe('linear webhook ingest contracts', () => {
  it('parses documented webhook shape into contract event', () => {
    const headers = new Headers({
      'Linear-Delivery': 'delivery-123',
    });

    const event = parseLinearWebhookEvent(
      JSON.stringify({
        action: 'update',
        type: 'Issue',
        createdAt: '2026-02-13T00:00:00.000Z',
        webhookTimestamp: 1770000000000,
        data: { id: 'issue-1', title: 'Story title' },
      }),
      headers,
    );

    expect(event).toEqual({
      idempotencyKey: 'delivery-123',
      type: 'Issue',
      action: 'update',
      occurredAt: '2026-02-13T00:00:00.000Z',
      deliveredAt: '1770000000000',
      payload: { id: 'issue-1', title: 'Story title' },
    });
  });

  it('requires signature header for ingest validation', () => {
    const ingest = createLinearWebhookIngest(true);
    expect(ingest).not.toBeNull();

    expect(() =>
      ingest?.parseAndValidate({
        rawBody: JSON.stringify({
          action: 'create',
          type: 'Issue',
          createdAt: '2026-02-13T00:00:00.000Z',
          webhookTimestamp: '2026-02-13T00:00:00.000Z',
        }),
        headers: new Headers(),
      }),
    ).toThrow('Invalid Linear webhook request');
  });
});
