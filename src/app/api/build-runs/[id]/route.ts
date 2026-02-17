import { NextResponse } from 'next/server';
import { refreshRunStatusFromOpenCode } from '@/build-runs/processor';
import { requireAuth } from '@/lib/auth';
import { DbErrorCode, notFoundResponse, serverErrorResponse } from '@/lib/errors';
import { createClient } from '@/lib/supabase/server';
import { invalidIdResponse, isValidUuid } from '@/lib/validations';

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth();
  if (!auth.success) return auth.response;

  const { id: runId } = await params;
  if (!isValidUuid(runId)) return invalidIdResponse();

  const supabase = await createClient();
  const { data: rawRun, error: runError } = await supabase
    .from('build_runs')
    .select(
      'id, release_id, status, total_items, completed_items, failed_items, error, working_directory, opencode_session_id, opencode_session_url, finished_at, created_at',
    )
    .eq('id', runId)
    .single();

  if (runError) {
    if (runError.code === DbErrorCode.NOT_FOUND) return notFoundResponse('Build run');
    return serverErrorResponse('Failed to load build run', runError);
  }

  const run = await refreshRunStatusFromOpenCode(supabase, {
    id: rawRun.id as string,
    status: rawRun.status as string,
    opencode_session_id: rawRun.opencode_session_id as string | null,
  });
  const runData = { ...rawRun, status: run.status };

  const { data: items, error: itemsError } = await supabase
    .from('build_run_items')
    .select(
      'id, story_id, linear_issue_id, status, error, retry_count, last_retry_at, created_at, updated_at, story:stories(title, status)',
    )
    .eq('build_run_id', runId)
    .order('created_at', { ascending: true });

  if (itemsError) {
    return serverErrorResponse('Failed to load build run items', itemsError);
  }

  const itemRows = items ?? [];
  const storyIds = itemRows.map((item) => item.story_id as string).filter(Boolean);

  if (storyIds.length === 0) {
    return NextResponse.json({
      ...runData,
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
    ...runData,
    items: itemRows.map((item) => ({
      ...item,
      linear_issue_identifier: issueIdentifierByStoryId.get(item.story_id as string) ?? null,
    })),
  });
}
