/* @vitest-environment jsdom */

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TeamControls } from './TeamControls';

const { pathnameState, refreshMock, replaceMock, searchParamsMock, searchParamsState, replaceStateMock } = vi.hoisted(
  () => ({
    pathnameState: { current: '/' },
    refreshMock: vi.fn(),
    replaceMock: vi.fn(),
    searchParamsMock: {
      get: (key: string) => searchParamsState.current.get(key),
      toString: () => searchParamsState.current.toString(),
    },
    searchParamsState: { current: new URLSearchParams() },
    replaceStateMock: vi.fn(),
  }),
);

vi.mock('next/navigation', () => ({
  usePathname: () => pathnameState.current,
  useRouter: () => ({ refresh: refreshMock, replace: replaceMock }),
  useSearchParams: () => searchParamsMock,
}));

vi.mock('@/components/ui/dropdown-menu', () => ({
  DropdownMenu: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuItem: ({
    children,
    onClick,
    asChild,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    asChild?: boolean;
  }) =>
    asChild ? (
      <div>{children}</div>
    ) : (
      <button type="button" onClick={onClick}>
        {children}
      </button>
    ),
  DropdownMenuSeparator: () => <hr />,
}));

vi.mock('@/components/ui/prompt-dialog', () => ({
  PromptDialog: ({ open, onSubmit }: { open: boolean; onSubmit: (value: string) => Promise<void> }) =>
    open ? (
      <button type="button" onClick={() => onSubmit('New Team')}>
        Confirm Team Creation
      </button>
    ) : null,
}));

vi.mock('@/components/TeamSettingsDialog', () => ({
  TeamSettingsDialog: ({
    open,
    team,
    linearOAuthNotice,
  }: {
    open: boolean;
    team: { name: string } | null;
    linearOAuthNotice?: { status: string; reason?: string } | null;
  }) =>
    open ? (
      <div>
        Settings for {team?.name}
        {linearOAuthNotice ? ` (${linearOAuthNotice.status}:${linearOAuthNotice.reason ?? 'none'})` : ''}
      </div>
    ) : null,
}));

describe('TeamControls', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    pathnameState.current = '/';
    searchParamsState.current = new URLSearchParams();
    Object.defineProperty(window, 'history', {
      value: { ...window.history, replaceState: replaceStateMock },
      configurable: true,
    });
    global.fetch = vi.fn();
    // biome-ignore lint/suspicious/noDocumentCookie: jsdom does not implement the Cookie Store API
    document.cookie = '';
  });

  afterEach(() => {
    cleanup();
  });

  it('switches teams, persists the cookie, and refreshes the app shell', async () => {
    const user = userEvent.setup();

    render(
      <TeamControls
        userEmail="person@example.com"
        initialTeams={[
          { id: 'team-1', name: 'Alpha', role: 'owner', created_at: '', updated_at: '' },
          { id: 'team-2', name: 'Beta', role: 'member', created_at: '', updated_at: '' },
        ]}
        initialCurrentTeamId="team-1"
      />,
    );

    expect(screen.getAllByRole('button', { name: /Alpha/i })[0]).toBeTruthy();
    await user.click(screen.getByRole('button', { name: /Beta/i }));

    await waitFor(() => {
      expect(screen.getAllByRole('button', { name: /Beta/i })[0]).toBeTruthy();
    });
    expect(document.cookie).toContain('beemspec_current_team_id=team-2');
    expect(refreshMock).toHaveBeenCalled();
    expect(replaceMock).not.toHaveBeenCalled();
  });

  it('returns to the selected team dashboard when switching from a team-scoped page', async () => {
    pathnameState.current = '/story-map/map-1';
    const user = userEvent.setup();

    render(
      <TeamControls
        userEmail="person@example.com"
        initialTeams={[
          { id: 'team-1', name: 'Alpha', role: 'owner', created_at: '', updated_at: '' },
          { id: 'team-2', name: 'Beta', role: 'member', created_at: '', updated_at: '' },
        ]}
        initialCurrentTeamId="team-1"
      />,
    );

    await user.click(screen.getByRole('button', { name: /Beta/i }));

    expect(document.cookie).toContain('beemspec_current_team_id=team-2');
    expect(replaceMock).toHaveBeenCalledWith('/');
    expect(refreshMock).not.toHaveBeenCalled();
  });

  it('creates a team through the API, reloads teams, and selects the new team', async () => {
    const user = userEvent.setup();
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: 'team-3', name: 'New Team' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify([
            { id: 'team-1', name: 'Alpha', role: 'owner' },
            { id: 'team-3', name: 'New Team', role: 'owner' },
          ]),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      );

    render(
      <TeamControls
        userEmail="person@example.com"
        initialTeams={[{ id: 'team-1', name: 'Alpha', role: 'owner', created_at: '', updated_at: '' }]}
        initialCurrentTeamId="team-1"
      />,
    );

    await user.click(screen.getByRole('button', { name: /Create new team/i }));
    await user.click(screen.getByRole('button', { name: 'Confirm Team Creation' }));

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith('/api/teams', expect.objectContaining({ method: 'POST' }));
      expect(fetch).toHaveBeenCalledWith('/api/teams');
    });
    expect(document.cookie).toContain('beemspec_current_team_id=team-3');
    expect(refreshMock).toHaveBeenCalled();
  });

  it('opens settings when linear oauth status is present and cleans the URL', async () => {
    searchParamsState.current = new URLSearchParams('linear_oauth=error&reason=not_owner');

    render(
      <TeamControls
        userEmail="person@example.com"
        initialTeams={[{ id: 'team-1', name: 'Alpha', role: 'owner', created_at: '', updated_at: '' }]}
        initialCurrentTeamId="team-1"
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('Settings for Alpha (error:not_owner)')).toBeTruthy();
    });
    expect(replaceStateMock).toHaveBeenCalledWith({}, '', '/');
  });
});
