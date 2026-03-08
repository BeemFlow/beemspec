export function resolveRequestOrigin(request: Request): string {
  const forwardedProto = request.headers.get('x-forwarded-proto')?.split(',')[0]?.trim();
  const forwardedHost = request.headers.get('x-forwarded-host')?.split(',')[0]?.trim();
  const host = forwardedHost ?? request.headers.get('host')?.trim();

  if (host) {
    const fallbackProtocol = new URL(request.url).protocol.replace(':', '');
    const protocol = forwardedProto || fallbackProtocol;
    return `${protocol}://${host}`;
  }

  return new URL(request.url).origin;
}

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
