import { linearSyncStorySchema } from '@beemspec/linear';
import { getLinearIssueSync } from '@/integrations/linear/helpers';
import { syncStoriesByIdList } from '@/integrations/linear/sync-reconcile';
import { requireAuth } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { validateRequest } from '@/lib/validations';

export async function POST(request: Request) {
  const auth = await requireAuth();
  if (!auth.success) return auth.response;

  const validation = await validateRequest(request, linearSyncStorySchema);
  if (!validation.success) return validation.response;

  const supabase = await createClient();
  const summary = await syncStoriesByIdList({
    supabase,
    fallbackIssueSync: getLinearIssueSync(),
    storyIds: [validation.data.story_id],
  });

  const single = summary.responses[0];
  if (!single) {
    return Response.json({ error: 'Failed to sync story' }, { status: 500 });
  }

  return single.response;
}
