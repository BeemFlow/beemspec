import { createHmac } from 'node:crypto';
import { createLinearWebhookSignatureVerifier, parseLinearWebhookEvent } from '@beemspec/linear';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getLinearWebhookIngest, getLinearWebhookSignatureVerifier } from '@/integrations/linear/helpers';
import { findStoryMapImportCandidate, importLinearIssueIntoStoryMap } from '@/integrations/linear/import';
import {
  getLinearIssueLabelNames,
  getLinearIssueProjectIdFromPayload,
  getLinearIssueTeamIdFromPayload,
} from '@/integrations/linear/label-sync';
import { createAdminClient } from '@/lib/supabase/admin';
import { POST } from './route';

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(),
}));

vi.mock('@/integrations/linear/helpers', () => ({
  getLinearWebhookIngest: vi.fn(),
  getLinearWebhookSignatureVerifier: vi.fn(),
}));

vi.mock('@/integrations/linear/import', () => ({
  findStoryMapImportCandidate: vi.fn(),
  importLinearIssueIntoStoryMap: vi.fn(),
}));

vi.mock('@/integrations/linear/label-sync', () => ({
  getLinearIssueLabelNames: vi.fn(),
  getLinearIssueProjectIdFromPayload: vi.fn(),
  getLinearIssueTeamIdFromPayload: vi.fn(),
}));

function sign(body: string, secret: string): string {
  return createHmac('sha256', secret).update(body).digest('hex');
}

function createWebhookAdminClient(
  options: {
    existingLink?: { story_id: string; linear_issue_id: string; linear_issue_identifier: string | null } | null;
    duplicateReceipt?: boolean;
    duplicateProcessed?: boolean;
    writebackConflict?: boolean;
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
    data:
      options.existingLink !== undefined
        ? options.existingLink
        : {
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
        user_story: 'Existing req',
        acceptance_criteria: 'Existing AC',
      },
    },
    error: null,
  });
  const storySelectEq = vi.fn().mockReturnValue({ single: storySelectSingle });
  const storySelect = vi.fn().mockReturnValue({ eq: storySelectEq });

  const storyEq = vi.fn().mockResolvedValue({ error: null });
  const storyUpdate = vi.fn().mockReturnValue({ eq: storyEq });
  const storyDeleteEq = vi.fn().mockResolvedValue({ error: null });
  const storyDelete = vi.fn().mockReturnValue({ eq: storyDeleteEq });

  const applyWritebackSingle = vi.fn().mockResolvedValue({
    data: {
      duplicate: options.duplicateProcessed ?? false,
      applied: !(options.duplicateProcessed || options.writebackConflict),
      conflict: options.writebackConflict ?? false,
    },
    error: null,
  });
  const removeWithReceiptSingle = vi
    .fn()
    .mockResolvedValue({ data: { duplicate: options.duplicateProcessed ?? false }, error: null });
  const rpc = vi.fn((fn: string) => {
    if (fn === 'apply_linear_issue_writeback_with_receipt') {
      return { single: applyWritebackSingle };
    }
    if (fn === 'process_linear_issue_remove_with_receipt') {
      return { single: removeWithReceiptSingle };
    }
    return {};
  });

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
        delete: storyDelete,
      };
    }
    return {};
  });

  return {
    client: { from, rpc },
    receiptInsert,
    storyUpdate,
    storyDelete,
    rpc,
  };
}

describe('linear webhook route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.LINEAR_WEBHOOK_SECRET = 'webhook_secret';
    vi.mocked(getLinearWebhookIngest).mockReturnValue({
      parseAndValidate: ({ rawBody, headers }) => parseLinearWebhookEvent(rawBody, headers),
    });
    vi.mocked(getLinearWebhookSignatureVerifier).mockReturnValue(
      createLinearWebhookSignatureVerifier({ secret: 'webhook_secret' }),
    );
    vi.mocked(findStoryMapImportCandidate).mockResolvedValue(null);
    vi.mocked(importLinearIssueIntoStoryMap).mockResolvedValue({ storyId: 'story_imported_1', duplicate: false });
    vi.mocked(getLinearIssueLabelNames).mockReturnValue([]);
    vi.mocked(getLinearIssueProjectIdFromPayload).mockReturnValue(null);
    vi.mocked(getLinearIssueTeamIdFromPayload).mockReturnValue(null);
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

  it('uses webhook delivery time rather than action time for replay protection', async () => {
    vi.mocked(createAdminClient).mockReturnValue(createWebhookAdminClient().client as never);

    const rawBody = JSON.stringify({
      action: 'update',
      type: 'Issue',
      createdAt: '2020-01-01T00:00:00.000Z',
      webhookTimestamp: Date.now(),
      data: {
        id: 'lin_1',
        title: 'Delayed action delivery',
        updatedAt: '2026-02-14T11:00:00.000Z',
      },
    });

    const response = await POST(
      new Request('http://localhost/api/integrations/linear/webhook', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Linear-Signature': sign(rawBody, 'webhook_secret'),
          'Linear-Delivery': 'delivery_delayed_action',
        },
        body: rawBody,
      }),
    );

    expect(response.status).toBe(200);
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
        description: '## User Story\nUpdated req\n\n## Acceptance Criteria\n- [ ] Updated AC\n\n## Status\nIn Progress',
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

    expect(admin.rpc).toHaveBeenCalledWith(
      'apply_linear_issue_writeback_with_receipt',
      expect.objectContaining({
        p_story_id: 'story_1',
        p_linear_issue_id: 'lin_1',
        p_expected_story_updated_at: '2026-02-14T10:00:00.000Z',
      }),
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ success: true, applied: true });
  });

  it('does not overwrite a local edit that lands during webhook processing', async () => {
    const admin = createWebhookAdminClient({ writebackConflict: true });
    vi.mocked(createAdminClient).mockReturnValue(admin.client as never);

    const now = new Date().toISOString();
    const rawBody = JSON.stringify({
      action: 'update',
      type: 'Issue',
      createdAt: now,
      webhookTimestamp: now,
      data: {
        id: 'lin_1',
        title: 'Remote edit',
        updatedAt: '2026-02-14T11:00:00.000Z',
      },
    });

    const response = await POST(
      new Request('http://localhost/api/integrations/linear/webhook', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Linear-Signature': sign(rawBody, 'webhook_secret'),
          'Linear-Delivery': 'delivery_concurrent_edit',
        },
        body: rawBody,
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ success: true, ignored: true });
  });

  it('handles duplicate delivery idempotently', async () => {
    const admin = createWebhookAdminClient({ duplicateProcessed: true });
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

  it('imports unlinked labeled issues into story map', async () => {
    const admin = createWebhookAdminClient({ existingLink: null });
    vi.mocked(createAdminClient).mockReturnValue(admin.client as never);
    vi.mocked(getLinearIssueTeamIdFromPayload).mockReturnValue('team_1');
    vi.mocked(getLinearIssueProjectIdFromPayload).mockReturnValue('project_1');
    vi.mocked(getLinearIssueLabelNames).mockReturnValue(['Story']);
    vi.mocked(findStoryMapImportCandidate).mockResolvedValue({
      storyMapId: 'map_1',
    });
    vi.mocked(importLinearIssueIntoStoryMap).mockResolvedValue({ storyId: 'story_imported_1', duplicate: false });

    const createdAt = new Date().toISOString();
    const rawBody = JSON.stringify({
      action: 'update',
      type: 'Issue',
      createdAt,
      webhookTimestamp: Date.now(),
      data: {
        id: 'lin_1',
        identifier: 'ENG-101',
        title: 'Imported issue',
        labels: { nodes: [{ name: 'Story' }] },
      },
    });

    const response = await POST(
      new Request('http://localhost/api/integrations/linear/webhook', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Linear-Signature': sign(rawBody, 'webhook_secret'),
          'Linear-Delivery': 'delivery_import_1',
        },
        body: rawBody,
      }),
    );

    expect(importLinearIssueIntoStoryMap).toHaveBeenCalled();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      applied: true,
      story_id: 'story_imported_1',
    });
  });

  it('imports unlinked labeled issues on restore action', async () => {
    const admin = createWebhookAdminClient({ existingLink: null });
    vi.mocked(createAdminClient).mockReturnValue(admin.client as never);
    vi.mocked(getLinearIssueTeamIdFromPayload).mockReturnValue('team_1');
    vi.mocked(getLinearIssueProjectIdFromPayload).mockReturnValue('project_1');
    vi.mocked(getLinearIssueLabelNames).mockReturnValue(['Story']);
    vi.mocked(findStoryMapImportCandidate).mockResolvedValue({
      storyMapId: 'map_1',
    });
    vi.mocked(importLinearIssueIntoStoryMap).mockResolvedValue({
      storyId: 'story_imported_restore_1',
      duplicate: false,
    });

    const createdAt = new Date().toISOString();
    const rawBody = JSON.stringify({
      action: 'restore',
      type: 'Issue',
      createdAt,
      webhookTimestamp: Date.now(),
      data: {
        id: 'lin_1',
        identifier: 'ENG-101',
        title: 'Restored issue',
        labels: [{ name: 'Story' }],
      },
    });

    const response = await POST(
      new Request('http://localhost/api/integrations/linear/webhook', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Linear-Signature': sign(rawBody, 'webhook_secret'),
          'Linear-Delivery': 'delivery_restore_1',
        },
        body: rawBody,
      }),
    );

    expect(importLinearIssueIntoStoryMap).toHaveBeenCalled();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      applied: true,
      story_id: 'story_imported_restore_1',
    });
  });

  it('hard-deletes linked story when linear issue is removed', async () => {
    const admin = createWebhookAdminClient();
    vi.mocked(createAdminClient).mockReturnValue(admin.client as never);

    const createdAt = new Date().toISOString();
    const rawBody = JSON.stringify({
      action: 'remove',
      type: 'Issue',
      createdAt,
      webhookTimestamp: Date.now(),
      data: {
        id: 'lin_1',
      },
    });

    const response = await POST(
      new Request('http://localhost/api/integrations/linear/webhook', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Linear-Signature': sign(rawBody, 'webhook_secret'),
          'Linear-Delivery': 'delivery_remove_1',
        },
        body: rawBody,
      }),
    );

    expect(admin.rpc).toHaveBeenCalledWith(
      'process_linear_issue_remove_with_receipt',
      expect.objectContaining({ p_story_id: 'story_1' }),
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      applied: true,
      story_id: 'story_1',
    });
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

    expect(admin.rpc).not.toHaveBeenCalledWith('apply_linear_issue_writeback_with_receipt', expect.anything());
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

    expect(admin.rpc).not.toHaveBeenCalledWith('apply_linear_issue_writeback_with_receipt', expect.anything());
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ success: true, ignored: true });
  });
});
