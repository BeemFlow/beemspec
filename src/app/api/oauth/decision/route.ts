import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

type OAuthDecisionResponse = {
  redirect_to?: string;
};

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const form = await request.formData();
  const decision = String(form.get('decision') ?? 'deny');
  const authorizationId = String(form.get('authorization_id') ?? '');

  if (!authorizationId) {
    return NextResponse.json({ error: 'Missing authorization_id' }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    const loginUrl = new URL('/auth/login', request.url);
    loginUrl.searchParams.set('next', `/oauth/consent?authorization_id=${encodeURIComponent(authorizationId)}`);
    return NextResponse.redirect(loginUrl);
  }

  const oauthApi = (
    supabase.auth as unknown as {
      oauth?: {
        approveAuthorization: (authorizationId: string) => Promise<{
          data: OAuthDecisionResponse | null;
          error: { message?: string } | null;
        }>;
        denyAuthorization: (authorizationId: string) => Promise<{
          data: OAuthDecisionResponse | null;
          error: { message?: string } | null;
        }>;
      };
    }
  ).oauth;

  if (!oauthApi) {
    return NextResponse.json({ error: 'OAuth decision API is unavailable' }, { status: 500 });
  }

  const outcome =
    decision === 'approve'
      ? await oauthApi.approveAuthorization(authorizationId)
      : await oauthApi.denyAuthorization(authorizationId);

  if (outcome.error || !outcome.data?.redirect_to) {
    return NextResponse.json(
      { error: outcome.error?.message ?? 'Failed to process authorization decision' },
      { status: 400 },
    );
  }

  return NextResponse.redirect(outcome.data.redirect_to);
}
