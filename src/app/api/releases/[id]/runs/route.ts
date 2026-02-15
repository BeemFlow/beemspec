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

function parseOffset(url: string): number {
  const raw = new URL(url).searchParams.get('offset');
  if (!raw) return 0;
  const value = Number.parseInt(raw, 10);
  if (!Number.isFinite(value) || value < 0) return 0;
  return value;
}

function parseStatus(url: string): 'queued' | 'running' | 'completed' | 'failed' | null {
  const raw = new URL(url).searchParams.get('status');
  if (!raw) return null;
  if (raw === 'queued' || raw === 'running' || raw === 'completed' || raw === 'failed') return raw;
  return null;
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await domainRuntime.storyMap.auth.requireAuth();
  if (!auth.success) return auth.response;

  const { id: releaseId } = await params;
  if (!isValidUuid(releaseId)) return invalidIdResponse();

  const limit = parseLimit(request.url);
  const offset = parseOffset(request.url);
  const status = parseStatus(request.url);
  const supabase = await createClient();
  let query = supabase
    .from('release_runs')
    .select(
      'id, release_id, status, total_items, completed_items, failed_items, error, started_at, finished_at, created_at',
    )
    .eq('release_id', releaseId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (status) query = query.eq('status', status);

  const { data, error } = await query;

  if (error) {
    return serverErrorResponse('Failed to load release runs', error);
  }

  return NextResponse.json({
    limit,
    offset,
    next_offset: (data?.length ?? 0) === limit ? offset + limit : null,
    count: data?.length ?? 0,
    runs: data ?? [],
  });
}
