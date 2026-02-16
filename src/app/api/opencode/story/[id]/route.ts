import { NextResponse } from 'next/server';
import { isAuthorizedByOpenCodeToken } from '@/integrations/opencode/session';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { invalidIdResponse, isValidUuid } from '@/lib/validations';
import { runtime } from '@/runtime';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: storyId } = await params;
  if (!isValidUuid(storyId)) return invalidIdResponse();

  const usingToken = isAuthorizedByOpenCodeToken(request);
  if (!usingToken) {
    const auth = await runtime.storyMap.auth.requireAuth();
    if (!auth.success) return auth.response;
  }

  const supabase = usingToken ? createAdminClient() : await createClient();
  const { data: story, error: storyError } = await supabase
    .from('stories')
    .select('id, release_id, title, requirements, acceptance_criteria, technical_guidelines')
    .eq('id', storyId)
    .single();

  if (storyError || !story) return NextResponse.json({ error: 'Story not found' }, { status: 404 });
  if (!story.release_id) {
    return NextResponse.json({ error: 'Story is not assigned to a release' }, { status: 400 });
  }

  return NextResponse.json({
    releaseId: story.release_id,
    storyId: story.id,
    storyTitle: story.title,
    requirements: story.requirements,
    acceptanceCriteria: story.acceptance_criteria,
    technicalGuidelines: story.technical_guidelines,
  });
}
