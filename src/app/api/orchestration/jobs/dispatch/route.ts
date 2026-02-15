import { NextResponse } from 'next/server';
import { domainRuntime } from '@/domains/runtime';
import { serverErrorResponse } from '@/lib/errors';
import { createClient } from '@/lib/supabase/server';
import { dispatchQueuedReleaseBuildJobs } from '@/orchestration/release-runner/jobs';

function isAuthorizedByWorkerToken(request: Request): boolean {
  const token = process.env.BEEMSPEC_RELEASE_WORKER_TOKEN;
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
    const auth = await domainRuntime.storyMap.auth.requireAuth();
    if (!auth.success) return auth.response;
  }

  const linearIssueSync = domainRuntime.storyMap.linearIssueSync;
  if (!linearIssueSync) return NextResponse.json({ error: 'Linear integration is not enabled' }, { status: 503 });

  const supabase = await createClient();
  try {
    const summary = await dispatchQueuedReleaseBuildJobs(supabase, {
      limit: parseLimit(request),
      linearIssueSync,
      openCodeSessions: domainRuntime.storyMap.openCodeSessions,
    });
    return NextResponse.json({ ok: true, ...summary });
  } catch (error) {
    return serverErrorResponse('Failed to dispatch orchestration jobs', error);
  }
}
