import { NextResponse } from 'next/server';
import { BUILD_RUN_STATUS, type BuildRunStatus } from '@/build-runs/constants';
import { requireAuth } from '@/lib/auth';
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

function parseStatus(url: string): BuildRunStatus | null {
  const raw = new URL(url).searchParams.get('status');
  if (!raw) return null;
  const values = Object.values(BUILD_RUN_STATUS);
  if (values.includes(raw as BuildRunStatus)) return raw as BuildRunStatus;
  return null;
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth();
  if (!auth.success) return auth.response;

  const { id: releaseId } = await params;
  if (!isValidUuid(releaseId)) return invalidIdResponse();

  const limit = parseLimit(request.url);
  const offset = parseOffset(request.url);
  const status = parseStatus(request.url);
  const supabase = await createClient();
  let query = supabase
    .from('build_runs')
    .select(
      'id, release_id, status, total_items, completed_items, failed_items, error, opencode_session_id, opencode_session_url, finished_at, created_at',
    )
    .eq('release_id', releaseId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (status) query = query.eq('status', status);

  const { data, error } = await query;

  if (error) {
    return serverErrorResponse('Failed to load build runs', error);
  }

  return NextResponse.json({
    limit,
    offset,
    next_offset: (data?.length ?? 0) === limit ? offset + limit : null,
    count: data?.length ?? 0,
    runs: data ?? [],
  });
}
