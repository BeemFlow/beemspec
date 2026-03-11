import { normalize } from '@/lib/strings';

function readEnv(name: string): string | null {
  return normalize(process.env[name]);
}

export const env = {
  supabaseUrl(): string | null {
    return readEnv('NEXT_PUBLIC_SUPABASE_URL');
  },

  supabasePublishableKey(): string | null {
    return readEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY');
  },

  supabaseSecretKey(): string | null {
    return readEnv('SUPABASE_SECRET_KEY');
  },

  linearClientId(): string | null {
    return readEnv('LINEAR_CLIENT_ID');
  },

  linearClientSecret(): string | null {
    return readEnv('LINEAR_CLIENT_SECRET');
  },

  linearOAuthRedirectUri(): string | null {
    return readEnv('LINEAR_OAUTH_REDIRECT_URI');
  },

  linearWebhookSecret(): string | null {
    return readEnv('LINEAR_WEBHOOK_SECRET') ?? readEnv('BEEMSPEC_LINEAR_WEBHOOK_SECRET');
  },

  mcpOAuthSecret(): string | null {
    return readEnv('BEEMSPEC_MCP_OAUTH_SECRET');
  },
};
