import { NextResponse } from 'next/server';
import { dispatchQueuedBuildRunJobs } from '@/build-runs/queue';
import { env } from '@/lib/env';
import { serverErrorResponse } from '@/lib/errors';
import { createClient } from '@/lib/supabase/server';
import { runtime } from '@/runtime';

function isAuthorizedByWorkerToken(request: Request): boolean {
  const token = env.workerToken();
  if (!token) return false;
  return request.headers.get('authorization') === `Bearer ${token}`;
}

function parseLimit(request: Request): number {
  const value = Number.parseInt(new URL(request.url).searchParams.get('limit') ?? '5', 10);
  if (!Number.isFinite(value) || value <= 0) return 5;
  return Math.min(value, 25);
}

export async function POST(request: Request) {
  if (!isAuthorizedByWorkerToken(request)) {
    const auth = await runtime.storyMap.auth.requireAuth();
    if (!auth.success) return auth.response;
  }

  const supabase = await createClient();
  try {
    const summary = await dispatchQueuedBuildRunJobs(supabase, {
      limit: parseLimit(request),
      openCodeSessions: runtime.storyMap.openCodeSessions,
    });
    return NextResponse.json({ ok: true, ...summary });
  } catch (error) {
    return serverErrorResponse('Failed to dispatch build-run jobs', error);
  }
}
