/**
 * Normalize a nullable string value: trim whitespace and convert empty
 * strings to null. Returns null for falsy input.
 */
export function normalize(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}
