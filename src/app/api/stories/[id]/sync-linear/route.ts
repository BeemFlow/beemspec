import { NextResponse } from 'next/server';
import { isLinearSyncAvailableForStoryMap } from '@/integrations/linear/auth';
import { getLinearIssueSync } from '@/integrations/linear/helpers';
import { processStoryLinearSyncById } from '@/integrations/linear/sync-story-by-id';
import { requireAuth } from '@/lib/auth';
import { serverErrorResponse } from '@/lib/errors';
import { createClient } from '@/lib/supabase/server';
import { invalidIdResponse, isValidUuid } from '@/lib/validations';
import { loadStoryWithStoryMap } from '@/storymap/story-context';

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth();
  if (!auth.success) return auth.response;

  const linearIssueSync = getLinearIssueSync();

  const { id: storyId } = await params;
  if (!isValidUuid(storyId)) return invalidIdResponse();

  const supabase = await createClient();
  const context = await loadStoryWithStoryMap(supabase, storyId);
  if (!context.ok) {
    if (context.reason === 'story_not_found') return NextResponse.json({ error: 'Story not found' }, { status: 404 });
    if (context.reason === 'story_task_not_found') {
      return serverErrorResponse('Failed to resolve story task', context.error ?? new Error('Task not found'));
    }
    return serverErrorResponse(
      'Failed to resolve story map for story',
      context.error ?? new Error('Activity not found'),
    );
  }

  const linearSyncEnabled = await isLinearSyncAvailableForStoryMap(supabase, {
    storyMapId: context.data.storyMapId,
    fallbackIssueSync: linearIssueSync,
  });
  if (!linearSyncEnabled) {
    return NextResponse.json({ error: 'Linear integration is not enabled' }, { status: 503 });
  }

  try {
    const linearIssue = await processStoryLinearSyncById(supabase, {
      storyId,
      linearIssueSync,
    });

    return NextResponse.json({
      story_id: storyId,
      status: 'synced',
      linear_issue_id: linearIssue.id,
      linear_issue_identifier: linearIssue.identifier,
    });
  } catch (error) {
    return serverErrorResponse('Failed to sync story to Linear', error);
  }
}
