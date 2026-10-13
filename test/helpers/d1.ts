import { createRequire } from 'node:module';
import type { DatabaseSync as DatabaseSyncT } from 'node:sqlite';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// Vite's resolver doesn't know the experimental node:sqlite builtin, so load it through require.
const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as typeof import('node:sqlite');
type DatabaseSync = DatabaseSyncT;

/** Minimal D1Database implementation backed by node:sqlite so tests exercise real SQLite constraints and transactions. */
class Stmt {
  constructor(private db: DatabaseSync, readonly sql: string, private params: unknown[] = []) {}
  bind(...p: unknown[]) { return new Stmt(this.db, this.sql, p.map((x) => (x === undefined ? null : x))); }
  private isRead() { return /^\s*(select|with|pragma)/i.test(this.sql); }
  runSync() {
    const s = this.db.prepare(this.sql);
    if (this.isRead()) { const results = s.all(...(this.params as any[])) as any[]; return { success: true, results, meta: { changes: 0, rows_read: results.length } }; }
    const r = s.run(...(this.params as any[]));
    return { success: true, results: [], meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } };
  }
  async first<T>(col?: string): Promise<T | null> {
    const r = this.runSync().results as any[]; const row = r[0] ?? null;
    return row ? (col ? row[col] : row) : null;
  }
  async all<T>() { return this.runSync() as unknown as D1Result<T>; }
  async run() { return this.runSync() as unknown as D1Result; }
  async raw() { return (this.runSync().results as any[]).map((r) => Object.values(r)); }
}

export class TestD1 {
  readonly raw: DatabaseSync;
  constructor() {
    this.raw = new DatabaseSync(':memory:');
    this.raw.exec('PRAGMA foreign_keys = ON');
  }
  prepare(sql: string) { return new Stmt(this.raw, sql) as unknown as D1PreparedStatement; }
  async batch(stmts: D1PreparedStatement[]) {
    this.raw.exec('BEGIN');
    try {
      const out = (stmts as unknown as Stmt[]).map((s) => s.runSync());
      this.raw.exec('COMMIT');
      return out as unknown as D1Result[];
    } catch (e) { this.raw.exec('ROLLBACK'); throw e; }
  }
  async exec(sql: string) { this.raw.exec(sql); return { count: 1, duration: 0 }; }
  dump(): never { throw new Error('not implemented'); }
}

export function migratedDb(): D1Database {
  const db = new TestD1();
  const dir = join(process.cwd(), 'migrations');
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.sql')).sort()) db.raw.exec(readFileSync(join(dir, f), 'utf8'));
  return db as unknown as D1Database;
}
