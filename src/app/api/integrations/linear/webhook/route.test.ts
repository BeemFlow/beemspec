import { createHmac } from 'node:crypto';
import { createLinearWebhookSignatureVerifier, parseLinearWebhookEvent } from '@beemspec/linear';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getLinearWebhookIngest, getLinearWebhookSignatureVerifier } from '@/integrations/linear/helpers';
import { createAdminClient } from '@/lib/supabase/admin';
import { POST } from './route';

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(),
}));

vi.mock('@/integrations/linear/helpers', () => ({
  getLinearWebhookIngest: vi.fn(),
  getLinearWebhookSignatureVerifier: vi.fn(),
}));

function sign(body: string, secret: string): string {
  return createHmac('sha256', secret).update(body).digest('hex');
}

function createWebhookAdminClient(
  options: {
    existingLink?: { story_id: string; linear_issue_id: string; linear_issue_identifier: string | null } | null;
    duplicateReceipt?: boolean;
    localStoryUpdatedAt?: string;
  } = {},
) {
  const receiptInsert = vi.fn().mockResolvedValue(
    options.duplicateReceipt
      ? { error: { code: '23505' } }
      : {
          error: null,
        },
  );

  const linkMaybeSingle = vi.fn().mockResolvedValue({
    data: options.existingLink ?? {
      story_id: 'story_1',
      linear_issue_id: 'lin_1',
      linear_issue_identifier: 'ENG-101',
      last_local_updated_at: null,
      last_linear_updated_at: null,
    },
    error: null,
  });
  const linkEq = vi.fn().mockReturnValue({ maybeSingle: linkMaybeSingle });
  const linkSelect = vi.fn().mockReturnValue({ eq: linkEq });

  const linkUpsertSingle = vi.fn().mockResolvedValue({
    data: {
      story_id: 'story_1',
      linear_issue_id: 'lin_1',
      linear_issue_identifier: 'ENG-101',
      last_local_updated_at: '2026-02-14T11:00:00.000Z',
      last_linear_updated_at: '2026-02-14T11:00:00.000Z',
    },
    error: null,
  });
  const linkUpsertSelect = vi.fn().mockReturnValue({ single: linkUpsertSingle });
  const linkUpsert = vi.fn().mockReturnValue({ select: linkUpsertSelect });

  const storySelectSingle = vi.fn().mockResolvedValue({
    data: {
      id: 'story_1',
      updated_at: options.localStoryUpdatedAt ?? '2026-02-14T10:00:00.000Z',
      content: {
        _version: 1,
        requirements: 'Existing req',
        acceptance_criteria: 'Existing AC',
      },
    },
    error: null,
  });
  const storySelectEq = vi.fn().mockReturnValue({ single: storySelectSingle });
  const storySelect = vi.fn().mockReturnValue({ eq: storySelectEq });

  const storyEq = vi.fn().mockResolvedValue({ error: null });
  const storyUpdate = vi.fn().mockReturnValue({ eq: storyEq });

  const from = vi.fn((table: string) => {
    if (table === 'integration_webhook_receipts') {
      return { insert: receiptInsert };
    }
    if (table === 'story_linear_links') {
      return {
        select: linkSelect,
        upsert: linkUpsert,
      };
    }
    if (table === 'stories') {
      return {
        select: storySelect,
        update: storyUpdate,
      };
    }
    return {};
  });

  return {
    client: { from },
    receiptInsert,
    storyUpdate,
  };
}

describe('linear webhook route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.BEEMSPEC_LINEAR_WEBHOOK_SECRET = 'webhook_secret';
    vi.mocked(getLinearWebhookIngest).mockReturnValue({
      parseAndValidate: ({ rawBody, headers }) => parseLinearWebhookEvent(rawBody, headers),
    });
    vi.mocked(getLinearWebhookSignatureVerifier).mockReturnValue(
      createLinearWebhookSignatureVerifier({ secret: 'webhook_secret' }),
    );
  });

  it('returns 401 for invalid signature', async () => {
    vi.mocked(createAdminClient).mockReturnValue(createWebhookAdminClient().client as never);

    const createdAt = new Date().toISOString();
    const rawBody = JSON.stringify({
      action: 'update',
      type: 'Issue',
      createdAt,
      webhookTimestamp: createdAt,
      data: { id: 'lin_1', title: 'Updated' },
    });

    const response = await POST(
      new Request('http://localhost/api/integrations/linear/webhook', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Linear-Signature': 'bad_signature',
          'Linear-Delivery': 'delivery_1',
        },
        body: rawBody,
      }),
    );

    expect(response.status).toBe(401);
  });

  it('applies supported issue writeback and records receipt', async () => {
    const admin = createWebhookAdminClient();
    vi.mocked(createAdminClient).mockReturnValue(admin.client as never);

    const createdAt = new Date().toISOString();
    const rawBody = JSON.stringify({
      action: 'update',
      type: 'Issue',
      createdAt,
      webhookTimestamp: createdAt,
      data: {
        id: 'lin_1',
        identifier: 'ENG-101',
        title: 'Story title updated from Linear',
        description:
          '## Requirements\nUpdated req\n\n## Acceptance Criteria\n- [ ] Updated AC\n\n## Status\nIn Progress',
        state: { name: 'In Progress' },
        updatedAt: '2026-02-14T11:00:00.000Z',
      },
    });

    const response = await POST(
      new Request('http://localhost/api/integrations/linear/webhook', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Linear-Signature': sign(rawBody, 'webhook_secret'),
          'Linear-Delivery': 'delivery_2',
        },
        body: rawBody,
      }),
    );

    expect(admin.storyUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Story title updated from Linear',
        content: expect.objectContaining({
          requirements: 'Updated req',
          acceptance_criteria: '- [ ] Updated AC',
        }),
        status: 'in_progress',
      }),
    );
    expect(admin.receiptInsert).toHaveBeenCalled();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ success: true, applied: true });
  });

  it('handles duplicate delivery idempotently', async () => {
    const admin = createWebhookAdminClient({ duplicateReceipt: true });
    vi.mocked(createAdminClient).mockReturnValue(admin.client as never);

    const createdAt = new Date().toISOString();
    const rawBody = JSON.stringify({
      action: 'update',
      type: 'Issue',
      createdAt,
      webhookTimestamp: createdAt,
      data: {
        id: 'lin_1',
        title: 'Story title updated from Linear',
      },
    });

    const response = await POST(
      new Request('http://localhost/api/integrations/linear/webhook', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Linear-Signature': sign(rawBody, 'webhook_secret'),
          'Linear-Delivery': 'delivery_duplicate',
        },
        body: rawBody,
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ success: true, duplicate: true });
  });

  it('ignores stale remote updates when local is newer', async () => {
    const admin = createWebhookAdminClient({ localStoryUpdatedAt: '2026-02-14T12:00:00.000Z' });
    vi.mocked(createAdminClient).mockReturnValue(admin.client as never);

    const createdAt = new Date().toISOString();
    const rawBody = JSON.stringify({
      action: 'update',
      type: 'Issue',
      createdAt,
      webhookTimestamp: createdAt,
      data: {
        id: 'lin_1',
        title: 'Older remote title',
        updatedAt: '2026-02-14T11:00:00.000Z',
      },
    });

    const response = await POST(
      new Request('http://localhost/api/integrations/linear/webhook', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Linear-Signature': sign(rawBody, 'webhook_secret'),
          'Linear-Delivery': 'delivery_stale_remote',
        },
        body: rawBody,
      }),
    );

    expect(admin.storyUpdate).not.toHaveBeenCalled();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ success: true, ignored: true });
  });

  it('ignores remote updates when timestamps are equal', async () => {
    const admin = createWebhookAdminClient({ localStoryUpdatedAt: '2026-02-14T11:00:00.000Z' });
    vi.mocked(createAdminClient).mockReturnValue(admin.client as never);

    const createdAt = new Date().toISOString();
    const rawBody = JSON.stringify({
      action: 'update',
      type: 'Issue',
      createdAt,
      webhookTimestamp: createdAt,
      data: {
        id: 'lin_1',
        title: 'Equal timestamp title',
        updatedAt: '2026-02-14T11:00:00.000Z',
      },
    });

    const response = await POST(
      new Request('http://localhost/api/integrations/linear/webhook', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Linear-Signature': sign(rawBody, 'webhook_secret'),
          'Linear-Delivery': 'delivery_equal_timestamp',
        },
        body: rawBody,
      }),
    );

    expect(admin.storyUpdate).not.toHaveBeenCalled();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ success: true, ignored: true });
  });
});
