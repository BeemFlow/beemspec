import { createLinearWebhookIngest, createLinearWebhookSignatureVerifier } from '@beemspec/linear';
import type { WebhookIngest, WebhookSignatureVerifier } from '@/integrations/sync';
import { env } from '@/lib/env';

/**
 * Create a Linear WebhookIngest instance using the configured webhook secret.
 * Returns null when no secret is set.
 */
export function getLinearWebhookIngest(): WebhookIngest | null {
  return createLinearWebhookIngest(Boolean(env.linearWebhookSecret()));
}

/**
 * Create a Linear WebhookSignatureVerifier using the configured webhook secret.
 * Returns null when no secret is set.
 */
export function getLinearWebhookSignatureVerifier(): WebhookSignatureVerifier | null {
  const secret = env.linearWebhookSecret();
  if (!secret) return null;
  return createLinearWebhookSignatureVerifier({ secret });
}
