'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { createClient } from '@/lib/supabase/client';

function AuthForm() {
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'error' | 'success'; text: string } | null>(null);
  const router = useRouter();
  const next = useSearchParams().get('next') ?? '/';
  const supabase = createClient();
  const isLogin = mode === 'login';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    const { error } = isLogin
      ? await supabase.auth.signInWithPassword({ email, password })
      : await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${location.origin}/auth/callback`, data: { full_name: fullName } },
        });

    if (error) {
      setMessage({ type: 'error', text: error.message });
      setLoading(false);
    } else if (isLogin) {
      router.push(next);
      router.refresh();
    } else {
      setMessage({ type: 'success', text: 'Check your email to confirm your account!' });
      setLoading(false);
    }
  };

  const handleMagicLink = async () => {
    if (!email) return setMessage({ type: 'error', text: 'Enter your email address' });
    setLoading(true);
    setMessage(null);
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${location.origin}/auth/callback?next=${encodeURIComponent(next)}` },
    });
    setMessage(error ? { type: 'error', text: error.message } : { type: 'success', text: 'Check your email!' });
    setLoading(false);
  };

  const toggleMode = () => {
    setMode(isLogin ? 'signup' : 'login');
    setMessage(null);
  };

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold">{isLogin ? 'Welcome back' : 'Create an account'}</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {isLogin ? 'Sign in to your account' : 'Get started with BeemSpec'}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {!isLogin && (
            <div className="space-y-2">
              <Label htmlFor="fullName">Full name</Label>
              <Input
                id="fullName"
                placeholder="Your name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                disabled={loading}
              />
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={loading}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              placeholder={isLogin ? 'Your password' : 'At least 6 characters'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required={!isLogin}
              minLength={isLogin ? undefined : 6}
              disabled={loading}
            />
          </div>

          {message && (
            <p className={`text-sm ${message.type === 'error' ? 'text-destructive' : 'text-success'}`}>
              {message.text}
            </p>
          )}

          <div className="space-y-2">
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? (isLogin ? 'Signing in...' : 'Creating...') : isLogin ? 'Sign in' : 'Create account'}
            </Button>
            {isLogin && (
              <Button type="button" variant="outline" className="w-full" onClick={handleMagicLink} disabled={loading}>
                Send magic link
              </Button>
            )}
          </div>
        </form>

        <p className="text-center text-sm text-muted-foreground">
          {isLogin ? "Don't have an account? " : 'Already have an account? '}
          <button type="button" onClick={toggleMode} className="underline hover:text-foreground">
            {isLogin ? 'Sign up' : 'Sign in'}
          </button>
        </p>
      </div>
    </div>
  );
}

export default function AuthPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center">
          <p className="text-muted-foreground">Loading...</p>
        </div>
      }
    >
      <AuthForm />
    </Suspense>
  );
}
