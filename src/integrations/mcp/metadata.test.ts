import { describe, expect, it } from 'vitest';
import {
  buildMcpResourceUrl,
  buildProtectedResourceMetadata,
  buildProtectedResourceMetadataPath,
  buildProtectedResourceMetadataUrl,
  MCP_DEFAULT_RESOURCE_PATH,
  MCP_DEFAULT_SCOPES,
} from './metadata';

describe('mcp metadata helpers', () => {
  const origin = 'https://beemspec.example.com';
  const supabaseOrigin = 'https://project-ref.supabase.co';

  it('uses supabase oauth issuer for metadata', () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = supabaseOrigin;

    const metadata = buildProtectedResourceMetadata(origin, '/api/mcp');
    expect(metadata.authorization_servers).toEqual([`${supabaseOrigin}/auth/v1`]);
  });

  it('builds RFC9728 metadata path for resource path', () => {
    expect(buildProtectedResourceMetadataPath(MCP_DEFAULT_RESOURCE_PATH)).toBe(
      '/.well-known/oauth-protected-resource/api/mcp',
    );
    expect(buildProtectedResourceMetadataPath('/')).toBe('/.well-known/oauth-protected-resource');
  });

  it('builds protected resource metadata URL from origin and resource path', () => {
    expect(buildProtectedResourceMetadataUrl(origin, '/api/mcp')).toBe(
      'https://beemspec.example.com/.well-known/oauth-protected-resource/api/mcp',
    );
  });

  it('builds protected resource metadata with expected defaults', () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = supabaseOrigin;
    const metadata = buildProtectedResourceMetadata(origin, '/api/mcp');

    expect(metadata.resource).toBe(buildMcpResourceUrl(origin, '/api/mcp'));
    expect(metadata.authorization_servers).toEqual([`${supabaseOrigin}/auth/v1`]);
    expect(metadata.scopes_supported).toEqual(MCP_DEFAULT_SCOPES.length > 0 ? MCP_DEFAULT_SCOPES : undefined);
    expect(metadata.bearer_methods_supported).toEqual(['header']);
  });
});
