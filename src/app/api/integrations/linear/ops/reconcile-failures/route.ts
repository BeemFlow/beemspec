import { NextResponse } from 'next/server';
import { domainRuntime } from '@/domains/runtime';
import { createAdminClient } from '@/lib/supabase/admin';

function parseLimit(url: string): number {
  const raw = new URL(url).searchParams.get('limit');
  if (!raw) return 50;
  const value = Number.parseInt(raw, 10);
  if (!Number.isFinite(value) || value <= 0) return 50;
  return Math.min(value, 200);
}

export async function GET(request: Request) {
  const auth = await domainRuntime.storyMap.auth.requireAuth();
  if (!auth.success) return auth.response;

  const limit = parseLimit(request.url);
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from('story_linear_links')
    .select('story_id, linear_issue_id, sync_state, sync_error, last_synced_at, updated_at')
    .eq('sync_state', 'error')
    .order('updated_at', { ascending: false })
    .limit(limit);

  if (error) {
    return NextResponse.json({ error: 'Failed to load reconcile failures' }, { status: 500 });
  }

  return NextResponse.json({
    count: data?.length ?? 0,
    links: data ?? [],
  });
}
