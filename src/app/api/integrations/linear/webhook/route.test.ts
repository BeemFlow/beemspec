import { createHmac } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { domainRuntime } from '@/domains/runtime';
import { parseLinearWebhookEvent } from '@/integrations/linear/stub';
import { createAdminClient } from '@/lib/supabase/admin';
import { POST } from './route';

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(),
}));

function sign(body: string, secret: string): string {
  return createHmac('sha256', secret).update(body).digest('hex');
}

function createWebhookAdminClient(
  options: {
    existingLink?: { story_id: string; linear_issue_id: string; linear_issue_identifier: string | null } | null;
    duplicateReceipt?: boolean;
    allowTitleWriteback?: boolean;
    statusMapping?: Record<string, 'backlog' | 'ready' | 'in_progress' | 'review' | 'done'>;
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
    },
    error: null,
  });
  const linkUpsertSelect = vi.fn().mockReturnValue({ single: linkUpsertSingle });
  const linkUpsert = vi.fn().mockReturnValue({ select: linkUpsertSelect });

  const storyEq = vi.fn().mockResolvedValue({ error: null });
  const storyUpdate = vi.fn().mockReturnValue({ eq: storyEq });

  const storyTeamSingle = vi.fn().mockResolvedValue({
    data: {
      tasks: {
        activities: {
          story_maps: {
            team_id: 'team_1',
          },
        },
      },
    },
    error: null,
  });
  const storyTeamEq = vi.fn().mockReturnValue({ single: storyTeamSingle });
  const storySelect = vi.fn().mockReturnValue({ eq: storyTeamEq });

  const settingsMaybeSingle = vi.fn().mockResolvedValue({
    data: {
      linear_status_mapping: options.statusMapping ?? null,
      linear_allow_title_writeback: options.allowTitleWriteback ?? false,
      linear_allow_status_writeback: true,
    },
    error: null,
  });
  const settingsEq = vi.fn().mockReturnValue({ maybeSingle: settingsMaybeSingle });
  const settingsSelect = vi.fn().mockReturnValue({ eq: settingsEq });

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
    if (table === 'integration_settings') {
      return {
        select: settingsSelect,
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
    domainRuntime.storyMap.linearWebhookIngest = {
      parseAndValidate: ({ rawBody, headers }) => parseLinearWebhookEvent(rawBody, headers),
    };
  });

  it('returns 401 for invalid signature', async () => {
    vi.mocked(createAdminClient).mockReturnValue(createWebhookAdminClient().client as never);

    const createdAt = new Date().toISOString();
    const rawBody = JSON.stringify({
      action: 'update',
      type: 'Issue',
      createdAt,
      webhookTimestamp: createdAt,
      data: {
        id: 'lin_1',
        title: 'Updated',
      },
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
    const admin = createWebhookAdminClient({ allowTitleWriteback: true });
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
        state: { name: 'In Progress' },
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

  it('uses configured status mapping for writeback', async () => {
    const admin = createWebhookAdminClient({ statusMapping: { started: 'in_progress' } });
    vi.mocked(createAdminClient).mockReturnValue(admin.client as never);

    const createdAt = new Date().toISOString();
    const rawBody = JSON.stringify({
      action: 'update',
      type: 'Issue',
      createdAt,
      webhookTimestamp: createdAt,
      data: {
        id: 'lin_1',
        state: { name: 'Started' },
      },
    });

    await POST(
      new Request('http://localhost/api/integrations/linear/webhook', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Linear-Signature': sign(rawBody, 'webhook_secret'),
          'Linear-Delivery': 'delivery_mapping',
        },
        body: rawBody,
      }),
    );

    expect(admin.storyUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'in_progress',
      }),
    );
  });

  it('uses state id mapping when provided', async () => {
    const admin = createWebhookAdminClient({ statusMapping: { state_started_1: 'review' } });
    vi.mocked(createAdminClient).mockReturnValue(admin.client as never);

    const createdAt = new Date().toISOString();
    const rawBody = JSON.stringify({
      action: 'update',
      type: 'Issue',
      createdAt,
      webhookTimestamp: createdAt,
      data: {
        id: 'lin_1',
        state: { id: 'state_started_1', name: 'Started' },
      },
    });

    await POST(
      new Request('http://localhost/api/integrations/linear/webhook', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Linear-Signature': sign(rawBody, 'webhook_secret'),
          'Linear-Delivery': 'delivery_state_id_mapping',
        },
        body: rawBody,
      }),
    );

    expect(admin.storyUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'review',
      }),
    );
  });

  it('does not write back title by default policy', async () => {
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
        title: 'Should not apply by default',
        state: { name: 'Ready' },
      },
    });

    await POST(
      new Request('http://localhost/api/integrations/linear/webhook', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Linear-Signature': sign(rawBody, 'webhook_secret'),
          'Linear-Delivery': 'delivery_title_policy',
        },
        body: rawBody,
      }),
    );

    expect(admin.storyUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'ready',
      }),
    );
    expect(admin.storyUpdate).toHaveBeenCalledWith(
      expect.not.objectContaining({ title: 'Should not apply by default' }),
    );
  });
});
