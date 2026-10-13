import type { Context } from 'hono';
import { ZodError, type ZodTypeAny, type z } from 'zod';

export class HttpError extends Error {
  constructor(public status: number, public code: string, message: string, public details?: unknown) {
    super(message);
  }
}
export const badRequest = (m: string, d?: unknown) => new HttpError(400, 'bad_request', m, d);
export const unauthorized = (m = 'Authentication required') => new HttpError(401, 'unauthorized', m);
export const forbidden = (m = 'You do not have permission to do this') => new HttpError(403, 'forbidden', m);
export const notFound = (m = 'Not found') => new HttpError(404, 'not_found', m);
export const conflict = (m: string, code = 'conflict', d?: unknown) => new HttpError(409, code, m, d);
export const unprocessable = (m: string, d?: unknown) => new HttpError(422, 'unprocessable', m, d);
export const tooMany = (m = 'Too many requests. Please try again shortly.') => new HttpError(429, 'rate_limited', m);
export const notConfigured = (m: string) => new HttpError(503, 'not_configured', m);

/** Parse and validate a JSON body. Never trusts tenant_id or role fields: schemas simply don't include them. */
export async function body<S extends ZodTypeAny>(c: Context, schema: S): Promise<z.infer<S>> {
  const ct = c.req.header('content-type') ?? '';
  if (!ct.includes('application/json')) throw new HttpError(415, 'unsupported_media_type', 'Expected application/json');
  let raw: unknown;
  try { raw = await c.req.json(); } catch { throw badRequest('Request body is not valid JSON'); }
  return parse(schema, raw);
}

export function parse<S extends ZodTypeAny>(schema: S, raw: unknown): z.infer<S> {
  const r = schema.safeParse(raw);
  if (!r.success) throw new HttpError(400, 'validation_error', 'Some fields are invalid', fieldErrors(r.error));
  return r.data;
}

function fieldErrors(e: ZodError) {
  return e.issues.map((i) => ({ field: i.path.join('.'), message: i.message }));
}

export function errorBody(e: HttpError) {
  return { error: { code: e.code, message: e.message, details: e.details } };
}
