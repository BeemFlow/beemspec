export { resolveRequestOrigin } from '@/lib/request-url';

import { env } from '@/lib/env';
import { resolveRequestOrigin } from '@/lib/request-url';

const DEFAULT_MCP_BROWSER_ORIGINS = ['https://claude.ai'];

function appendVaryValue(headers: Headers, value: string) {
  const current = headers.get('Vary');
  if (!current) {
    headers.set('Vary', value);
    return;
  }

  const values = current
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.length > 0);

  if (!values.includes(value)) {
    values.push(value);
    headers.set('Vary', values.join(', '));
  }
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

function getConfiguredAllowedOrigins(): Set<string> {
  const allowed = new Set<string>();

  for (const origin of [...DEFAULT_MCP_BROWSER_ORIGINS, ...env.mcpAllowedOrigins()]) {
    const normalized = normalizeComparableOrigin(origin);
    if (normalized) {
      allowed.add(normalized);
    }
  }

  return allowed;
}

export function getAllowedMcpRequestOrigin(request: Request): string | null {
  const originHeader = request.headers.get('origin');
  if (!originHeader) {
    return null;
  }

  const provided = normalizeComparableOrigin(originHeader);
  if (!provided) {
    return null;
  }

  const expected = normalizeComparableOrigin(resolveRequestOrigin(request));
  if (provided === expected) {
    return provided;
  }

  return getConfiguredAllowedOrigins().has(provided) ? provided : null;
}

export function isTrustedRequestOrigin(request: Request): boolean {
  const originHeader = request.headers.get('origin');
  if (!originHeader) {
    return true;
  }

  return getAllowedMcpRequestOrigin(request) !== null;
}

export function applyMcpCorsHeaders(response: Response, request: Request): Response {
  const allowedOrigin = getAllowedMcpRequestOrigin(request);
  if (!allowedOrigin) {
    return response;
  }

  response.headers.set('Access-Control-Allow-Origin', allowedOrigin);
  response.headers.set('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  response.headers.set(
    'Access-Control-Allow-Headers',
    'Authorization, Content-Type, Accept, Mcp-Session-Id, Last-Event-ID',
  );
  response.headers.set('Access-Control-Expose-Headers', 'WWW-Authenticate, Mcp-Session-Id');
  response.headers.set('Access-Control-Max-Age', '86400');
  appendVaryValue(response.headers, 'Origin');

  return response;
}
