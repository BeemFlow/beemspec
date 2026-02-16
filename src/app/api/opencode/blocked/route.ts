import { NextResponse } from 'next/server';
import { isAuthorizedByOpenCodeToken } from '@/integrations/opencode/session';
import { requireAuth } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { opencodeMarkBlockedSchema, validateRequest } from '@/lib/validations';

export async function POST(request: Request) {
  const usingToken = isAuthorizedByOpenCodeToken(request);
  if (!usingToken) {
    const auth = await requireAuth();
    if (!auth.success) return auth.response;
  }

  const validation = await validateRequest(request, opencodeMarkBlockedSchema);
  if (!validation.success) return validation.response;

  const supabase = usingToken ? createAdminClient() : await createClient();
  const reason = `Blocked: ${validation.data.reason}`;

  const { data: latestItem, error: latestItemError } = await supabase
    .from('build_run_items')
    .select('id')
    .eq('story_id', validation.data.story_id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (latestItemError) return NextResponse.json({ error: 'Failed to locate build run item' }, { status: 500 });
  if (!latestItem) return NextResponse.json({ error: 'No build run item found for story' }, { status: 404 });

  const { error: updateError } = await supabase
    .from('build_run_items')
    .update({ status: 'failed', error: reason, last_retry_at: new Date().toISOString() })
    .eq('id', latestItem.id);

  if (updateError) return NextResponse.json({ error: 'Failed to mark story blocked' }, { status: 500 });

  return NextResponse.json({ ok: true });
}
