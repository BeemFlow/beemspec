import { NextResponse } from 'next/server';
import { syncStoriesByIdList } from '@/app/api/integrations/linear/sync/route';
import { getLinearIssueSync } from '@/integrations/linear/helpers';
import { requireAuth } from '@/lib/auth';
import { serverErrorResponse } from '@/lib/errors';
import { createClient } from '@/lib/supabase/server';
import { invalidIdResponse, isValidUuid } from '@/lib/validations';

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth();
  if (!auth.success) return auth.response;

  const { id: storyMapId } = await params;
  if (!isValidUuid(storyMapId)) return invalidIdResponse();

  const supabase = await createClient();

  const { data: tasks, error: tasksError } = await supabase
    .from('tasks')
    .select('id, activities!inner(story_map_id)')
    .eq('activities.story_map_id', storyMapId);

  if (tasksError) return serverErrorResponse('Failed to load tasks for story map sync', tasksError);

  const taskIds = (tasks ?? []).map((row) => row.id as string).filter(Boolean);
  if (taskIds.length === 0) {
    return NextResponse.json({ success: true, considered: 0, succeeded: 0, failed: 0 });
  }

  const { data: stories, error: storiesError } = await supabase.from('stories').select('id').in('task_id', taskIds);

  if (storiesError) return serverErrorResponse('Failed to load stories for story map sync', storiesError);

  const storyIds = [...new Set((stories ?? []).map((row) => row.id as string).filter(Boolean))];
  if (storyIds.length === 0) {
    return NextResponse.json({ success: true, considered: 0, succeeded: 0, failed: 0 });
  }

  const summary = await syncStoriesByIdList({
    supabase,
    fallbackIssueSync: getLinearIssueSync(),
    storyIds,
  });

  return NextResponse.json({
    success: true,
    considered: summary.considered,
    succeeded: summary.succeeded,
    failed: summary.failed,
  });
}
