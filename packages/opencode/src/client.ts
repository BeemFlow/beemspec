import { createOpencodeClient } from '@opencode-ai/sdk';

/** Configuration for the OpenCode SDK client. Injected by the app layer. */
export interface OpenCodeClientConfig {
  /** Base URL for the OpenCode HTTP API (e.g., http://127.0.0.1:4096). */
  baseUrl: string;
  /** Base URL for the OpenCode web UI (falls back to baseUrl if not set). */
  webBaseUrl?: string;
  /** Default working directory for sessions. */
  workingDirectory?: string;
  /** Basic auth username (default: 'opencode'). */
  serverUsername?: string;
  /** Basic auth password. If absent, no auth header is sent. */
  serverPassword?: string;
}

export type OpenCodeClient = ReturnType<typeof createOpencodeClient>;

/** Build the Basic auth header from config, or null if no password. */
export function buildAuthorizationHeader(config: OpenCodeClientConfig): string | null {
  if (!config.serverPassword) return null;
  const username = config.serverUsername ?? 'opencode';
  const encoded = Buffer.from(`${username}:${config.serverPassword}`).toString('base64');
  return `Basic ${encoded}`;
}

/** Build the web URL for a specific session. */
export function buildSessionUrl(config: OpenCodeClientConfig, sessionId: string, workingDirectory?: string): string {
  const baseUrl = config.webBaseUrl ?? config.baseUrl;
  const dir = workingDirectory ?? config.workingDirectory;
  if (dir) {
    const encodedDir = Buffer.from(dir).toString('base64').replace(/=+$/, '');
    return `${baseUrl.replace(/\/$/, '')}/${encodedDir}/session/${sessionId}`;
  }
  return `${baseUrl.replace(/\/$/, '')}/session/${sessionId}`;
}

/**
 * Create an OpenCode SDK client. Config is injected — no env vars are read.
 */
export function createOpenCodeClient(config: OpenCodeClientConfig): OpenCodeClient {
  const authorization = buildAuthorizationHeader(config);
  return createOpencodeClient({
    baseUrl: config.baseUrl,
    headers: authorization ? { authorization } : undefined,
  });
}
