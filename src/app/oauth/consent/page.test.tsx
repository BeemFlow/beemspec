/* @vitest-environment jsdom */

import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const { createClientMock, redirectMock } = vi.hoisted(() => ({
  createClientMock: vi.fn(),
  redirectMock: vi.fn((url: string) => {
    throw new Error(`redirect:${url}`);
  }),
}));

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}));

vi.mock('next/navigation', () => ({
  redirect: redirectMock,
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: createClientMock,
}));

import OAuthConsentPage from './page';

describe('OAuthConsentPage', () => {
  it('shows a missing request message without an authorization id', async () => {
    render(await OAuthConsentPage({ searchParams: Promise.resolve({}) }));

    expect(screen.getByText('Missing authorization request.')).toBeTruthy();
  });

  it('redirects unauthenticated users to login', async () => {
    createClientMock.mockResolvedValue({ auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) } });

    await expect(OAuthConsentPage({ searchParams: Promise.resolve({ authorization_id: 'auth-1' }) })).rejects.toThrow(
      'redirect:/auth/login',
    );
  });

  it('shows an environment message when oauth consent APIs are unavailable', async () => {
    createClientMock.mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }) },
    });

    render(await OAuthConsentPage({ searchParams: Promise.resolve({ authorization_id: 'auth-1' }) }));

    expect(screen.getByText('OAuth consent is not available in this environment.')).toBeTruthy();
  });

  it('shows authorization errors from Supabase oauth details lookup', async () => {
    createClientMock.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }),
        oauth: {
          getAuthorizationDetails: vi.fn().mockResolvedValue({ data: null, error: { message: 'Expired request' } }),
        },
      },
    });

    render(await OAuthConsentPage({ searchParams: Promise.resolve({ authorization_id: 'auth-1' }) }));

    expect(screen.getByText('Authorization error')).toBeTruthy();
    expect(screen.getByText('Expired request')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Return home' }).getAttribute('href')).toBe('/');
  });

  it('redirects immediately when the authorization is already resolved', async () => {
    createClientMock.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }),
        oauth: {
          getAuthorizationDetails: vi
            .fn()
            .mockResolvedValue({ data: { redirect_url: '/oauth/complete' }, error: null }),
        },
      },
    });

    await expect(OAuthConsentPage({ searchParams: Promise.resolve({ authorization_id: 'auth-1' }) })).rejects.toThrow(
      'redirect:/oauth/complete',
    );
  });

  it('renders consent details and normalized scopes for a valid request', async () => {
    createClientMock.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }),
        oauth: {
          getAuthorizationDetails: vi.fn().mockResolvedValue({
            data: {
              client: { name: 'Linear MCP' },
              redirect_uri: 'https://example.com/callback',
              scope: 'read write  admin ',
            },
            error: null,
          }),
        },
      },
    });

    render(await OAuthConsentPage({ searchParams: Promise.resolve({ authorization_id: 'auth-1' }) }));

    expect(screen.getByText('Authorize app access')).toBeTruthy();
    expect(screen.getByText('Linear MCP')).toBeTruthy();
    expect(screen.getByText('https://example.com/callback')).toBeTruthy();
    expect(screen.getByText('read, write, admin')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Deny' }).getAttribute('value')).toBe('deny');
    expect(screen.getByRole('button', { name: 'Approve' }).getAttribute('value')).toBe('approve');
  });
});
