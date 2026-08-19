import { describe, expect, it } from 'vitest';
import { resolveRequestOrigin, resolveRequestUrl, resolveSafeRedirectPath } from './request-url';

describe('request-url', () => {
  it('prefers forwarded host and protocol for public origin', () => {
    const request = new Request('http://internal-service/auth/logout', {
      headers: {
        host: 'internal-service',
        'x-forwarded-host': 'app.example.com',
        'x-forwarded-proto': 'https',
      },
    });

    expect(resolveRequestOrigin(request)).toBe('https://app.example.com');
    expect(resolveRequestUrl(request, '/auth/login').toString()).toBe('https://app.example.com/auth/login');
  });

  it('falls back to request origin when forwarded headers are missing', () => {
    const request = new Request('https://app.example.com/auth/logout');
    expect(resolveRequestOrigin(request)).toBe('https://app.example.com');
  });

  it('accepts only same-site relative redirect paths', () => {
    expect(resolveSafeRedirectPath('/dashboard')).toBe('/dashboard');
    expect(resolveSafeRedirectPath('/dashboard?tab=activity')).toBe('/dashboard?tab=activity');
    expect(resolveSafeRedirectPath('//evil.example.com')).toBe('/');
    expect(resolveSafeRedirectPath('/\\evil.example.com')).toBe('/');
    expect(resolveSafeRedirectPath('https://evil.example.com')).toBe('/');
    expect(resolveSafeRedirectPath(undefined)).toBe('/');
  });
});
