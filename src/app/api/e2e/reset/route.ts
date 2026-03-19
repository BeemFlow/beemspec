import { NextResponse } from 'next/server';
import { resetE2EProcessFlowStore } from '@/lib/e2e/test-store';
import { env } from '@/lib/env';

export async function POST(request: Request) {
  if (!env.e2eTestMode()) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const scenario = new URL(request.url).searchParams.get('scenario');
  resetE2EProcessFlowStore(scenario === 'malformed' ? 'malformed' : 'default');
  return NextResponse.json({ ok: true });
}
