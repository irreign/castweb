import { run, first, type DB } from './db';
import { tooMany } from './http';

/** Fixed-window limiter in D1. Cheap, works at pilot scale; swap for the Workers Rate Limiting binding if traffic grows. */
export async function rateLimit(db: DB, key: string, limit: number, windowSec: number) {
  const windowStart = Math.floor(Date.now() / 1000 / windowSec) * windowSec;
  await run(db, 'INSERT INTO rate_limits (key, window_start, count) VALUES (?,?,1) ON CONFLICT(key, window_start) DO UPDATE SET count = count + 1', key, windowStart);
  const r = await first<{ count: number }>(db, 'SELECT count FROM rate_limits WHERE key = ? AND window_start = ?', key, windowStart);
  if ((r?.count ?? 0) > limit) throw tooMany();
  if (Math.random() < 0.02) await run(db, 'DELETE FROM rate_limits WHERE window_start < ?', windowStart - 3600);
}

export const clientIp = (req: Request) => req.headers.get('cf-connecting-ip') ?? 'local';
