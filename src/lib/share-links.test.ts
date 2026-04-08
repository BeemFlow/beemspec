import { beforeEach, describe, expect, it } from 'vitest';
import { createShareToken, verifyShareToken } from './share-links';

const PROCESS_FLOW_ID = 'd7f34189-5d27-4dc0-b2c5-23d11796add4';

describe('share-links', () => {
  beforeEach(() => {
    process.env.SHARE_LINK_SECRET = 'test-share-link-secret';
  });

  it('creates and verifies a token for a shared resource', () => {
    const token = createShareToken({ resource: 'process-flow', resourceId: PROCESS_FLOW_ID, expiresAt: null });

    expect(verifyShareToken(token)).toEqual({
      ok: true,
      resource: 'process-flow',
      resourceId: PROCESS_FLOW_ID,
      expiresAt: null,
    });
  });

  it('rejects tampered tokens', () => {
    const token = createShareToken({ resource: 'process-flow', resourceId: PROCESS_FLOW_ID, expiresAt: null });
    const [payload, signature] = token.split('.');
    const tamperedPayload = Buffer.from(
      JSON.stringify({ v: 1, resource: 'story-map', resourceId: '34e8bb98-8f40-4331-8df2-8f83fd8c7af4' }),
    ).toString('base64url');

    expect(verifyShareToken(`${tamperedPayload}.${signature}`)).toEqual({ ok: false, reason: 'invalid' });
    expect(verifyShareToken(`${payload}.bad-signature`)).toEqual({ ok: false, reason: 'invalid' });
  });

  it('rejects expired tokens', () => {
    const token = createShareToken({
      resource: 'process-flow',
      resourceId: PROCESS_FLOW_ID,
      expiresAt: new Date('2020-01-01T00:00:00.000Z'),
    });

    expect(verifyShareToken(token)).toEqual({ ok: false, reason: 'expired' });
  });
});
