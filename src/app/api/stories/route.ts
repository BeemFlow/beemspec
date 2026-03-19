import { createStorySchema, reorderStoriesSchema } from '@beemspec/storymap';
import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { createE2EStory } from '@/lib/e2e/test-store';
import { env } from '@/lib/env';
import { serverErrorResponse } from '@/lib/errors';
import { createClient } from '@/lib/supabase/server';
import { validateRequest } from '@/lib/validations';
import { createStory, reorderStories } from '@/storymap/service';
import type { Story, StoryStatus } from '@/types';

export async function PUT(request: Request) {
  if (env.e2eTestMode()) {
    return NextResponse.json({ success: true });
  }

  const auth = await requireAuth();
  if (!auth.success) return auth.response;

  const validation = await validateRequest(request, reorderStoriesSchema);
  if (!validation.success) return validation.response;

  const supabase = await createClient();
  const { error } = await reorderStories(supabase, validation.data);

  if (error) {
    return serverErrorResponse('Failed to reorder stories', error);
  }
  return NextResponse.json({ success: true });
}

export async function POST(request: Request) {
  if (env.e2eTestMode()) {
    const body = (await request.json()) as {
      task_id?: string;
      release_id?: string | null;
      title?: string;
      status?: StoryStatus;
      content?: Story['content'];
    };
    if (!body.task_id || !body.title?.trim() || !body.content) {
      return NextResponse.json({ error: 'task_id, title, and content are required' }, { status: 400 });
    }
    const story = createE2EStory({
      task_id: body.task_id,
      release_id: body.release_id ?? null,
      title: body.title.trim(),
      status: body.status,
      content: body.content,
    });
    return story ? NextResponse.json(story) : NextResponse.json({ error: 'Task not found' }, { status: 404 });
  }

  const auth = await requireAuth();
  if (!auth.success) return auth.response;

  const validation = await validateRequest(request, createStorySchema);
  if (!validation.success) return validation.response;

  const supabase = await createClient();
  const { data, error } = await createStory(supabase, validation.data);

  if (error) {
    return serverErrorResponse('Failed to create story', error);
  }

  return NextResponse.json(data);
}
