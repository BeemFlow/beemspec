import { buildStoryPatchFromLinearIssue, mapLinearStateToStoryStatus } from '@beemspec/linear';
import { NextResponse } from 'next/server';
import { getLinearWebhookIngest, getLinearWebhookSignatureVerifier } from '@/integrations/linear/helpers';
import { findStoryMapImportCandidate, importLinearIssueIntoStoryMap } from '@/integrations/linear/import';
import {
  getLinearIssueLabelNames,
  getLinearIssueProjectIdFromPayload,
  getLinearIssueTeamIdFromPayload,
} from '@/integrations/linear/label-sync';
import { getSyncTargetForStory } from '@/integrations/linear/settings';
import { getStoryLinearLinkByLinearIssueId, upsertStoryLinearLink } from '@/integrations/linear/story-links';
import type { WebhookEvent } from '@/integrations/sync';
import { buildDbUpdateFromPatch, hasMutableStoryFields, shouldApplyRemoteUpdate } from '@/integrations/sync';
import { serverErrorResponse } from '@/lib/errors';
import { createAdminClient } from '@/lib/supabase/admin';

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object') return null;
  return value as Record<string, unknown>;
}

function getString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function logLinearWebhook(level: 'info' | 'warn' | 'error', message: string, data: Record<string, unknown>) {
  // biome-ignore lint/suspicious/noConsole: structured operational logs for webhook observability
  const logger = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
  logger('[linear-webhook]', message, data);
}

function successResponse(input: {
  duplicate?: boolean;
  ignored?: boolean;
  applied?: boolean;
  storyId?: string;
}): NextResponse {
  if (input.duplicate) return NextResponse.json({ success: true, duplicate: true });
  if (input.ignored) return NextResponse.json({ success: true, ignored: true });
  if (input.applied && input.storyId) {
    return NextResponse.json({
      success: true,
      applied: true,
      story_id: input.storyId,
    });
  }
  return NextResponse.json({ success: true });
}

async function insertWebhookReceipt(
  supabase: ReturnType<typeof createAdminClient>,
  input: {
    idempotencyKey: string;
    type: string;
    action: string;
    payload: unknown;
    status: 'processed' | 'ignored' | 'failed';
    error?: string;
  },
): Promise<{ duplicate: boolean }> {
  const { error } = await supabase.from('integration_webhook_receipts').insert({
    provider: 'linear',
    idempotency_key: input.idempotencyKey,
    event_type: input.type,
    event_action: input.action,
    status: input.status,
    error: input.error ?? null,
    payload: input.payload,
  });

  if (!error) return { duplicate: false };
  const code = typeof error === 'object' && error && 'code' in error ? String(error.code) : '';
  if (code === '23505') return { duplicate: true };
  throw error;
}

async function persistIgnoredReceipt(
  supabase: ReturnType<typeof createAdminClient>,
  event: WebhookEvent,
  error?: string,
): Promise<NextResponse> {
  const receipt = await insertWebhookReceipt(supabase, {
    idempotencyKey: event.idempotencyKey,
    type: event.type,
    action: event.action,
    payload: event.payload,
    status: 'ignored',
    error,
  });

  return successResponse({ duplicate: receipt.duplicate, ignored: true });
}

function isSupportedIssueEvent(event: WebhookEvent): boolean {
  return event.type === 'Issue' && ['create', 'update', 'remove', 'restore'].includes(event.action);
}

function parseAndVerifyEvent(request: Request, rawBody: string): WebhookEvent | null {
  const ingest = getLinearWebhookIngest();
  if (!ingest) return null;

  let event: WebhookEvent;
  try {
    event = ingest.parseAndValidate({ rawBody, headers: request.headers });
  } catch {
    return null;
  }

  const verifier = getLinearWebhookSignatureVerifier();
  if (!verifier) {
    throw new Error('Linear webhook secret is not configured');
  }

  const signature = request.headers.get('Linear-Signature') ?? '';
  const verified = verifier.verify({ rawBody, signature, timestamp: event.createdAt });
  if (!verified) throw new Error('Invalid signature');
  return event;
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: webhook event orchestration is intentionally centralized
async function processIssueEvent(
  supabase: ReturnType<typeof createAdminClient>,
  event: WebhookEvent,
): Promise<NextResponse> {
  const payload = asRecord(event.payload);
  const linearIssueId = getString(payload?.id);
  const teamId = getLinearIssueTeamIdFromPayload(payload);
  const projectId = getLinearIssueProjectIdFromPayload(payload);
  const labelNames = getLinearIssueLabelNames(payload);

  logLinearWebhook('info', 'received_issue_event', {
    delivery_id: event.idempotencyKey,
    action: event.action,
    type: event.type,
    issue_id: linearIssueId,
    team_id: teamId,
    project_id: projectId,
    labels: labelNames,
  });

  if (!linearIssueId) {
    logLinearWebhook('warn', 'ignored_missing_issue_id', {
      delivery_id: event.idempotencyKey,
      action: event.action,
      type: event.type,
    });
    return persistIgnoredReceipt(supabase, event, 'Missing issue id');
  }

  const link = await getStoryLinearLinkByLinearIssueId(supabase, linearIssueId);

  if (event.action === 'remove') {
    if (!link) {
      logLinearWebhook('info', 'ignored_remove_without_link', {
        delivery_id: event.idempotencyKey,
        issue_id: linearIssueId,
      });
      return persistIgnoredReceipt(supabase, event, 'No story link found for removed issue');
    }

    const { data: removeResult, error: removeError } = await supabase
      .rpc('process_linear_issue_remove_with_receipt', {
        p_story_id: link.storyId,
        p_idempotency_key: event.idempotencyKey,
        p_event_type: event.type,
        p_event_action: event.action,
        p_payload: event.payload,
      })
      .single<{ duplicate: boolean }>();
    if (removeError) throw removeError;

    logLinearWebhook('info', 'deleted_story_from_removed_issue', {
      delivery_id: event.idempotencyKey,
      issue_id: linearIssueId,
      story_id: link.storyId,
    });

    return successResponse({ duplicate: removeResult?.duplicate ?? false, applied: true, storyId: link.storyId });
  }

  if (!link) {
    if (!teamId) {
      logLinearWebhook('warn', 'ignored_missing_team_id_unlinked', {
        delivery_id: event.idempotencyKey,
        issue_id: linearIssueId,
      });
      return persistIgnoredReceipt(supabase, event, 'Missing team id for unlinked issue import');
    }

    if (labelNames.length === 0) {
      logLinearWebhook('info', 'ignored_unlinked_without_labels', {
        delivery_id: event.idempotencyKey,
        issue_id: linearIssueId,
      });
      return persistIgnoredReceipt(supabase, event, 'No story link found for issue');
    }

    const candidate = await findStoryMapImportCandidate(supabase, {
      teamId,
      linearProjectId: projectId,
      labelNames,
    });

    if (!candidate) {
      logLinearWebhook('info', 'ignored_no_import_candidate', {
        delivery_id: event.idempotencyKey,
        issue_id: linearIssueId,
        team_id: teamId,
        project_id: projectId,
        labels: labelNames,
      });
      return persistIgnoredReceipt(supabase, event, 'No matching story map import candidate for labeled issue');
    }

    const imported = await importLinearIssueIntoStoryMap({
      supabase,
      storyMapId: candidate.storyMapId,
      linearIssueId,
      linearIssueIdentifier: getString(payload?.identifier),
      title: getString(payload?.title),
      description: getString(payload?.description),
      stateName: getString(asRecord(payload?.state)?.name),
      updatedAt: getString(payload?.updatedAt) ?? event.createdAt,
    });

    const receipt = await insertWebhookReceipt(supabase, {
      idempotencyKey: event.idempotencyKey,
      type: event.type,
      action: event.action,
      payload: event.payload,
      status: 'processed',
    });

    logLinearWebhook('info', 'imported_unlinked_issue', {
      delivery_id: event.idempotencyKey,
      issue_id: linearIssueId,
      story_id: imported.storyId,
      story_map_id: candidate.storyMapId,
    });

    return successResponse({ duplicate: receipt.duplicate, applied: true, storyId: imported.storyId });
  }

  const { data: story, error: storyError } = await supabase
    .from('stories')
    .select('id, updated_at')
    .eq('id', link.storyId)
    .single();
  if (storyError || !story) {
    throw storyError ?? new Error('Story not found for linked issue');
  }

  const remoteUpdatedAt = getString(payload?.updatedAt) ?? event.createdAt;
  const localUpdatedAt = getString((story as Record<string, unknown>).updated_at);
  if (!shouldApplyRemoteUpdate(remoteUpdatedAt, localUpdatedAt)) {
    await upsertStoryLinearLink(supabase, {
      storyId: link.storyId,
      linearIssueId,
      linearIssueIdentifier: getString(payload?.identifier) ?? link.linearIssueIdentifier,
      lastLocalUpdatedAt: localUpdatedAt,
      lastLinearUpdatedAt: remoteUpdatedAt,
    });
    logLinearWebhook('info', 'ignored_stale_remote_update', {
      delivery_id: event.idempotencyKey,
      issue_id: linearIssueId,
      story_id: link.storyId,
      remote_updated_at: remoteUpdatedAt,
      local_updated_at: localUpdatedAt,
    });
    return persistIgnoredReceipt(supabase, event, 'Ignored stale remote update (local is newer)');
  }

  const patch = buildStoryPatchFromLinearIssue({
    title: getString(payload?.title),
    description: getString(payload?.description),
    stateName: getString(asRecord(payload?.state)?.name),
    updatedAt: remoteUpdatedAt,
  });

  const syncTarget = await getSyncTargetForStory(supabase, link.storyId);
  const mappedStatus = mapLinearStateToStoryStatus({
    stateId: getString(asRecord(payload?.state)?.id),
    stateName: getString(asRecord(payload?.state)?.name),
    statusMapping: syncTarget?.statusMapping,
  });
  if (mappedStatus) patch.status = mappedStatus;

  if (!hasMutableStoryFields(patch)) {
    logLinearWebhook('info', 'ignored_no_mutable_fields', {
      delivery_id: event.idempotencyKey,
      issue_id: linearIssueId,
      story_id: link.storyId,
    });
    return persistIgnoredReceipt(supabase, event, 'No supported fields for writeback');
  }

  // Load current content for merge (only needed if patch has content fields)
  let currentContent = null;
  if (patch.content) {
    const { data: currentStory } = await supabase.from('stories').select('content').eq('id', link.storyId).single();
    currentContent = currentStory?.content ?? null;
  }
  const dbUpdate = buildDbUpdateFromPatch(patch, currentContent);

  const { data: writebackResult, error: writebackError } = await supabase
    .rpc('apply_linear_issue_writeback_with_receipt', {
      p_story_id: link.storyId,
      p_linear_issue_id: linearIssueId,
      p_linear_issue_identifier: getString(payload?.identifier) ?? link.linearIssueIdentifier,
      p_last_local_updated_at: remoteUpdatedAt,
      p_last_linear_updated_at: remoteUpdatedAt,
      p_story_updated_at: String(dbUpdate.updated_at),
      p_story_title: typeof dbUpdate.title === 'string' ? dbUpdate.title : null,
      p_story_status: typeof dbUpdate.status === 'string' ? dbUpdate.status : null,
      p_story_content:
        dbUpdate.content && typeof dbUpdate.content === 'object' ? (dbUpdate.content as Record<string, unknown>) : null,
      p_idempotency_key: event.idempotencyKey,
      p_event_type: event.type,
      p_event_action: event.action,
      p_payload: event.payload,
    })
    .single<{ duplicate: boolean }>();
  if (writebackError) throw writebackError;

  logLinearWebhook('info', 'applied_issue_writeback', {
    delivery_id: event.idempotencyKey,
    issue_id: linearIssueId,
    story_id: link.storyId,
  });
  return successResponse({ duplicate: writebackResult?.duplicate ?? false, applied: true, storyId: link.storyId });
}

export async function POST(request: Request) {
  if (!getLinearWebhookIngest()) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const rawBody = await request.text();
  let event: WebhookEvent;

  try {
    const parsed = parseAndVerifyEvent(request, rawBody);
    if (!parsed) {
      logLinearWebhook('warn', 'invalid_webhook_payload', {
        linear_event: request.headers.get('Linear-Event') ?? null,
        linear_delivery: request.headers.get('Linear-Delivery') ?? null,
      });
      return NextResponse.json({ error: 'Invalid webhook payload' }, { status: 400 });
    }
    event = parsed;
  } catch (error) {
    if (error instanceof Error && error.message === 'Invalid signature') {
      logLinearWebhook('warn', 'invalid_signature', {
        linear_event: request.headers.get('Linear-Event') ?? null,
        linear_delivery: request.headers.get('Linear-Delivery') ?? null,
      });
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }
    return serverErrorResponse('Linear webhook secret is not configured');
  }

  const supabase = createAdminClient();
  if (!isSupportedIssueEvent(event)) {
    logLinearWebhook('info', 'ignored_unsupported_event', {
      delivery_id: event.idempotencyKey,
      action: event.action,
      type: event.type,
    });
    return persistIgnoredReceipt(supabase, event);
  }

  try {
    return await processIssueEvent(supabase, event);
  } catch (error) {
    logLinearWebhook('error', 'failed_processing_webhook', {
      delivery_id: event.idempotencyKey,
      action: event.action,
      type: event.type,
      error: error instanceof Error ? error.message : 'unknown_error',
    });
    try {
      await insertWebhookReceipt(supabase, {
        idempotencyKey: event.idempotencyKey,
        type: event.type,
        action: event.action,
        payload: event.payload,
        status: 'failed',
        error: error instanceof Error ? error.message : 'Webhook processing failed',
      });
    } catch {}
    return serverErrorResponse('Failed to process Linear webhook', error);
  }
}
