// Uniform success/error response shape — docs/08-api-design.md §8.3.
import { CORS_HEADERS } from './cors.ts';

export type ErrorCode =
  | 'VALIDATION_FAILED'
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'AI_VALIDATION_FAILED'
  | 'UPSTREAM_FAILURE'
  | 'UPSTREAM_TIMEOUT'
  | 'INTERNAL';

const STATUS_FOR_CODE: Record<ErrorCode, number> = {
  VALIDATION_FAILED: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  AI_VALIDATION_FAILED: 422,
  UPSTREAM_FAILURE: 502,
  UPSTREAM_TIMEOUT: 504,
  INTERNAL: 500,
};

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

export function errorResponse(code: ErrorCode, message: string): Response {
  return jsonResponse({ error: { code, message } }, STATUS_FOR_CODE[code]);
}

export class HttpError extends Error {
  code: ErrorCode;
  constructor(code: ErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

export async function withErrorHandling(fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof HttpError) {
      return errorResponse(err.code, err.message);
    }
    console.error('unhandled_error', err instanceof Error ? err.message : err);
    return errorResponse('INTERNAL', 'Something went wrong.');
  }
}
