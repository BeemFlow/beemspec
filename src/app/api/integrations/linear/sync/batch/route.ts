import { NextResponse } from 'next/server';
import { syncStoriesByIdList } from '@/app/api/integrations/linear/sync/route';
import { getLinearIssueSync } from '@/integrations/linear/issue-sync';
import { requireAuth } from '@/lib/auth';
import { env } from '@/lib/env';
import { createClient } from '@/lib/supabase/server';
import { linearSyncBatchSchema, validateRequest } from '@/lib/validations';

function isAuthorizedByCronToken(request: Request): boolean {
  const token = env.syncCronToken();
  if (!token) return false;

  const authHeader = request.headers.get('authorization') ?? '';
  return authHeader === `Bearer ${token}`;
}

export async function POST(request: Request) {
  const usingCronToken = isAuthorizedByCronToken(request);
  if (!usingCronToken) {
    const auth = await requireAuth();
    if (!auth.success) return auth.response;
  }

  const linearIssueSync = getLinearIssueSync();

  const validation = await validateRequest(request, linearSyncBatchSchema);
  if (!validation.success) return validation.response;

  const limit = validation.data.limit ?? 25;
  const olderThanMinutes = validation.data.older_than_minutes ?? 30;
  const cutoffIso = new Date(Date.now() - olderThanMinutes * 60 * 1000).toISOString();

  const supabase = await createClient();
  let storyIds: string[];

  if (validation.data.story_ids && validation.data.story_ids.length > 0) {
    storyIds = [...new Set(validation.data.story_ids)];
  } else {
    const { data: links, error } = await supabase
      .from('story_linear_links')
      .select('story_id')
      .lt('last_synced_at', cutoffIso)
      .order('last_synced_at', { ascending: true })
      .limit(limit);

    if (error) {
      return NextResponse.json({ error: 'Failed to load stories for sync' }, { status: 500 });
    }

    storyIds = (links ?? []).map((row) => row.story_id as string).filter(Boolean);
  }

  const summary = await syncStoriesByIdList({
    supabase,
    fallbackLinearIssueSync: linearIssueSync,
    storyIds,
  });

  return NextResponse.json({
    success: true,
    considered: summary.considered,
    succeeded: summary.succeeded,
    failed: summary.failed,
  });
}
