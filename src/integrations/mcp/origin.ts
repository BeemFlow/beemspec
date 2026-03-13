export { resolveRequestOrigin } from '@/lib/request-url';

import { resolveRequestOrigin } from '@/lib/request-url';

function normalizeComparableOrigin(origin: string): string | null {
  try {
    const parsed = new URL(origin);
    const isLoopback = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';
    if (isLoopback) {
      parsed.hostname = '127.0.0.1';
    }

    if (
      (parsed.protocol === 'http:' && parsed.port === '80') ||
      (parsed.protocol === 'https:' && parsed.port === '443')
    ) {
      parsed.port = '';
    }

    return parsed.origin;
  } catch {
    return null;
  }
}

export function isTrustedRequestOrigin(request: Request): boolean {
  const originHeader = request.headers.get('origin');
  if (!originHeader) {
    return true;
  }

  const provided = normalizeComparableOrigin(originHeader);
  if (!provided) {
    return false;
  }

  const expected = normalizeComparableOrigin(resolveRequestOrigin(request));
  if (!expected) {
    return false;
  }

  return provided === expected;
}
