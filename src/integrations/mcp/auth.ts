import {
  type AuthInfo,
  OAuthError,
  OAuthErrorCode,
  type OAuthTokenVerifier,
  requireBearerAuth,
} from '@modelcontextprotocol/server';
import { buildProtectedResourceMetadataUrl } from '@/integrations/mcp/metadata';
import { resolveRequestOrigin } from '@/integrations/mcp/origin';
import type { AuthenticatedUser } from '@/lib/auth';
import { createClientForAccessToken } from '@/lib/supabase/token';
import type { Supabase } from '@/lib/supabase/types';

export interface McpAuthContext {
  user: AuthenticatedUser;
  supabase: Supabase;
}

const AUTH_CONTEXT_KEY = 'beemspec';

function invalidToken(message: string): never {
  throw new OAuthError(OAuthErrorCode.InvalidToken, message);
}

const supabaseTokenVerifier: OAuthTokenVerifier = {
  async verifyAccessToken(token) {
    const supabase = createClientForAccessToken(token);
    const { data, error } = await supabase.auth.getClaims(token);
    const claims = data?.claims;

    if (error || typeof claims?.sub !== 'string' || !claims.sub || typeof claims.exp !== 'number') {
      invalidToken('The access token is invalid or missing required claims');
    }

    const user: AuthenticatedUser = {
      id: claims.sub,
      email: typeof claims.email === 'string' ? claims.email : '',
    };

    return {
      token,
      clientId: typeof claims.client_id === 'string' ? claims.client_id : claims.sub,
      scopes: [],
      expiresAt: claims.exp,
      extra: {
        [AUTH_CONTEXT_KEY]: { user, supabase } satisfies McpAuthContext,
      },
    };
  },
};

export function getMcpAuthContext(authInfo: AuthInfo | undefined): McpAuthContext {
  const context = authInfo?.extra?.[AUTH_CONTEXT_KEY];
  if (
    !context ||
    typeof context !== 'object' ||
    !('user' in context) ||
    !context.user ||
    typeof context.user !== 'object' ||
    !('id' in context.user) ||
    typeof context.user.id !== 'string' ||
    !('email' in context.user) ||
    typeof context.user.email !== 'string' ||
    !('supabase' in context) ||
    !context.supabase ||
    typeof context.supabase !== 'object'
  ) {
    throw new Error('Missing authenticated BeemSpec context');
  }

  return context as unknown as McpAuthContext;
}

export function createMcpAuthInfo(token: string, context: McpAuthContext, expiresAt?: number): AuthInfo {
  return {
    token,
    clientId: context.user.id,
    scopes: [],
    expiresAt,
    extra: { [AUTH_CONTEXT_KEY]: context },
  };
}

export async function authenticateMcpRequest(request: Request): Promise<AuthInfo | Response> {
  const origin = resolveRequestOrigin(request);
  const pathname = new URL(request.url).pathname;
  const authenticate = requireBearerAuth({
    verifier: supabaseTokenVerifier,
    resourceMetadataUrl: buildProtectedResourceMetadataUrl(origin, pathname),
  });

  return authenticate(request);
}
