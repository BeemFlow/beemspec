type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null;
}

export class HttpError extends Error {
  status: number;
  payload: unknown;

  constructor(message: string, status: number, payload?: unknown) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.payload = payload;
  }
}

export async function readJsonSafe<T>(response: Response): Promise<T | null> {
  try {
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

export function getResponseErrorMessage(payload: unknown, fallback: string): string {
  if (isRecord(payload) && typeof payload.error === 'string' && payload.error.trim()) {
    return payload.error;
  }

  return fallback;
}

export async function fetchJson<T>(
  input: RequestInfo | URL,
  init?: RequestInit,
  fallbackError = 'Request failed',
): Promise<T> {
  const response = await fetch(input, init);
  const payload = await readJsonSafe<T | JsonRecord>(response);

  if (!response.ok) {
    throw new HttpError(getResponseErrorMessage(payload, fallbackError), response.status, payload);
  }

  return payload as T;
}
