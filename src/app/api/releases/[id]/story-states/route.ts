import { NextResponse } from 'next/server';
import type { BuildRunItemStatus, BuildRunStatus } from '@/build-runs/constants';
import { requireAuth } from '@/lib/auth';
import { serverErrorResponse } from '@/lib/errors';
import { createClient } from '@/lib/supabase/server';
import { invalidIdResponse, isValidUuid } from '@/lib/validations';

type Supabase = Awaited<ReturnType<typeof createClient>>;

interface StoryStateRow {
  story_id: string;
  run_id: string;
  run_status: BuildRunStatus | 'unknown';
  item_status: BuildRunItemStatus;
  item_error: string | null;
  linear_issue_id: string | null;
  opencode_session_url: string | null;
  retry_count: number;
  last_retry_at: string | null;
  created_at: string;
}

async function loadReleaseStories(supabase: Supabase, releaseId: string) {
  return supabase
    .from('stories')
    .select('id, title, status')
    .eq('release_id', releaseId)
    .order('sort_order', { ascending: true });
}

async function loadBuildRunItems(supabase: Supabase, releaseId: string) {
  return supabase
    .from('build_run_items')
    .select(
      'story_id, build_run_id, status, error, linear_issue_id, retry_count, last_retry_at, created_at, run:build_runs!inner(id, release_id, status, opencode_session_url)',
    )
    .eq('run.release_id', releaseId)
    .order('created_at', { ascending: false });
}

function latestByStory(items: Array<Record<string, unknown>>): Map<string, StoryStateRow> {
  const map = new Map<string, StoryStateRow>();

  for (const item of items) {
    const storyId = item.story_id as string;
    if (!storyId || map.has(storyId)) continue;

    const run = item.run as { id?: string; status?: string; opencode_session_url?: string } | null;
    const runStatus = run?.status;
    map.set(storyId, {
      story_id: storyId,
      run_id: run?.id ?? '',
      run_status:
        runStatus === 'queued' || runStatus === 'running' || runStatus === 'completed' || runStatus === 'failed'
          ? runStatus
          : 'unknown',
      item_status: item.status as BuildRunItemStatus,
      item_error: (item.error as string | null) ?? null,
      linear_issue_id: (item.linear_issue_id as string | null) ?? null,
      opencode_session_url: (run?.opencode_session_url as string | null) ?? null,
      retry_count: (item.retry_count as number) ?? 0,
      last_retry_at: (item.last_retry_at as string | null) ?? null,
      created_at: item.created_at as string,
    });
  }

  return map;
}

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth();
  if (!auth.success) return auth.response;

  const { id: releaseId } = await params;
  if (!isValidUuid(releaseId)) return invalidIdResponse();

  const supabase = await createClient();

  const { data: stories, error: storiesError } = await loadReleaseStories(supabase, releaseId);
  if (storiesError) return serverErrorResponse('Failed to load release stories', storiesError);

  const { data: items, error: itemsError } = await loadBuildRunItems(supabase, releaseId);
  if (itemsError) return serverErrorResponse('Failed to load build run items', itemsError);

  const latest = latestByStory((items ?? []) as Array<Record<string, unknown>>);

  return NextResponse.json({
    story_states: (stories ?? []).map((story) => ({
      story_id: story.id,
      story_title: story.title,
      story_status: story.status,
      latest_run: latest.get(story.id) ?? null,
    })),
  });
}
