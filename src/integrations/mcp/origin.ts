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
