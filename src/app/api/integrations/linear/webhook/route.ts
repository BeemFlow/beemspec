import { NextResponse } from 'next/server';
import { domainRuntime } from '@/domains/runtime';
import type { LinearWebhookEvent } from '@/integrations/linear/contracts';
import { getStoryLinearLinkByLinearIssueId, upsertStoryLinearLink } from '@/integrations/linear/story-links';
import { createLinearWebhookVerifier } from '@/integrations/linear/webhook-verifier';
import { serverErrorResponse } from '@/lib/errors';
import { createAdminClient } from '@/lib/supabase/admin';

type StoryStatus = 'backlog' | 'ready' | 'in_progress' | 'review' | 'done';

interface LinearInboundPolicy {
  allowTitleWriteback: boolean;
  allowStatusWriteback: boolean;
  statusMapping: Record<string, StoryStatus>;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object') return null;
  return value as Record<string, unknown>;
}

function getString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function asBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function normalizeStatusMapping(value: unknown): Record<string, StoryStatus> {
  if (!value || typeof value !== 'object') return {};
  const record = value as Record<string, unknown>;

  const mapping: Record<string, StoryStatus> = {};
  for (const [key, raw] of Object.entries(record)) {
    if (typeof raw !== 'string') continue;
    if (!['backlog', 'ready', 'in_progress', 'review', 'done'].includes(raw)) continue;
    const normalizedKey = key.trim().toLowerCase().replaceAll(/\s+/g, '_');
    if (!normalizedKey) continue;
    mapping[normalizedKey] = raw as StoryStatus;
  }

  return mapping;
}

function mapLinearStateToStoryStatus(stateName: string | null): StoryStatus | null {
  if (!stateName) return null;
  const normalized = stateName.toLowerCase().replaceAll(/\s+/g, '_');
  if (normalized === 'in_progress') return 'in_progress';
  if (normalized === 'backlog') return 'backlog';
  if (normalized === 'ready') return 'ready';
  if (normalized === 'review') return 'review';
  if (normalized === 'done') return 'done';
  return null;
}

function extractIssueWriteback(payload: unknown): {
  linearIssueId: string;
  linearIssueIdentifier: string | null;
  title: string | null;
  linearStateId: string | null;
  linearStateName: string | null;
} | null {
  const record = asRecord(payload);
  if (!record) return null;

  const linearIssueId = getString(record.id);
  if (!linearIssueId) return null;

  return {
    linearIssueId,
    linearIssueIdentifier: getString(record.identifier),
    title: getString(record.title),
    linearStateId: getString(asRecord(record.state)?.id),
    linearStateName: getString(asRecord(record.state)?.name),
  };
}

function mapLinearStateToStoryStatusByPolicy(
  state: { id: string | null; name: string | null },
  policy: LinearInboundPolicy,
): StoryStatus | null {
  if (state.id) {
    const byId = policy.statusMapping[state.id.trim().toLowerCase()];
    if (byId) return byId;
  }

  const stateName = state.name;
  if (!stateName) return null;
  const normalized = stateName.trim().toLowerCase().replaceAll(/\s+/g, '_');
  if (!normalized) return null;

  if (policy.statusMapping[normalized]) return policy.statusMapping[normalized];
  return mapLinearStateToStoryStatus(stateName);
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
  const ingest = domainRuntime.storyMap.linearWebhookIngest;
  if (!ingest) return null;

  let event: LinearWebhookEvent;
  try {
    event = ingest.parseAndValidate({ rawBody, headers: request.headers });
  } catch {
    return null;
  }

  const verifier = createLinearWebhookVerifier();
  if (!verifier) {
    throw new Error('Linear webhook secret is not configured');
  }

  const signature = request.headers.get('Linear-Signature') ?? '';
  const verified = verifier.verify({ rawBody, signature, timestamp: event.createdAt });
  if (!verified) {
    throw new Error('Invalid signature');
  }

  return event;
}

async function getInboundPolicyForStory(
  supabase: ReturnType<typeof createAdminClient>,
  storyId: string,
): Promise<LinearInboundPolicy> {
  const { data: storyData } = await supabase
    .from('stories')
    .select('tasks!inner(activities!inner(story_maps!inner(team_id)))')
    .eq('id', storyId)
    .single();

  const teamId = (storyData as { tasks?: { activities?: { story_maps?: { team_id?: string } } } } | null)?.tasks
    ?.activities?.story_maps?.team_id;

  if (!teamId) {
    return {
      allowTitleWriteback: false,
      allowStatusWriteback: true,
      statusMapping: {},
    };
  }

  const { data: settingsData } = await supabase
    .from('integration_settings')
    .select('linear_status_mapping, linear_allow_title_writeback, linear_allow_status_writeback')
    .eq('team_id', teamId)
    .maybeSingle();

  const settings = settingsData as {
    linear_status_mapping?: unknown;
    linear_allow_title_writeback?: unknown;
    linear_allow_status_writeback?: unknown;
  } | null;

  return {
    allowTitleWriteback: asBoolean(settings?.linear_allow_title_writeback, false),
    allowStatusWriteback: asBoolean(settings?.linear_allow_status_writeback, true),
    statusMapping: normalizeStatusMapping(settings?.linear_status_mapping),
  };
}

function toStoryPatch(
  writeback: {
    title: string | null;
    linearStateId: string | null;
    linearStateName: string | null;
  },
  policy: LinearInboundPolicy,
): { title?: string; status?: StoryStatus; updated_at: string } | null {
  const patch: { title?: string; status?: StoryStatus; updated_at: string } = {
    updated_at: new Date().toISOString(),
  };

  if (policy.allowTitleWriteback && writeback.title) {
    patch.title = writeback.title;
  }

  const mappedStatus = mapLinearStateToStoryStatusByPolicy(
    {
      id: writeback.linearStateId,
      name: writeback.linearStateName,
    },
    policy,
  );
  if (policy.allowStatusWriteback && mappedStatus) {
    patch.status = mappedStatus;
  }

  if (!patch.title && !patch.status) return null;
  return patch;
}

async function processIssueEvent(
  supabase: ReturnType<typeof createAdminClient>,
  event: LinearWebhookEvent,
  writeback: {
    linearIssueId: string;
    linearIssueIdentifier: string | null;
    title: string | null;
    linearStateId: string | null;
    linearStateName: string | null;
  },
): Promise<NextResponse> {
  try {
    const link = await getStoryLinearLinkByLinearIssueId(supabase, writeback.linearIssueId);
    if (!link) {
      return persistIgnoredReceipt(supabase, event, 'No story link found for issue');
    }

    const policy = await getInboundPolicyForStory(supabase, link.storyId);
    const patch = toStoryPatch(writeback, policy);
    if (!patch) {
      return persistIgnoredReceipt(supabase, event, 'No permitted writeback fields by policy');
    }

    const { error: updateError } = await supabase.from('stories').update(patch).eq('id', link.storyId);
    if (updateError) throw updateError;

    await upsertStoryLinearLink(supabase, {
      storyId: link.storyId,
      linearIssueId: writeback.linearIssueId,
      linearIssueIdentifier: writeback.linearIssueIdentifier ?? link.linearIssueIdentifier,
    });

    const receipt = await insertWebhookReceipt(supabase, {
      idempotencyKey: event.idempotencyKey,
      type: event.type,
      action: event.action,
      payload: event.payload,
      status: 'processed',
    });

    return successResponse({ duplicate: receipt.duplicate, applied: true, storyId: link.storyId });
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

export async function POST(request: Request) {
  if (!domainRuntime.storyMap.linearWebhookIngest) {
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

  const writeback = extractIssueWriteback(event.payload);
  if (!writeback) {
    return persistIgnoredReceipt(supabase, event, 'Missing issue payload fields');
  }

  return processIssueEvent(supabase, event, writeback);
}
