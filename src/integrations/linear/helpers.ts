import type { LinearWebhookIngest, LinearWebhookSignatureVerifier } from '@/integrations/linear/adapter';
import { createLinearWebhookIngest, createLinearWebhookSignatureVerifier } from '@/integrations/linear/adapter';
import { env } from '@/lib/env';

/**
 * Create a Linear LinearWebhookIngest instance using the configured webhook secret.
 * Returns null when no secret is set.
 */
export function getLinearWebhookIngest(): LinearWebhookIngest | null {
  return createLinearWebhookIngest(Boolean(env.linearWebhookSecret()));
}

/**
 * Create a Linear LinearWebhookSignatureVerifier using the configured webhook secret.
 * Returns null when no secret is set.
 */
export function getLinearWebhookSignatureVerifier(): LinearWebhookSignatureVerifier | null {
  const secret = env.linearWebhookSecret();
  if (!secret) return null;
  return createLinearWebhookSignatureVerifier({ secret });
}
