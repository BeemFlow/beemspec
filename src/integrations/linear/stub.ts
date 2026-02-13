import type {
  LinearIssueSnapshot,
  LinearIssueSyncPort,
  LinearIssueUpsertInput,
  LinearWebhookEvent,
  LinearWebhookIngestPort,
} from '@/integrations/linear/contracts';

class LinearNotEnabledError extends Error {
  constructor() {
    super('Invalid Linear webhook request');
  }
}

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

export function createLinearIssueSyncStub(enabled: boolean): LinearIssueSyncPort | null {
  if (!enabled) return null;

  return {
    async getIssueById(_issueId: string): Promise<LinearIssueSnapshot | null> {
      throw new Error('Linear issue sync not implemented yet');
    },
    async createIssue(_input: LinearIssueUpsertInput): Promise<LinearIssueSnapshot> {
      throw new Error('Linear issue sync not implemented yet');
    },
    async updateIssue(_issueId: string, _input: Partial<LinearIssueUpsertInput>): Promise<LinearIssueSnapshot> {
      throw new Error('Linear issue sync not implemented yet');
    },
  };
}

export function createLinearWebhookIngestStub(enabled: boolean): LinearWebhookIngestPort | null {
  if (!enabled) return null;

  return {
    parseAndValidate(input: { rawBody: string; headers: Headers }): LinearWebhookEvent {
      const signature = input.headers.get('Linear-Signature');
      if (!signature) {
        throw new LinearNotEnabledError();
      }
      return parseLinearWebhookEvent(input.rawBody, input.headers);
    },
  };
}
