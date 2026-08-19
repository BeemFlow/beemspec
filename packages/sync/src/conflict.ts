export function parseTimestampMs(value: string | null | undefined): number | null {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

export function shouldApplyRemoteUpdate(remoteUpdatedAt: string | null, localUpdatedAt: string | null): boolean {
  const remoteMs = parseTimestampMs(remoteUpdatedAt);
  const localMs = parseTimestampMs(localUpdatedAt);
  if (remoteMs === null || localMs === null) return false;
  return remoteMs > localMs;
}
