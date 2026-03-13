import { resolveSafeRedirectPath } from '@/lib/request-url';

export const OAUTH_LOGIN_RESUME_COOKIE = 'beemspec_oauth_login_resume';
export const OAUTH_LOGIN_RESUME_MAX_AGE_SECONDS = 5 * 60;

function normalizeOAuthResumePath(value: string | null | undefined): string | null {
  const safePath = resolveSafeRedirectPath(value, '');
  if (!safePath) {
    return null;
  }

  const url = new URL(safePath, 'https://beemspec.local');
  const authorizationId = url.searchParams.get('authorization_id')?.trim();

  if (url.pathname !== '/oauth/consent' || !authorizationId) {
    return null;
  }

  return `${url.pathname}${url.search}`;
}

export function serializeOAuthLoginResumePath(path: string): string | null {
  const normalizedPath = normalizeOAuthResumePath(path);
  if (!normalizedPath) {
    return null;
  }

  return encodeURIComponent(normalizedPath);
}

export function parseOAuthLoginResumePath(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  try {
    return normalizeOAuthResumePath(decodeURIComponent(value));
  } catch {
    return null;
  }
}
