import { redirect } from 'next/navigation';
import { AcceptInviteClient } from '@/app/invite/accept/AcceptInviteClient';
import { acceptE2ETeamInvite } from '@/lib/e2e/test-store';
import { env } from '@/lib/env';

export default async function AcceptInvitePage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (env.e2eTestMode()) {
    const resolvedSearchParams = searchParams ? await searchParams : {};
    const inviteId = resolvedSearchParams.invite_id;
    const email = resolvedSearchParams.email;

    if (typeof inviteId === 'string' && typeof email === 'string') {
      acceptE2ETeamInvite(inviteId, email);
    }

    redirect('/');
  }

  return <AcceptInviteClient />;
}
