import type { Env } from './env';

export type DB = D1Database;

export const nowIso = () => new Date().toISOString();
export const dayOf = (iso = nowIso()) => iso.slice(0, 10);

export function newId(prefix: string): string {
  const b = crypto.getRandomValues(new Uint8Array(12));
  return `${prefix}_${[...b].map((x) => x.toString(16).padStart(2, '0')).join('')}`;
}

export async function first<T = Record<string, unknown>>(db: DB, sql: string, ...args: unknown[]): Promise<T | null> {
  return (await db.prepare(sql).bind(...args).first<T>()) ?? null;
}

export async function all<T = Record<string, unknown>>(db: DB, sql: string, ...args: unknown[]): Promise<T[]> {
  const r = await db.prepare(sql).bind(...args).all<T>();
  return r.results ?? [];
}

export async function run(db: DB, sql: string, ...args: unknown[]) {
  return db.prepare(sql).bind(...args).run();
}

export const changes = (r: D1Result): number => r.meta?.changes ?? 0;

export function isUniqueViolation(e: unknown): boolean {
  return /UNIQUE constraint failed|constraint failed: UNIQUE|SQLITE_CONSTRAINT/i.test(String((e as Error)?.message ?? e));
}

export function parseJson<T>(s: string | null | undefined, fallback: T): T {
  if (!s) return fallback;
  try { return JSON.parse(s) as T; } catch { return fallback; }
}

/** Escape LIKE wildcards so user search text is matched literally. */
export const likeEscape = (s: string) => s.replace(/[\\%_]/g, (c) => '\\' + c);

export type { Env };
