import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { DbErrorCode, notFoundResponse, serverErrorResponse } from '@/lib/errors';
import { resolveRequestUrl } from '@/lib/request-url';
import { createShareToken } from '@/lib/share-links';
import { invalidIdResponse, isValidUuid } from '@/lib/validations';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth();
  if (!auth.success) return auth.response;

  const { id } = await params;
  if (!isValidUuid(id)) return invalidIdResponse();

  const supabase = auth.supabase;
  const { data, error } = await supabase.from('process_flows').select('id').eq('id', id).single();
  if (error || !data) {
    if ((error as { code?: string } | null)?.code === DbErrorCode.NOT_FOUND) {
      return notFoundResponse('Process flow');
    }
    return serverErrorResponse('Failed to load process flow', error);
  }

  const token = createShareToken({ resource: 'process-flow', resourceId: data.id, expiresAt: null });
  const url = resolveRequestUrl(request, `/embed/process-flows/${encodeURIComponent(token)}`);

  return NextResponse.json({ url: url.toString() });
}
