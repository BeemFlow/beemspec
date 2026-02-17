function readEnv(name: string): string | null {
  const value = process.env[name];
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
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

  linearApiKey(): string | null {
    return readEnv('LINEAR_API_KEY');
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
    return readEnv('BEEMSPEC_LINEAR_WEBHOOK_SECRET');
  },

  openCodeToken(): string | null {
    return readEnv('BEEMSPEC_OPENCODE_TOKEN');
  },

  openCodeBaseUrl(): string {
    return readEnv('BEEMSPEC_OPENCODE_BASE_URL') ?? 'http://127.0.0.1:4096';
  },

  openCodeServerUsername(): string | null {
    return readEnv('BEEMSPEC_OPENCODE_SERVER_USERNAME') ?? readEnv('OPENCODE_SERVER_USERNAME');
  },

  openCodeServerPassword(): string | null {
    return readEnv('BEEMSPEC_OPENCODE_SERVER_PASSWORD') ?? readEnv('OPENCODE_SERVER_PASSWORD');
  },

  openCodeWebBaseUrl(): string | null {
    return readEnv('BEEMSPEC_OPENCODE_WEB_BASE_URL');
  },

  openCodeWorkingDirectory(): string | null {
    return readEnv('BEEMSPEC_OPENCODE_WORKING_DIRECTORY');
  },

  syncCronToken(): string | null {
    return readEnv('BEEMSPEC_SYNC_CRON_TOKEN');
  },
};
