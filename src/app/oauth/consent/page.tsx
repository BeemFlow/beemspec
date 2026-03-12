import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { createClient } from '@/lib/supabase/server';

type ConsentPageProps = {
  searchParams: Promise<{ authorization_id?: string }>;
};

type AuthorizationDetails = {
  client?: {
    name?: string;
  };
  redirect_uri?: string;
  scope?: string;
  redirect_url?: string;
};

export default async function OAuthConsentPage({ searchParams }: ConsentPageProps) {
  const { authorization_id: authorizationId = '' } = await searchParams;

  if (!authorizationId) {
    return <div className="mx-auto max-w-xl p-6 text-sm">Missing authorization request.</div>;
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/auth/login?next=${encodeURIComponent(`/oauth/consent?authorization_id=${authorizationId}`)}`);
  }

  const oauthApi = (
    supabase.auth as unknown as {
      oauth?: {
        getAuthorizationDetails: (authorizationId: string) => Promise<{
          data: AuthorizationDetails | null;
          error: { message?: string } | null;
        }>;
      };
    }
  ).oauth;

  if (!oauthApi?.getAuthorizationDetails) {
    return <div className="mx-auto max-w-xl p-6 text-sm">OAuth consent is not available in this environment.</div>;
  }

  const { data: authorization, error } = await oauthApi.getAuthorizationDetails(authorizationId);

  if (error || !authorization) {
    return (
      <div className="mx-auto flex min-h-[50vh] w-full max-w-xl items-center justify-center p-6">
        <div className="w-full rounded-lg border bg-card p-6">
          <h1 className="text-xl font-semibold">Authorization error</h1>
          <p className="mt-2 text-sm text-muted-foreground">{error?.message ?? 'Invalid authorization request.'}</p>
          <Button asChild className="mt-4">
            <Link href="/">Return home</Link>
          </Button>
        </div>
      </div>
    );
  }

  if (typeof authorization.redirect_url === 'string' && authorization.redirect_url.length > 0) {
    redirect(authorization.redirect_url);
  }

  const scopes =
    typeof authorization.scope === 'string'
      ? authorization.scope
          .split(' ')
          .map((scope) => scope.trim())
          .filter((scope) => scope.length > 0)
      : [];

  return (
    <div className="mx-auto flex min-h-[70vh] w-full max-w-2xl items-center justify-center p-6">
      <main className="w-full rounded-xl border bg-card p-6 shadow-sm">
        <h1 className="text-2xl font-semibold">Authorize app access</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Review this request before allowing the app to access your BeemSpec data.
        </p>

        <dl className="mt-6 space-y-3 text-sm">
          <div>
            <dt className="font-medium">Client</dt>
            <dd className="text-muted-foreground">{authorization.client?.name ?? 'Unknown client'}</dd>
          </div>
          <div>
            <dt className="font-medium">Redirect URI</dt>
            <dd className="break-all text-muted-foreground">{authorization.redirect_uri ?? 'Unknown redirect URI'}</dd>
          </div>
          <div>
            <dt className="font-medium">Requested scopes</dt>
            <dd className="text-muted-foreground">
              {scopes.length > 0 ? scopes.join(', ') : 'No additional scopes requested'}
            </dd>
          </div>
        </dl>

        <form action="/oauth/decision" method="post" className="mt-6 flex gap-3">
          <input type="hidden" name="authorization_id" value={authorizationId} />
          <Button type="submit" name="decision" value="deny" variant="outline">
            Deny
          </Button>
          <Button type="submit" name="decision" value="approve">
            Approve
          </Button>
        </form>
      </main>
    </div>
  );
}
