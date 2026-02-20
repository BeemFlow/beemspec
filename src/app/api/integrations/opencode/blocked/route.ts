import { NextResponse } from 'next/server';
import { z } from 'zod';
import { markStoryBlocked } from '@/build-runs/processor';
import { isAuthorizedByOpenCodeToken } from '@/integrations/opencode/session';
import { requireAuth } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { validateRequest } from '@/lib/validations';

const markBlockedSchema = z.object({
  story_id: z.string().uuid(),
  reason: z.string().min(1).max(2000),
});

export async function POST(request: Request) {
  const usingToken = isAuthorizedByOpenCodeToken(request);
  if (!usingToken) {
    const auth = await requireAuth();
    if (!auth.success) return auth.response;
  }

  const validation = await validateRequest(request, markBlockedSchema);
  if (!validation.success) return validation.response;

  const supabase = usingToken ? createAdminClient() : await createClient();
  const result = await markStoryBlocked(supabase, {
    storyId: validation.data.story_id,
    reason: validation.data.reason,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({ ok: true });
}
