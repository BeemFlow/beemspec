import { describe, expect, it } from 'vitest';
import { createLinearWebhookIngest, parseLinearWebhookEvent } from './webhook-ingest';

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
        webhookTimestamp: '2026-02-13T00:00:00.000Z',
        data: { id: 'issue-1', title: 'Story title' },
      }),
      headers,
    );

    expect(event).toEqual({
      idempotencyKey: 'delivery-123',
      type: 'Issue',
      action: 'update',
      createdAt: '2026-02-13T00:00:00.000Z',
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
