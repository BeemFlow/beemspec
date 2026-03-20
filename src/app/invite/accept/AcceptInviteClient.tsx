'use client';

import { useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';

function buildLoginUrl() {
  const params = new URLSearchParams({ next: '/invite/accept' });
  return `/auth/login?${params.toString()}`;
}

export function AcceptInviteClient() {
  useEffect(() => {
    const supabase = createClient();

    async function acceptInvite() {
      const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
      const accessToken = hashParams.get('access_token');
      const refreshToken = hashParams.get('refresh_token');

      if (accessToken && refreshToken) {
        const { error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });

        if (error) {
          window.location.replace(buildLoginUrl());
          return;
        }

        window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
      }

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        window.location.replace(buildLoginUrl());
        return;
      }

      const response = await fetch('/api/invite/accept', {
        method: 'POST',
      });

      if (!response.ok) {
        window.location.replace('/');
        return;
      }

      await supabase.auth.updateUser({ data: { invite_id: null } });
      window.location.replace('/');
    }

    void acceptInvite();
  }, []);

  return (
    <div className="flex min-h-screen items-center justify-center p-4 text-center">
      <div className="space-y-2">
        <h1 className="font-mono text-xl uppercase tracking-[0.08em]">Accepting Invite</h1>
        <p className="text-sm text-muted-foreground">Finishing sign-in and adding you to the team...</p>
      </div>
    </div>
  );
}
