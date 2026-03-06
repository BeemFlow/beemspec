import { createClient } from '@supabase/supabase-js';
import { env } from '@/lib/env';

function getSupabasePublicConfig() {
  const supabaseUrl = env.supabaseUrl();
  const publishableKey = env.supabasePublishableKey();

  if (!supabaseUrl || !publishableKey) {
    throw new Error('Missing Supabase environment variables');
  }

  return { supabaseUrl, publishableKey };
}

export function createClientForAccessToken(accessToken: string) {
  const { supabaseUrl, publishableKey } = getSupabasePublicConfig();

  return createClient(supabaseUrl, publishableKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  });
}

export async function refreshSupabaseAccessToken(refreshToken: string) {
  const { supabaseUrl, publishableKey } = getSupabasePublicConfig();
  const supabase = createClient(supabaseUrl, publishableKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  const { data, error } = await supabase.auth.refreshSession({ refresh_token: refreshToken });
  if (error || !data.session) {
    return { data: null, error: error ?? new Error('Session refresh failed') };
  }

  return {
    data: {
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
      token_type: 'Bearer',
      expires_in: data.session.expires_in ?? 3600,
    },
    error: null,
  };
}
