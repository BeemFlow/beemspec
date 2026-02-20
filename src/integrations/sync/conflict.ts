/**
 * Parse a timestamp string into milliseconds since epoch.
 * Returns null for falsy, unparseable, or non-finite values.
 */
export function parseTimestampMs(value: string | null | undefined): number | null {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

/**
 * Determine whether a remote update should overwrite the local state.
 * Returns true only when both timestamps are valid and remote is strictly newer.
 */
export function shouldApplyRemoteUpdate(remoteUpdatedAt: string | null, localUpdatedAt: string | null): boolean {
  const remoteMs = parseTimestampMs(remoteUpdatedAt);
  const localMs = parseTimestampMs(localUpdatedAt);
  if (remoteMs === null || localMs === null) return false;
  return remoteMs > localMs;
}
