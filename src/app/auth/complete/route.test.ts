import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';
import { GET } from './route';

function makeRequest(path: string, cookie?: string) {
  return new NextRequest(`https://app.example.com${path}`, {
    headers: cookie ? { cookie } : undefined,
  });
}

describe('auth complete route', () => {
  it('redirects to explicit next paths', () => {
    const response = GET(makeRequest('/auth/complete?next=%2Fstory-map%2F123'));

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('https://app.example.com/story-map/123');
    expect(response.cookies.get('beemspec_oauth_login_resume')?.maxAge).toBe(0);
  });

  it('falls back to oauth resume cookie when next is absent', () => {
    const response = GET(
      makeRequest('/auth/complete', 'beemspec_oauth_login_resume=%2Foauth%2Fconsent%3Fauthorization_id%3Dauth-123'),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('https://app.example.com/oauth/consent?authorization_id=auth-123');
    expect(response.cookies.get('beemspec_oauth_login_resume')?.maxAge).toBe(0);
  });
});
