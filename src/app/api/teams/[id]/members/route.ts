import { NextResponse } from 'next/server';
import { serverErrorResponse } from '@/lib/errors';
import { requireAuthWithUuidParams } from '@/lib/route-guards';
import { createClient } from '@/lib/supabase/server';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAuthWithUuidParams(params, ['id']);
  if (!guard.success) return guard.response;

  const { id } = guard.params;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('get_team_members', { p_team_id: id });

  if (error) {
    return serverErrorResponse('Failed to fetch team members', error);
  }

  return NextResponse.json(data);
}
