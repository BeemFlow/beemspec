import { NextResponse } from 'next/server';
import { reconcileStoryById } from '@/app/api/integrations/linear/reconcile/route';
import { domainRuntime } from '@/domains/runtime';
import { createClient } from '@/lib/supabase/server';
import { linearReconcileBatchSchema, validateRequest } from '@/lib/validations';

function isSuccessResponseStatus(status: number): boolean {
  return status >= 200 && status < 300;
}

export async function POST(request: Request) {
  const auth = await domainRuntime.storyMap.auth.requireAuth();
  if (!auth.success) return auth.response;

  const linearIssueSync = domainRuntime.storyMap.linearIssueSync;
  if (!linearIssueSync) {
    return NextResponse.json({ error: 'Linear integration is not enabled' }, { status: 503 });
  }

  const validation = await validateRequest(request, linearReconcileBatchSchema);
  if (!validation.success) return validation.response;

  const limit = validation.data.limit ?? 25;
  const olderThanMinutes = validation.data.older_than_minutes ?? 30;
  const cutoffIso = new Date(Date.now() - olderThanMinutes * 60 * 1000).toISOString();

  const supabase = await createClient();
  const { data: links, error } = await supabase
    .from('story_linear_links')
    .select('story_id')
    .lt('last_synced_at', cutoffIso)
    .order('last_synced_at', { ascending: true })
    .limit(limit);

  if (error) {
    return NextResponse.json({ error: 'Failed to load stories for reconciliation' }, { status: 500 });
  }

  const storyIds = (links ?? []).map((row) => row.story_id as string).filter(Boolean);
  const summary = {
    considered: storyIds.length,
    succeeded: 0,
    failed: 0,
  };

  for (const storyId of storyIds) {
    try {
      const response = await reconcileStoryById({
        supabase,
        linearIssueSync,
        storyId,
      });

      if (isSuccessResponseStatus(response.status)) {
        summary.succeeded += 1;
      } else {
        summary.failed += 1;
      }
    } catch {
      summary.failed += 1;
    }
  }

  return NextResponse.json({
    success: true,
    ...summary,
  });
}
