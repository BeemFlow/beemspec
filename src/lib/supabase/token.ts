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
