/* @vitest-environment jsdom */

import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthForm } from './AuthForm';

const { createClientMock, signInWithPasswordMock, signInWithOtpMock, signUpMock } = vi.hoisted(() => ({
  createClientMock: vi.fn(),
  signInWithPasswordMock: vi.fn(),
  signInWithOtpMock: vi.fn(),
  signUpMock: vi.fn(),
}));

vi.mock('@/lib/supabase/client', () => ({
  createClient: createClientMock,
}));

vi.mock('@/components/Logo', () => ({
  Logo: () => <div>BeemSpec</div>,
}));

describe('AuthForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    signInWithPasswordMock.mockResolvedValue({ error: null });
    signInWithOtpMock.mockResolvedValue({ error: null });
    signUpMock.mockResolvedValue({ error: null });
    createClientMock.mockReturnValue({
      auth: {
        signInWithPassword: signInWithPasswordMock,
        signInWithOtp: signInWithOtpMock,
        signUp: signUpMock,
      },
    });
  });

  afterEach(() => {
    cleanup();
  });

  it('submits login credentials and shows auth errors from Supabase', async () => {
    const user = userEvent.setup();
    signInWithPasswordMock.mockResolvedValue({ error: { message: 'Invalid login credentials' } });

    render(<AuthForm next="/story-map/123" />);

    await user.type(screen.getByLabelText('Email'), 'person@example.com');
    await user.type(screen.getByLabelText('Password'), 'secret123');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(signInWithPasswordMock).toHaveBeenCalledWith({
      email: 'person@example.com',
      password: 'secret123',
    });
    expect(screen.getByText('Invalid login credentials')).toBeTruthy();
  });

  it('submits signup details and shows a confirmation message', async () => {
    const user = userEvent.setup();

    render(<AuthForm next="/" />);

    await user.click(screen.getByRole('button', { name: 'Sign up' }));
    await user.type(screen.getByLabelText('Full name'), 'Alex Example');
    await user.type(screen.getByLabelText('Email'), 'alex@example.com');
    await user.type(screen.getByLabelText('Password'), 'secret123');
    await user.click(screen.getByRole('button', { name: 'Create account' }));

    expect(signUpMock).toHaveBeenCalledWith({
      email: 'alex@example.com',
      password: 'secret123',
      options: {
        emailRedirectTo: 'http://localhost:3000/auth/callback',
        data: { full_name: 'Alex Example' },
      },
    });
    expect(screen.getByText('Check your email to confirm your account!')).toBeTruthy();
  });

  it('requires an email before sending a magic link and then sends one when present', async () => {
    const user = userEvent.setup();

    render(<AuthForm next="/oauth/consent?authorization_id=auth-1" />);

    await user.click(screen.getByRole('button', { name: 'Send magic link' }));
    expect(screen.getByText('Enter your email address')).toBeTruthy();
    expect(signInWithOtpMock).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText('Email'), 'person@example.com');
    await user.click(screen.getByRole('button', { name: 'Send magic link' }));

    expect(signInWithOtpMock).toHaveBeenCalledWith({
      email: 'person@example.com',
      options: {
        emailRedirectTo: 'http://localhost:3000/auth/callback?next=%2Foauth%2Fconsent%3Fauthorization_id%3Dauth-1',
      },
    });
    expect(screen.getByText('Check your email!')).toBeTruthy();
  });
});
