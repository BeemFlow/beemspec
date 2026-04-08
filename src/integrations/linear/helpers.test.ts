import { beforeEach, describe, expect, it, vi } from 'vitest';

const { envMock, createLinearWebhookIngestMock, createLinearWebhookSignatureVerifierMock } = vi.hoisted(() => ({
  envMock: {
    linearWebhookSecret: vi.fn(),
  },
  createLinearWebhookIngestMock: vi.fn(),
  createLinearWebhookSignatureVerifierMock: vi.fn(),
}));

vi.mock('@/lib/env', () => ({ env: envMock }));
vi.mock('@beemspec/linear', () => ({
  createLinearWebhookIngest: createLinearWebhookIngestMock,
  createLinearWebhookSignatureVerifier: createLinearWebhookSignatureVerifierMock,
}));

import { getLinearWebhookIngest, getLinearWebhookSignatureVerifier } from './helpers';

describe('linear webhook helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates ingest using the presence of a configured secret', () => {
    envMock.linearWebhookSecret.mockReturnValue('secret-1');
    createLinearWebhookIngestMock.mockReturnValue({ ingest: true });

    expect(getLinearWebhookIngest()).toEqual({ ingest: true });
    expect(createLinearWebhookIngestMock).toHaveBeenCalledWith(true);
  });

  it('returns no verifier when no webhook secret exists', () => {
    envMock.linearWebhookSecret.mockReturnValue(null);

    expect(getLinearWebhookSignatureVerifier()).toBeNull();
    expect(createLinearWebhookSignatureVerifierMock).not.toHaveBeenCalled();
  });

  it('creates a signature verifier with the configured secret', () => {
    envMock.linearWebhookSecret.mockReturnValue('secret-1');
    createLinearWebhookSignatureVerifierMock.mockReturnValue({ verify: true });

    expect(getLinearWebhookSignatureVerifier()).toEqual({ verify: true });
    expect(createLinearWebhookSignatureVerifierMock).toHaveBeenCalledWith({ secret: 'secret-1' });
  });
});
