export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    /** Extra JSON fields for the response body, e.g. per-field validation messages. */
    public extra?: Record<string, unknown>,
  ) {
    super(message);
  }
}

/** A short, non-personal error identifier (SQLSTATE, Node error code or error class). */
export function errorCode(err: unknown) {
  if (err && typeof err === 'object') {
    const { code, name } = err as { code?: unknown; name?: unknown };
    if (typeof code === 'string' && code) return code;
    if (typeof name === 'string' && name) return name;
  }
  return 'unknown';
}

// Only the error code is logged: database error messages can quote submitted personal data.
export function logError(scope: string, err: unknown) {
  console.error(`[portal] ${scope} failed (${errorCode(err)})`);
}

export const SCHEMA_OUTDATED = new Set(['42P01', '42703']); // undefined table / column
