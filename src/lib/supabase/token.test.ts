import { beforeEach, describe, expect, it, vi } from 'vitest';

const { createClientMock, envMock } = vi.hoisted(() => ({
  createClientMock: vi.fn(),
  envMock: {
    supabaseUrl: vi.fn(),
    supabasePublishableKey: vi.fn(),
  },
}));

vi.mock('@supabase/supabase-js', () => ({ createClient: createClientMock }));
vi.mock('@/lib/env', () => ({ env: envMock }));

import { createClientForAccessToken } from './token';

describe('supabase access token client', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    envMock.supabaseUrl.mockReturnValue('https://supabase.example.com');
    envMock.supabasePublishableKey.mockReturnValue('publishable-key');
  });

  it('builds a scoped supabase client for a bearer token', () => {
    createClientForAccessToken('access-1');

    expect(createClientMock).toHaveBeenCalledWith('https://supabase.example.com', 'publishable-key', {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { Authorization: 'Bearer access-1' } },
    });
  });

  it('throws when the public supabase config is missing', () => {
    envMock.supabasePublishableKey.mockReturnValue('');

    expect(() => createClientForAccessToken('access-1')).toThrow('Missing Supabase environment variables');
  });
});
