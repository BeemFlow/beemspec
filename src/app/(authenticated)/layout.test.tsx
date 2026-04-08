import { describe, expect, it, vi } from 'vitest';

const { cookiesMock, redirectMock, createClientMock, appShellMock } = vi.hoisted(() => ({
  cookiesMock: vi.fn(),
  redirectMock: vi.fn((path: string) => {
    throw new Error(`redirect:${path}`);
  }),
  createClientMock: vi.fn(),
  appShellMock: vi.fn(),
}));

vi.mock('next/headers', () => ({ cookies: cookiesMock }));
vi.mock('next/navigation', () => ({ redirect: redirectMock }));
vi.mock('@/lib/supabase/server', () => ({ createClient: createClientMock }));
vi.mock('@/components/AppShell', () => ({ AppShell: appShellMock }));

import AuthenticatedLayout from './layout';

describe('authenticated layout', () => {
  it('redirects unauthenticated users to login', async () => {
    cookiesMock.mockResolvedValue({ get: vi.fn() });
    createClientMock.mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) },
    });

    await expect(AuthenticatedLayout({ children: 'child' })).rejects.toThrow('redirect:/auth/login');
  });

  it('passes user email, teams, and cookie-selected team into the app shell', async () => {
    cookiesMock.mockResolvedValue({ get: vi.fn().mockReturnValue({ value: 'team-2' }) });
    createClientMock.mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1', email: 'person@example.com' } } }) },
      from: vi.fn(() => ({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({
              data: [
                {
                  role: 'owner',
                  teams: { id: 'team-1', name: 'Alpha', created_at: '2026-01-01', updated_at: '2026-01-01' },
                },
                {
                  role: 'member',
                  teams: { id: 'team-2', name: 'Beta', created_at: '2026-01-02', updated_at: '2026-01-02' },
                },
              ],
            }),
          }),
        }),
      })),
    });

    const result = await AuthenticatedLayout({ children: 'child' });

    expect(result.type).toBe(appShellMock);
    expect(result.props.userEmail).toBe('person@example.com');
    expect(result.props.initialCurrentTeamId).toBe('team-2');
    expect(result.props.teams).toEqual([
      { id: 'team-1', name: 'Alpha', created_at: '2026-01-01', updated_at: '2026-01-01', role: 'owner' },
      { id: 'team-2', name: 'Beta', created_at: '2026-01-02', updated_at: '2026-01-02', role: 'member' },
    ]);
  });
});
