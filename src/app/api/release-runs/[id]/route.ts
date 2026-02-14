import { NextResponse } from 'next/server';
import { domainRuntime } from '@/domains/runtime';
import { DbErrorCode, notFoundResponse, serverErrorResponse } from '@/lib/errors';
import { createClient } from '@/lib/supabase/server';
import { invalidIdResponse, isValidUuid } from '@/lib/validations';

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await domainRuntime.storyMap.auth.requireAuth();
  if (!auth.success) return auth.response;

  const { id: runId } = await params;
  if (!isValidUuid(runId)) return invalidIdResponse();

  const supabase = await createClient();
  const { data: run, error: runError } = await supabase
    .from('release_runs')
    .select(
      'id, release_id, status, total_items, completed_items, failed_items, error, started_at, finished_at, created_at',
    )
    .eq('id', runId)
    .single();

  if (runError) {
    if (runError.code === DbErrorCode.NOT_FOUND) return notFoundResponse('Release run');
    return serverErrorResponse('Failed to load release run', runError);
  }

  const { data: items, error: itemsError } = await supabase
    .from('release_run_items')
    .select('id, story_id, linear_issue_id, status, error, created_at, updated_at')
    .eq('release_run_id', runId)
    .order('created_at', { ascending: true });

  if (itemsError) {
    return serverErrorResponse('Failed to load release run items', itemsError);
  }

  return NextResponse.json({
    ...run,
    items: items ?? [],
  });
}
