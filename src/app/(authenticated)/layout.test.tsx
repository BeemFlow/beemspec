import { describe, expect, it, vi } from 'vitest';

const { redirectMock, getAppContextMock, appShellMock } = vi.hoisted(() => ({
  redirectMock: vi.fn((path: string) => {
    throw new Error(`redirect:${path}`);
  }),
  getAppContextMock: vi.fn(),
  appShellMock: vi.fn(),
}));

vi.mock('next/navigation', () => ({ redirect: redirectMock }));
vi.mock('@/lib/app-context', () => ({ getAppContext: getAppContextMock }));
vi.mock('@/components/AppShell', () => ({ AppShell: appShellMock }));

import AuthenticatedLayout from './layout';

describe('authenticated layout', () => {
  it('redirects unauthenticated users to login', async () => {
    getAppContextMock.mockResolvedValue({
      user: null,
      teams: [],
      currentTeamId: null,
    });

    await expect(AuthenticatedLayout({ children: 'child' })).rejects.toThrow('redirect:/auth/login');
  });

  it('passes user email, teams, and cookie-selected team into the app shell', async () => {
    getAppContextMock.mockResolvedValue({
      user: { id: 'user-1', email: 'person@example.com' },
      currentTeamId: 'team-2',
      teams: [
        { id: 'team-1', name: 'Alpha', created_at: '2026-01-01', updated_at: '2026-01-01', role: 'owner' },
        { id: 'team-2', name: 'Beta', created_at: '2026-01-02', updated_at: '2026-01-02', role: 'member' },
      ],
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
