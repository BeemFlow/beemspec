import { getOAuthProtectedResourceMetadataUrl } from '@modelcontextprotocol/sdk/server/auth/router.js';
import {
  type OAuthMetadata,
  OAuthMetadataSchema,
  type OAuthProtectedResourceMetadata,
  OAuthProtectedResourceMetadataSchema,
} from '@modelcontextprotocol/sdk/shared/auth.js';
import { resourceUrlFromServerUrl } from '@modelcontextprotocol/sdk/shared/auth-utils.js';

export const MCP_DEFAULT_RESOURCE_PATH = '/api/mcp';
export const MCP_DEFAULT_SCOPE = 'mcp:tools';

function normalizePath(pathname: string): string {
  if (!pathname || pathname === '/') return '/';

  const trimmed = pathname.startsWith('/') ? pathname : `/${pathname}`;
  return trimmed.length > 1 ? trimmed.replace(/\/+$/, '') : trimmed;
}

export function buildMcpResourceUrl(origin: string, resourcePath = MCP_DEFAULT_RESOURCE_PATH): string {
  return resourceUrlFromServerUrl(`${origin}${normalizePath(resourcePath)}`).toString();
}

export function buildProtectedResourceMetadataPath(resourcePath = MCP_DEFAULT_RESOURCE_PATH): string {
  const metadataUrl = getOAuthProtectedResourceMetadataUrl(new URL(`https://local.test${normalizePath(resourcePath)}`));
  return new URL(metadataUrl).pathname;
}

export function buildProtectedResourceMetadataUrl(origin: string, resourcePath = MCP_DEFAULT_RESOURCE_PATH): string {
  return getOAuthProtectedResourceMetadataUrl(new URL(buildMcpResourceUrl(origin, resourcePath)));
}

export function buildProtectedResourceMetadata(origin: string, resourcePath = MCP_DEFAULT_RESOURCE_PATH) {
  const metadata: OAuthProtectedResourceMetadata = {
    resource: buildMcpResourceUrl(origin, resourcePath),
    authorization_servers: [origin],
    bearer_methods_supported: ['header'],
    scopes_supported: [MCP_DEFAULT_SCOPE],
  };

  return OAuthProtectedResourceMetadataSchema.parse(metadata);
}

export function buildOAuthAuthorizationServerMetadata(origin: string): OAuthMetadata {
  const metadata: OAuthMetadata = {
    issuer: origin,
    authorization_endpoint: `${origin}/api/mcp/oauth/authorize`,
    token_endpoint: `${origin}/api/mcp/oauth/token`,
    registration_endpoint: `${origin}/api/mcp/oauth/register`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    token_endpoint_auth_methods_supported: ['none'],
    code_challenge_methods_supported: ['S256'],
    scopes_supported: [MCP_DEFAULT_SCOPE],
    client_id_metadata_document_supported: false,
  };

  return OAuthMetadataSchema.parse(metadata);
}
