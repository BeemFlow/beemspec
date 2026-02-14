import type { LinearWebhookEvent, LinearWebhookIngestPort } from '@/integrations/linear/contracts';

function getString(value: unknown, key: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`Invalid Linear webhook payload: missing ${key}`);
  }
  return value;
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

export function createLinearWebhookIngestStub(enabled: boolean): LinearWebhookIngestPort | null {
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
