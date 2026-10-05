'use strict';

// Node driver: built-in node:sqlite behind the async interface described in db.js.

const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');
const path = require('node:path');
const { SETUP_STATEMENTS } = require('./db');

function open(file) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const sqlite = new DatabaseSync(file);
  sqlite.exec('PRAGMA foreign_keys = ON;');
  if (file !== ':memory:') sqlite.exec('PRAGMA journal_mode = WAL;');

  const cache = new Map();
  const stmt = (sql) => {
    let s = cache.get(sql);
    if (!s) cache.set(sql, (s = sqlite.prepare(sql)));
    return s;
  };
  const runSync = (sql, params) => {
    const r = stmt(sql).run(...params);
    return { lastInsertRowid: Number(r.lastInsertRowid), changes: Number(r.changes) };
  };
  const batchSync = (statements) => {
    sqlite.exec('BEGIN');
    try {
      const results = statements.map(([sql, ...params]) => runSync(sql, params));
      sqlite.exec('COMMIT');
      return results;
    } catch (err) {
      sqlite.exec('ROLLBACK');
      throw err;
    }
  };

  batchSync(SETUP_STATEMENTS);

  return {
    get: async (sql, ...params) => stmt(sql).get(...params),
    all: async (sql, ...params) => stmt(sql).all(...params),
    run: async (sql, ...params) => runSync(sql, params),
    batch: async (statements) => batchSync(statements),
    ready: async () => {},
    sqlite, // raw synchronous handle, for Node-only scripts
  };
}

module.exports = { open };
