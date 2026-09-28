import {
  getOAuthProtectedResourceMetadataUrl,
  type OAuthProtectedResourceMetadata,
  resourceUrlFromServerUrl,
} from '@modelcontextprotocol/server';
import { env } from '@/lib/env';

export const MCP_DEFAULT_RESOURCE_PATH = '/api/mcp';
export const MCP_DEFAULT_SCOPES: string[] = [];

function buildSupabaseOAuthIssuer(originFallback?: string): string {
  const supabaseUrl = env.supabaseUrl() ?? originFallback;
  if (!supabaseUrl) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL for MCP OAuth metadata');
  }

  return new URL('/auth/v1', supabaseUrl).toString().replace(/\/+$/, '');
}

function normalizePath(pathname: string): string {
  if (!pathname || pathname === '/') return '/';

  const trimmed = pathname.startsWith('/') ? pathname : `/${pathname}`;
  return trimmed.length > 1 ? trimmed.replace(/\/+$/, '') : trimmed;
}

export function buildMcpResourceUrl(origin: string, resourcePath = MCP_DEFAULT_RESOURCE_PATH): string {
  return resourceUrlFromServerUrl(`${origin}${normalizePath(resourcePath)}`).toString();
}

export function buildProtectedResourceMetadataPath(resourcePath = MCP_DEFAULT_RESOURCE_PATH): string {
  return new URL(buildProtectedResourceMetadataUrl('https://local.test', resourcePath)).pathname;
}

export function buildProtectedResourceMetadataUrl(origin: string, resourcePath = MCP_DEFAULT_RESOURCE_PATH): string {
  return getOAuthProtectedResourceMetadataUrl(new URL(buildMcpResourceUrl(origin, resourcePath)));
}

export function buildProtectedResourceMetadata(
  origin: string,
  resourcePath = MCP_DEFAULT_RESOURCE_PATH,
): OAuthProtectedResourceMetadata {
  const metadata: OAuthProtectedResourceMetadata = {
    resource: buildMcpResourceUrl(origin, resourcePath),
    authorization_servers: [buildSupabaseOAuthIssuer(origin)],
    bearer_methods_supported: ['header'],
  };

  if (MCP_DEFAULT_SCOPES.length > 0) {
    metadata.scopes_supported = MCP_DEFAULT_SCOPES;
  }

  return metadata;
}
