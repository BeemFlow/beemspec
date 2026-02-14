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
    .from('integration_webhook_receipts')
    .select('id, event_type, event_action, error, received_at, processed_at')
    .eq('provider', 'linear')
    .eq('status', 'failed')
    .order('received_at', { ascending: false })
    .limit(limit);

  if (error) {
    return NextResponse.json({ error: 'Failed to load failed webhook receipts' }, { status: 500 });
  }

  return NextResponse.json({
    count: data?.length ?? 0,
    receipts: data ?? [],
  });
}
