/* @vitest-environment jsdom */

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { createClientMock, setSessionMock, getClaimsMock, updateUserMock, replaceMock, fetchMock } = vi.hoisted(() => ({
  createClientMock: vi.fn(),
  setSessionMock: vi.fn(),
  getClaimsMock: vi.fn(),
  updateUserMock: vi.fn(),
  replaceMock: vi.fn(),
  fetchMock: vi.fn(),
}));

vi.mock('@/lib/supabase/client', () => ({ createClient: createClientMock }));

import { AcceptInviteClient } from './AcceptInviteClient';

describe('AcceptInviteClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createClientMock.mockReturnValue({
      auth: {
        setSession: setSessionMock,
        getClaims: getClaimsMock,
        updateUser: updateUserMock,
      },
    });
    setSessionMock.mockResolvedValue({ error: null });
    getClaimsMock.mockResolvedValue({ data: { claims: { sub: 'user-1' } } });
    updateUserMock.mockResolvedValue({ error: null });
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockResolvedValue(new Response(null, { status: 200 }));
    Object.defineProperty(window, 'location', {
      value: {
        hash: '#access_token=access-1&refresh_token=refresh-1',
        pathname: '/invite/accept',
        search: '',
        replace: replaceMock,
      },
      configurable: true,
    });
    window.history.replaceState = vi.fn();
  });

  afterEach(() => {
    cleanup();
  });

  it('sets the session, accepts the invite, clears invite metadata, and redirects home', async () => {
    render(<AcceptInviteClient />);

    expect(screen.getByText('Accepting Invite')).toBeTruthy();

    await waitFor(() => {
      expect(setSessionMock).toHaveBeenCalledWith({ access_token: 'access-1', refresh_token: 'refresh-1' });
      expect(fetchMock).toHaveBeenCalledWith('/api/invite/accept', { method: 'POST' });
      expect(updateUserMock).toHaveBeenCalledWith({ data: { invite_id: null } });
      expect(replaceMock).toHaveBeenCalledWith('/');
    });
  });

  it('sends unauthenticated users to the login resume flow', async () => {
    Object.defineProperty(window, 'location', {
      value: {
        hash: '',
        pathname: '/invite/accept',
        search: '',
        replace: replaceMock,
      },
      configurable: true,
    });
    getClaimsMock.mockResolvedValue({ data: null });

    render(<AcceptInviteClient />);

    await waitFor(() => {
      expect(replaceMock).toHaveBeenCalledWith('/auth/login?next=%2Finvite%2Faccept');
    });
  });

  it('returns home when invite acceptance fails', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 500 }));

    render(<AcceptInviteClient />);

    await waitFor(() => {
      expect(replaceMock).toHaveBeenCalledWith('/');
    });
  });
});
