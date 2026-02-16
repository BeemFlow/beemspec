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

  supabaseAnonKey(): string | null {
    return readEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY');
  },

  supabaseSecretKey(): string | null {
    return readEnv('SUPABASE_SECRET_KEY');
  },

  linearApiKey(): string | null {
    return readEnv('LINEAR_API_KEY');
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

  openCodeWebBaseUrl(): string | null {
    return readEnv('BEEMSPEC_OPENCODE_WEB_BASE_URL');
  },

  workerToken(): string | null {
    return readEnv('BEEMSPEC_WORKER_TOKEN');
  },

  reconcileCronToken(): string | null {
    return readEnv('BEEMSPEC_RECONCILE_CRON_TOKEN');
  },
};
