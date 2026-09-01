import { NextResponse } from 'next/server';
import { buildProtectedResourceMetadataUrl } from '@/integrations/mcp/metadata';
import { resolveRequestOrigin } from '@/integrations/mcp/origin';
import { type AuthenticatedUser, getAuthenticatedUser } from '@/lib/auth';
import { createClientForAccessToken } from '@/lib/supabase/token';
import type { Supabase } from '@/lib/supabase/types';

function buildWwwAuthenticateHeader(request: Request, error: 'invalid_request' | 'invalid_token'): string {
  const origin = resolveRequestOrigin(request);
  const pathname = new URL(request.url).pathname;
  const resourceMetadata = buildProtectedResourceMetadataUrl(origin, pathname);
  return ['Bearer realm="beemspec-mcp"', `error="${error}"`, `resource_metadata="${resourceMetadata}"`].join(', ');
}

function unauthorizedResponse(request: Request, error: 'invalid_request' | 'invalid_token') {
  const response = NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  response.headers.set('WWW-Authenticate', buildWwwAuthenticateHeader(request, error));
  return response;
}

function parseBearerToken(request: Request): string | null {
  const authHeader = request.headers.get('authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) return null;

  const token = authHeader.slice('Bearer '.length).trim();
  return token.length > 0 ? token : null;
}

export type McpAuthResult =
  | {
      ok: true;
      user: AuthenticatedUser;
      supabase: Supabase;
    }
  | {
      ok: false;
      response: Response;
    };

export async function authenticateMcpRequest(request: Request): Promise<McpAuthResult> {
  const accessToken = parseBearerToken(request);
  if (!accessToken) {
    return {
      ok: false,
      response: unauthorizedResponse(request, 'invalid_request'),
    };
  }

  const supabase = createClientForAccessToken(accessToken);
  const user = await getAuthenticatedUser(supabase, accessToken);

  if (!user) {
    return {
      ok: false,
      response: unauthorizedResponse(request, 'invalid_token'),
    };
  }

  return {
    ok: true,
    user,
    supabase,
  };
}
