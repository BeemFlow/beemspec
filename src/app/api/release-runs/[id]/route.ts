import { NextResponse } from 'next/server';
import { DbErrorCode, notFoundResponse, serverErrorResponse } from '@/lib/errors';
import { createClient } from '@/lib/supabase/server';
import { invalidIdResponse, isValidUuid } from '@/lib/validations';
import { runtime } from '@/runtime';

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await runtime.storyMap.auth.requireAuth();
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
    .select(
      'id, story_id, linear_issue_id, opencode_session_id, opencode_session_url, status, error, retry_count, last_retry_at, created_at, updated_at, story:stories(title, status)',
    )
    .eq('release_run_id', runId)
    .order('created_at', { ascending: true });

  if (itemsError) {
    return serverErrorResponse('Failed to load release run items', itemsError);
  }

  const itemRows = items ?? [];
  const storyIds = itemRows.map((item) => item.story_id as string).filter(Boolean);

  if (storyIds.length === 0) {
    return NextResponse.json({
      ...run,
      items: itemRows,
    });
  }

  const { data: links, error: linksError } = await supabase
    .from('story_linear_links')
    .select('story_id, linear_issue_identifier')
    .in('story_id', storyIds);

  if (linksError) {
    return serverErrorResponse('Failed to load linear issue links for run items', linksError);
  }

  const issueIdentifierByStoryId = new Map(
    (links ?? []).map((link) => [link.story_id as string, link.linear_issue_identifier as string | null]),
  );

  return NextResponse.json({
    ...run,
    items: itemRows.map((item) => ({
      ...item,
      linear_issue_identifier: issueIdentifierByStoryId.get(item.story_id as string) ?? null,
    })),
  });
}
