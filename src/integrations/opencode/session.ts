import type { OpenCodeClientConfig, OpenCodeSessionService } from '@beemspec/opencode';
import { createOpenCodeSessionService } from '@beemspec/opencode';
import { env } from '@/lib/env';

export type OpenCodeSessions = OpenCodeSessionService;

/** Check whether a request carries a valid OpenCode bearer token. */
export function isAuthorizedByOpenCodeToken(request: Request): boolean {
  const token = env.openCodeToken();
  if (!token) return false;

  const authHeader = request.headers.get('authorization') ?? '';
  return authHeader === `Bearer ${token}`;
}

/** Build an OpenCodeClientConfig from environment variables. */
function getOpenCodeConfig(): OpenCodeClientConfig {
  return {
    baseUrl: env.openCodeBaseUrl(),
    webBaseUrl: env.openCodeWebBaseUrl() ?? undefined,
    workingDirectory: env.openCodeWorkingDirectory() ?? undefined,
    serverUsername: env.openCodeServerUsername() ?? undefined,
    serverPassword: env.openCodeServerPassword() ?? undefined,
  };
}

/**
 * Create an OpenCodeSessionService using env-based config.
 * Returns null when `enabled` is false.
 */
export function createOpenCodeSessions(enabled: boolean): OpenCodeSessions | null {
  return createOpenCodeSessionService(enabled, getOpenCodeConfig());
}

/** Expose the config builder for other app-layer consumers (e.g., projects route). */
export function getOpenCodeClientConfig(): OpenCodeClientConfig {
  return getOpenCodeConfig();
}
