import { describe, expect, it } from 'vitest';
import { parseStateCookie, serializeStateCookie } from './oauth';

describe('linear oauth state cookie helpers', () => {
  it('serializes and parses oauth state payloads', () => {
    const value = serializeStateCookie({
      state: 'state-1',
      teamId: 'team-1',
      userId: 'user-1',
      returnTo: '/settings?tab=integrations',
    });

    expect(parseStateCookie(value)).toEqual({
      state: 'state-1',
      teamId: 'team-1',
      userId: 'user-1',
      returnTo: '/settings?tab=integrations',
    });
  });

  it('guards against invalid or unsafe cookie payloads', () => {
    expect(parseStateCookie(undefined)).toBeNull();
    expect(parseStateCookie('not-base64')).toBeNull();
    expect(
      parseStateCookie(
        Buffer.from(
          JSON.stringify({
            state: 'state-1',
            teamId: 'team-1',
            userId: 'user-1',
            returnTo: 'https://evil.example.com',
          }),
        ).toString('base64url'),
      ),
    ).toEqual({
      state: 'state-1',
      teamId: 'team-1',
      userId: 'user-1',
      returnTo: '/',
    });
  });
});
