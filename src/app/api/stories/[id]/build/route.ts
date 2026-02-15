import { NextResponse } from 'next/server';
import { domainRuntime } from '@/domains/runtime';
import { getLinearStorySyncTargetForStoryMap } from '@/integrations/linear/settings';
import type { OpenCodeSessionPort } from '@/integrations/opencode/contracts';
import { serverErrorResponse } from '@/lib/errors';
import { createClient } from '@/lib/supabase/server';
import { invalidIdResponse, isValidUuid } from '@/lib/validations';
import { syncStoryRunItem } from '@/orchestration/release-runner/story-item';

type Supabase = Awaited<ReturnType<typeof createClient>>;

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message ? error.message : 'Story build failed';
}

async function loadStoryContext(supabase: Supabase, storyId: string) {
  const { data: story, error: storyError } = await supabase.from('stories').select('*').eq('id', storyId).single();
  if (storyError || !story)
    return { response: NextResponse.json({ error: 'Story not found' }, { status: 404 }), data: null };
  if (!story.release_id) {
    return {
      response: NextResponse.json({ error: 'Story is not assigned to a release' }, { status: 400 }),
      data: null,
    };
  }

  const { data: task, error: taskError } = await supabase
    .from('tasks')
    .select('activity_id')
    .eq('id', story.task_id)
    .single();
  if (taskError || !task) {
    return {
      response: serverErrorResponse('Failed to resolve story task', taskError ?? new Error('Task not found')),
      data: null,
    };
  }

  const { data: activity, error: activityError } = await supabase
    .from('activities')
    .select('story_map_id')
    .eq('id', task.activity_id)
    .single();
  if (activityError || !activity) {
    return {
      response: serverErrorResponse(
        'Failed to resolve story map for story',
        activityError ?? new Error('Activity not found'),
      ),
      data: null,
    };
  }

  return { response: null, data: { story, storyMapId: activity.story_map_id as string } };
}

async function createRun(supabase: Supabase, input: { releaseId: string; storyMapId: string; userId: string }) {
  return supabase
    .from('release_runs')
    .insert({
      release_id: input.releaseId,
      story_map_id: input.storyMapId,
      triggered_by: input.userId,
      status: 'running',
      total_items: 1,
      completed_items: 0,
      failed_items: 0,
      started_at: new Date().toISOString(),
    })
    .select('id')
    .single();
}

async function finishRun(supabase: Supabase, runId: string, status: 'completed' | 'failed', error: string | null) {
  return supabase
    .from('release_runs')
    .update({
      status,
      completed_items: status === 'completed' ? 1 : 0,
      failed_items: status === 'failed' ? 1 : 0,
      finished_at: new Date().toISOString(),
      error,
    })
    .eq('id', runId);
}

async function buildStoryRunItem(
  supabase: Supabase,
  input: {
    runId: string;
    storyId: string;
    story: {
      id: string;
      title: string;
      requirements: string;
      acceptance_criteria: string;
      edge_cases: string | null;
      figma_link: string | null;
      status: string;
      technical_guidelines: string | null;
      updated_at: string | null;
    };
    releaseId: string;
    linearIssueSync: NonNullable<typeof domainRuntime.storyMap.linearIssueSync>;
    openCodeSessions: OpenCodeSessionPort;
    target: { teamId: string; projectId?: string; stateId?: string };
  },
) {
  const { linearIssue, session } = await syncStoryRunItem({
    supabase,
    story: input.story,
    releaseId: input.releaseId,
    linearIssueSync: input.linearIssueSync,
    openCodeSessions: input.openCodeSessions,
    target: input.target,
  });
  if (!session) throw new Error('OpenCode session not created');

  await supabase.from('release_run_items').insert({
    release_run_id: input.runId,
    story_id: input.storyId,
    linear_issue_id: linearIssue.id,
    opencode_session_id: session.id,
    opencode_session_url: session.url,
    status: 'synced',
  });

  return { linearIssue, session };
}

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await domainRuntime.storyMap.auth.requireAuth();
  if (!auth.success) return auth.response;

  const linearIssueSync = domainRuntime.storyMap.linearIssueSync;
  if (!linearIssueSync) return NextResponse.json({ error: 'Linear integration is not enabled' }, { status: 503 });

  const openCodeSessions = domainRuntime.storyMap.openCodeSessions;
  if (!openCodeSessions) return NextResponse.json({ error: 'OpenCode integration is not enabled' }, { status: 503 });

  const { id: storyId } = await params;
  if (!isValidUuid(storyId)) return invalidIdResponse();

  const supabase = await createClient();
  const loaded = await loadStoryContext(supabase, storyId);
  if (loaded.response || !loaded.data) return loaded.response;

  const { story, storyMapId } = loaded.data;
  const target = await getLinearStorySyncTargetForStoryMap(supabase, storyMapId);
  if (!target) return NextResponse.json({ error: 'No linear target configured for story map team' }, { status: 400 });

  const { data: run, error: runCreateError } = await createRun(supabase, {
    releaseId: story.release_id,
    storyMapId,
    userId: auth.user.id,
  });
  if (runCreateError || !run) {
    return serverErrorResponse('Failed to create story build run', runCreateError ?? new Error('Run not created'));
  }

  try {
    const { linearIssue, session } = await buildStoryRunItem(supabase, {
      runId: run.id,
      storyId,
      story,
      releaseId: story.release_id,
      linearIssueSync,
      openCodeSessions,
      target,
    });

    await finishRun(supabase, run.id, 'completed', null);

    return NextResponse.json({
      run_id: run.id,
      story_id: storyId,
      linear_issue_id: linearIssue.id,
      linear_issue_identifier: linearIssue.identifier,
      opencode_session_id: session.id,
      opencode_session_url: session.url,
    });
  } catch (error) {
    const message = errorMessage(error);

    await supabase.from('release_run_items').insert({
      release_run_id: run.id,
      story_id: storyId,
      status: 'failed',
      error: message,
    });
    await finishRun(supabase, run.id, 'failed', message);

    return NextResponse.json({ error: message, run_id: run.id }, { status: 500 });
  }
}
