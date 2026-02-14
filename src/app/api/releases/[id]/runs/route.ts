import { NextResponse } from 'next/server';
import { domainRuntime } from '@/domains/runtime';
import { serverErrorResponse } from '@/lib/errors';
import { createClient } from '@/lib/supabase/server';
import { invalidIdResponse, isValidUuid } from '@/lib/validations';

function parseLimit(url: string): number {
  const raw = new URL(url).searchParams.get('limit');
  if (!raw) return 20;
  const value = Number.parseInt(raw, 10);
  if (!Number.isFinite(value) || value <= 0) return 20;
  return Math.min(value, 100);
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await domainRuntime.storyMap.auth.requireAuth();
  if (!auth.success) return auth.response;

  const { id: releaseId } = await params;
  if (!isValidUuid(releaseId)) return invalidIdResponse();

  const limit = parseLimit(request.url);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('release_runs')
    .select(
      'id, release_id, status, total_items, completed_items, failed_items, error, started_at, finished_at, created_at',
    )
    .eq('release_id', releaseId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    return serverErrorResponse('Failed to load release runs', error);
  }

  return NextResponse.json({
    count: data?.length ?? 0,
    runs: data ?? [],
  });
}
