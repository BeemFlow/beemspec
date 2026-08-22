import { NextResponse } from 'next/server';
import { processLinearSyncBatch } from '@/integrations/linear/jobs';
import { env } from '@/lib/env';

export async function POST(request: Request) {
  const secret = env.integrationSyncSecret();
  if (!secret) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  if (request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const summary = await processLinearSyncBatch({ limit: 25 });
  return NextResponse.json({ success: true, ...summary });
}
