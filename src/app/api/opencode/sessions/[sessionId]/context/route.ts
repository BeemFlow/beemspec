import { NextResponse } from 'next/server';
import { isAuthorizedByOpenCodeToken } from '@/integrations/opencode/session';
import { serverErrorResponse } from '@/lib/errors';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET(request: Request, { params }: { params: Promise<{ sessionId: string }> }) {
  if (!isAuthorizedByOpenCodeToken(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { sessionId } = await params;
  if (!sessionId || sessionId.trim().length === 0) {
    return NextResponse.json({ error: 'Missing sessionId' }, { status: 400 });
  }

  const supabase = createAdminClient();

  // Find the build run by its session ID (session lives on the run, not items)
  const { data: run, error: runError } = await supabase
    .from('build_runs')
    .select('id, release_id')
    .eq('opencode_session_id', sessionId)
    .maybeSingle();

  if (runError) return serverErrorResponse('Failed to load build run', runError);
  if (!run) {
    return NextResponse.json({ sessionId, releaseId: null, runId: null, stories: [] });
  }

  // Load all items for this run, then join to stories for fresh data
  const { data: items, error: itemsError } = await supabase
    .from('build_run_items')
    .select('story_id')
    .eq('build_run_id', run.id as string);

  if (itemsError) return serverErrorResponse('Failed to load session items', itemsError);
  if (!items || items.length === 0) {
    return NextResponse.json({
      sessionId,
      releaseId: (run.release_id as string | null) ?? null,
      runId: run.id,
      stories: [],
    });
  }

  const storyIds = items.map((item) => item.story_id as string);
  const { data: stories, error: storiesError } = await supabase
    .from('stories')
    .select('id, title, content')
    .in('id', storyIds);

  if (storiesError) return serverErrorResponse('Failed to load stories', storiesError);

  return NextResponse.json({
    sessionId,
    releaseId: (run.release_id as string | null) ?? null,
    runId: run.id,
    stories: (stories ?? []).map((story) => {
      const content = story.content as {
        requirements?: string;
        acceptance_criteria?: string;
        technical_guidelines?: string | null;
      };
      return {
        storyId: story.id,
        storyTitle: story.title,
        requirements: content.requirements ?? '',
        acceptanceCriteria: content.acceptance_criteria ?? '',
        technicalGuidelines: content.technical_guidelines ?? null,
      };
    }),
  });
}
