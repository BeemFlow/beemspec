import { createTaskSchema, reorderTasksSchema } from '@beemspec/storymap';
import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { createE2ETask } from '@/lib/e2e/test-store';
import { env } from '@/lib/env';
import { serverErrorResponse } from '@/lib/errors';
import { createClient } from '@/lib/supabase/server';
import { validateRequest } from '@/lib/validations';
import { createTask, reorderTasks } from '@/storymap/service';

export async function PUT(request: Request) {
  if (env.e2eTestMode()) {
    return NextResponse.json({ success: true });
  }

  const auth = await requireAuth();
  if (!auth.success) return auth.response;

  const validation = await validateRequest(request, reorderTasksSchema);
  if (!validation.success) return validation.response;

  const supabase = await createClient();
  const { error } = await reorderTasks(supabase, validation.data);

  if (error) {
    return serverErrorResponse('Failed to reorder tasks', error);
  }
  return NextResponse.json({ success: true });
}

export async function POST(request: Request) {
  if (env.e2eTestMode()) {
    const body = (await request.json()) as { activity_id?: string; name?: string; description?: string | null };
    if (!body.activity_id || !body.name?.trim()) {
      return NextResponse.json({ error: 'activity_id and name are required' }, { status: 400 });
    }
    const task = createE2ETask({
      activity_id: body.activity_id,
      name: body.name.trim(),
      description: body.description ?? null,
    });
    return task ? NextResponse.json(task) : NextResponse.json({ error: 'Activity not found' }, { status: 404 });
  }

  const auth = await requireAuth();
  if (!auth.success) return auth.response;

  const validation = await validateRequest(request, createTaskSchema);
  if (!validation.success) return validation.response;

  const supabase = await createClient();
  const { data, error } = await createTask(supabase, validation.data);

  if (error) {
    return serverErrorResponse('Failed to create task', error);
  }
  return NextResponse.json(data);
}
