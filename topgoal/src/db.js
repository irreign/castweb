'use strict';

const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');
const path = require('node:path');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY,
  username      TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user','mod','admin')),
  verified      INTEGER NOT NULL DEFAULT 0,
  verified_at   INTEGER,
  verify_code   TEXT NOT NULL,
  ign           TEXT,
  fa_id         INTEGER REFERENCES fas(id) ON DELETE SET NULL,
  bio           TEXT NOT NULL DEFAULT '',
  banned        INTEGER NOT NULL DEFAULT 0,
  created_at    INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS verification_requests (
  id          INTEGER PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code        TEXT NOT NULL,
  ign         TEXT NOT NULL,
  fa_name     TEXT NOT NULL DEFAULT '',
  evidence    TEXT NOT NULL DEFAULT '',
  status      TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  reviewer_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  review_note TEXT NOT NULL DEFAULT '',
  created_at  INTEGER NOT NULL,
  reviewed_at INTEGER
);

CREATE TABLE IF NOT EXISTS forum_categories (
  id            INTEGER PRIMARY KEY,
  slug          TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  description   TEXT NOT NULL DEFAULT '',
  position      INTEGER NOT NULL DEFAULT 0,
  verified_only INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS threads (
  id           INTEGER PRIMARY KEY,
  category_id  INTEGER NOT NULL REFERENCES forum_categories(id) ON DELETE CASCADE,
  user_id      INTEGER NOT NULL REFERENCES users(id),
  title        TEXT NOT NULL,
  pinned       INTEGER NOT NULL DEFAULT 0,
  locked       INTEGER NOT NULL DEFAULT 0,
  post_count   INTEGER NOT NULL DEFAULT 0,
  created_at   INTEGER NOT NULL,
  last_post_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS threads_by_category ON threads(category_id, pinned DESC, last_post_at DESC);

CREATE TABLE IF NOT EXISTS posts (
  id         INTEGER PRIMARY KEY,
  thread_id  INTEGER NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
  user_id    INTEGER NOT NULL REFERENCES users(id),
  body       TEXT NOT NULL,
  deleted    INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  edited_at  INTEGER
);
CREATE INDEX IF NOT EXISTS posts_by_thread ON posts(thread_id, id);

CREATE TABLE IF NOT EXISTS wiki_pages (
  id          INTEGER PRIMARY KEY,
  slug        TEXT NOT NULL UNIQUE,
  title       TEXT NOT NULL,
  body        TEXT NOT NULL,
  locked      INTEGER NOT NULL DEFAULT 0,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS wiki_revisions (
  id         INTEGER PRIMARY KEY,
  page_id    INTEGER NOT NULL REFERENCES wiki_pages(id) ON DELETE CASCADE,
  user_id    INTEGER NOT NULL REFERENCES users(id),
  title      TEXT NOT NULL,
  body       TEXT NOT NULL,
  summary    TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS revisions_by_page ON wiki_revisions(page_id, id DESC);

CREATE TABLE IF NOT EXISTS seasons (
  id         INTEGER PRIMARY KEY,
  name       TEXT NOT NULL,
  starts_at  INTEGER NOT NULL,
  ends_at    INTEGER NOT NULL,
  notes      TEXT NOT NULL DEFAULT '',
  is_current INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS pack_players (
  id          INTEGER PRIMARY KEY,
  season_id   INTEGER NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  pack_name   TEXT NOT NULL,
  player_name TEXT NOT NULL,
  position    TEXT NOT NULL DEFAULT '',
  rating      INTEGER,
  rarity      TEXT NOT NULL DEFAULT '',
  club        TEXT NOT NULL DEFAULT '',
  notes       TEXT NOT NULL DEFAULT '',
  added_by    INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS pack_players_by_season ON pack_players(season_id, pack_name);

CREATE TABLE IF NOT EXISTS fas (
  id             INTEGER PRIMARY KEY,
  name           TEXT NOT NULL UNIQUE COLLATE NOCASE,
  tag            TEXT NOT NULL DEFAULT '',
  region         TEXT NOT NULL DEFAULT '',
  description    TEXT NOT NULL DEFAULT '',
  recruiting     INTEGER NOT NULL DEFAULT 0,
  points         INTEGER NOT NULL DEFAULT 0,
  members_count  INTEGER NOT NULL DEFAULT 0,
  leader_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at     INTEGER NOT NULL,
  updated_at     INTEGER NOT NULL
);
`;

const DEFAULT_CATEGORIES = [
  ['announcements', 'Announcements', 'Site news and official game updates.', 0, 0],
  ['general', 'General Discussion', 'Talk about anything TopGoal.', 1, 0],
  ['fa-recruitment', 'FA Recruitment', 'FAs looking for members, and managers looking for an FA.', 2, 0],
  ['packs-transfers', 'Packs & Players', 'Pack pulls, player ratings, who to keep and who to sell.', 3, 0],
  ['tactics', 'Tactics & Formations', 'Line-ups, formations and match strategy.', 4, 0],
  ['help-bugs', 'Help & Bugs', 'Questions, problems and bug reports.', 5, 0],
  ['verified-lounge', 'Verified Lounge', 'Blue-tick managers only. Cross-FA talk between verified players.', 6, 1],
];

const DEFAULT_WIKI = {
  slug: 'main-page',
  title: 'Main Page',
  body: `# Welcome to the TopGoal Wiki

This wiki is written by players, for players. Anyone with an account can edit it.

## Good first pages to write
- [[Beginner Guide]]
- [[Formations]]
- [[Player Packs]]
- [[FA Guide]]
- [[Season Rewards]]

Link to another page with double square brackets, like \`[[Formations]]\`. If the page doesn't exist yet, the link lets you create it.`,
};

function open(file) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA foreign_keys = ON;');
  if (file !== ':memory:') db.exec('PRAGMA journal_mode = WAL;');
  db.exec(SCHEMA);
  seedDefaults(db);
  return db;
}

function seedDefaults(db) {
  const { n } = db.prepare('SELECT COUNT(*) AS n FROM forum_categories').get();
  if (n === 0) {
    const insert = db.prepare(
      'INSERT INTO forum_categories (slug, name, description, position, verified_only) VALUES (?, ?, ?, ?, ?)'
    );
    for (const row of DEFAULT_CATEGORIES) insert.run(...row);
  }
}

// Wiki pages need an author, so the main page is created when the first user registers.
function ensureMainWikiPage(db, userId) {
  const exists = db.prepare('SELECT 1 FROM wiki_pages WHERE slug = ?').get(DEFAULT_WIKI.slug);
  if (exists) return;
  const now = Date.now();
  const { lastInsertRowid } = db
    .prepare('INSERT INTO wiki_pages (slug, title, body, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
    .run(DEFAULT_WIKI.slug, DEFAULT_WIKI.title, DEFAULT_WIKI.body, now, now);
  db.prepare(
    'INSERT INTO wiki_revisions (page_id, user_id, title, body, summary, created_at) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(lastInsertRowid, userId, DEFAULT_WIKI.title, DEFAULT_WIKI.body, 'Created main page', now);
}

function transaction(db, fn) {
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

module.exports = { open, transaction, ensureMainWikiPage };
