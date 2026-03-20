import { beforeEach, describe, expect, it, vi } from 'vitest';
import { acceptE2ETeamInvite } from '@/lib/e2e/test-store';
import { createClient } from '@/lib/supabase/server';
import AcceptInvitePage from './page';

const { redirectMock } = vi.hoisted(() => ({
  redirectMock: vi.fn((path: string) => {
    throw new Error(`redirect:${path}`);
  }),
}));

vi.mock('next/navigation', () => ({ redirect: redirectMock }));
vi.mock('@/lib/e2e/test-store', () => ({ acceptE2ETeamInvite: vi.fn() }));
vi.mock('@/lib/env', () => ({ env: { e2eTestMode: () => true } }));
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }));

describe('invite accept page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('accepts an invite in e2e mode and redirects home', async () => {
    await expect(
      AcceptInvitePage({ searchParams: Promise.resolve({ invite_id: 'invite-1', email: 'person@example.com' }) }),
    ).rejects.toThrowError('redirect:/');

    expect(acceptE2ETeamInvite).toHaveBeenCalledWith('invite-1', 'person@example.com');
    expect(createClient).not.toHaveBeenCalled();
  });
});
