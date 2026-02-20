import { NextResponse } from 'next/server';
import { getStoryLinearLinkByLinearIssueId, upsertStoryLinearLink } from '@/integrations/linear/story-links';
import {
  buildStoryPatchFromLinearIssue,
  hasMutableStoryFields,
  shouldApplyRemoteUpdate,
} from '@/integrations/linear/sync';
import type { LinearWebhookEvent } from '@/integrations/linear/types';
import { createLinearWebhookSignatureVerifier, getLinearWebhookIngest } from '@/integrations/linear/webhook-ingest';
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
  event: LinearWebhookEvent,
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

function isSupportedIssueEvent(event: LinearWebhookEvent): boolean {
  return event.type === 'Issue' && ['create', 'update'].includes(event.action);
}

function parseAndVerifyEvent(request: Request, rawBody: string): LinearWebhookEvent | null {
  const ingest = getLinearWebhookIngest();
  if (!ingest) return null;

  let event: LinearWebhookEvent;
  try {
    event = ingest.parseAndValidate({ rawBody, headers: request.headers });
  } catch {
    return null;
  }

  const verifier = createLinearWebhookSignatureVerifier();
  if (!verifier) {
    throw new Error('Linear webhook secret is not configured');
  }

  const signature = request.headers.get('Linear-Signature') ?? '';
  const verified = verifier.verify({ rawBody, signature, timestamp: event.createdAt });
  if (!verified) throw new Error('Invalid signature');
  return event;
}

async function processIssueEvent(
  supabase: ReturnType<typeof createAdminClient>,
  event: LinearWebhookEvent,
): Promise<NextResponse> {
  const payload = asRecord(event.payload);
  const linearIssueId = getString(payload?.id);
  if (!linearIssueId) {
    return persistIgnoredReceipt(supabase, event, 'Missing issue id');
  }

  const link = await getStoryLinearLinkByLinearIssueId(supabase, linearIssueId);
  if (!link) {
    return persistIgnoredReceipt(supabase, event, 'No story link found for issue');
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
    return persistIgnoredReceipt(supabase, event, 'Ignored stale remote update (local is newer)');
  }

  const patch = buildStoryPatchFromLinearIssue({
    title: getString(payload?.title),
    description: getString(payload?.description),
    stateName: getString(asRecord(payload?.state)?.name),
    updatedAt: remoteUpdatedAt,
  });
  if (!hasMutableStoryFields(patch)) {
    return persistIgnoredReceipt(supabase, event, 'No supported fields for writeback');
  }

  // Build the DB update: scalar fields + merge content patch into existing content
  const dbUpdate: Record<string, unknown> = { updated_at: patch.updated_at };
  if (patch.title) dbUpdate.title = patch.title;
  if (patch.status) dbUpdate.status = patch.status;

  if (patch.content) {
    // Load current content to merge
    const { data: currentStory } = await supabase.from('stories').select('content').eq('id', link.storyId).single();
    const currentContent = (currentStory?.content as Record<string, unknown>) ?? {
      _version: 1,
      requirements: '',
      acceptance_criteria: '',
    };
    dbUpdate.content = { ...currentContent, ...patch.content };
  }

  const { error: updateError } = await supabase.from('stories').update(dbUpdate).eq('id', link.storyId);
  if (updateError) throw updateError;

  await upsertStoryLinearLink(supabase, {
    storyId: link.storyId,
    linearIssueId,
    linearIssueIdentifier: getString(payload?.identifier) ?? link.linearIssueIdentifier,
    lastLocalUpdatedAt: remoteUpdatedAt,
    lastLinearUpdatedAt: remoteUpdatedAt,
  });

  const receipt = await insertWebhookReceipt(supabase, {
    idempotencyKey: event.idempotencyKey,
    type: event.type,
    action: event.action,
    payload: event.payload,
    status: 'processed',
  });
  return successResponse({ duplicate: receipt.duplicate, applied: true, storyId: link.storyId });
}

export async function POST(request: Request) {
  if (!getLinearWebhookIngest()) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const rawBody = await request.text();
  let event: LinearWebhookEvent;

  try {
    const parsed = parseAndVerifyEvent(request, rawBody);
    if (!parsed) {
      return NextResponse.json({ error: 'Invalid webhook payload' }, { status: 400 });
    }
    event = parsed;
  } catch (error) {
    if (error instanceof Error && error.message === 'Invalid signature') {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }
    return serverErrorResponse('Linear webhook secret is not configured');
  }

  const supabase = createAdminClient();
  if (!isSupportedIssueEvent(event)) {
    return persistIgnoredReceipt(supabase, event);
  }

  try {
    return await processIssueEvent(supabase, event);
  } catch (error) {
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
