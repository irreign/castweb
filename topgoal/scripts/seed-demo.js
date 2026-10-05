'use strict';

// Fills an EMPTY database with clearly-labelled sample content so you can preview the site.
// Do not run this on a live site. Everything it creates is fictional.

const crypto = require('node:crypto');
const path = require('node:path');
const { ensureMainWikiPage } = require('../src/db');
const { open } = require('../src/sqlite-node');
const { hashPassword } = require('../src/auth');

const dbFile = process.env.DATABASE_FILE || path.join(__dirname, '..', 'data', 'topgoal.db');
const hub = open(dbFile);
const db = hub.sqlite;

if (db.prepare('SELECT COUNT(*) AS n FROM users').get().n > 0) {
  console.error('This database already has users. The demo seed only runs on an empty database.');
  process.exit(1);
}

const password = process.env.DEMO_PASSWORD || crypto.randomBytes(9).toString('base64url');
const now = Date.now();
const day = 86400000;
const code = () => 'TG-' + crypto.randomBytes(3).toString('hex').toUpperCase().slice(0, 5);

let adminId;
db.exec('BEGIN');
{
  const addUser = db.prepare(
    'INSERT INTO users (username, password_hash, role, verified, verified_at, verify_code, ign, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  );
  const hash = hashPassword(password);
  const users = {};
  for (const [name, role, verified, ign] of [
    ['demo-admin', 'admin', 1, 'Demo Gaffer'],
    ['demo-mod', 'mod', 1, 'Sample Scout'],
    ['striker_sam', 'user', 1, 'Sam United'],
    ['keeper_kim', 'user', 0, 'Kim City'],
  ]) {
    users[name] = addUser.run(name, hash, role, verified, verified ? now - 20 * day : null, code(), ign, now - 30 * day).lastInsertRowid;
  }
  adminId = users['demo-admin'];

  const addFa = db.prepare(
    `INSERT INTO fas (name, tag, region, description, recruiting, points, members_count, leader_user_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const fas = [
    ['Sample FA Lions', 'LNS', 'Singapore · English', 'Active daily. **Sample data** for preview.', 1, 18450, 28, users['striker_sam']],
    ['Sample FA Tigers', 'TGR', 'Malaysia · English', 'Competitive league play. Sample data.', 0, 17320, 30, null],
    ['Sample FA Eagles', 'EGL', 'UK · English', 'Casual, friendly, weekend warriors. Sample data.', 1, 15110, 22, null],
    ['Sample FA Sharks', 'SHK', 'Indonesia · Bahasa', 'Sample data.', 0, 12990, 25, null],
    ['Sample FA Wolves', 'WLV', 'Philippines · English', 'Sample data.', 1, 9800, 17, null],
  ].map((f) => addFa.run(...f, now - 10 * day, now - day).lastInsertRowid);
  db.prepare('UPDATE users SET fa_id = ? WHERE id IN (?, ?)').run(fas[0], users['striker_sam'], users['keeper_kim']);

  const seasonId = db
    .prepare('INSERT INTO seasons (name, starts_at, ends_at, notes, is_current) VALUES (?, ?, ?, ?, 1)')
    .run(
      'Demo Season',
      now - 12 * day,
      now + 23 * day + 5 * 3600000,
      'This is **sample data** so you can see how the season page looks. A moderator replaces it with the real season.',
    ).lastInsertRowid;

  const addPlayer = db.prepare(
    `INSERT INTO pack_players (season_id, pack_name, player_name, position, rating, rarity, club, notes, added_by, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  for (const p of [
    ['Season Pack', 'Sample Striker', 'ST', 92, 'Legendary', 'Example FC', 'Sample data'],
    ['Season Pack', 'Sample Playmaker', 'CAM', 90, 'Legendary', 'Example FC', ''],
    ['Season Pack', 'Sample Wall', 'CB', 88, 'Epic', 'Demo Athletic', ''],
    ['Weekly Pack', 'Sample Winger', 'RW', 86, 'Epic', 'Demo Athletic', ''],
    ['Weekly Pack', 'Sample Keeper', 'GK', 84, 'Rare', 'Placeholder Town', ''],
    ['Weekly Pack', 'Sample Fullback', 'LB', 81, 'Rare', 'Placeholder Town', ''],
  ]) {
    addPlayer.run(seasonId, ...p, users['demo-mod'], now - 3 * day);
  }

  const cat = (slug) => db.prepare('SELECT id FROM forum_categories WHERE slug = ?').get(slug).id;
  const addThread = db.prepare(
    'INSERT INTO threads (category_id, user_id, title, pinned, post_count, created_at, last_post_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  );
  const addPost = db.prepare('INSERT INTO posts (thread_id, user_id, body, created_at) VALUES (?, ?, ?, ?)');
  const threads = [
    ['announcements', 'demo-admin', 'Welcome to TopGoal Hub (demo)', 1, [
      ['demo-admin', 'This is a **demo thread**. Say hi, find an FA, and help build the wiki, starting from [[Main Page]]!'],
    ]],
    ['fa-recruitment', 'striker_sam', 'Sample FA Lions recruiting active managers', 0, [
      ['striker_sam', 'We play every day and finished top 3 last season. Reply with your team rating.'],
      ['keeper_kim', 'Interested! Rating 1,450 and online most evenings.'],
    ]],
    ['tactics', 'keeper_kim', 'Which formation for the new season?', 0, [
      ['keeper_kim', 'Is 4-3-3 still the best, or has something changed? See [[Formations]].'],
      ['demo-mod', 'Depends on your wingers. I wrote up some notes on the wiki.'],
    ]],
  ];
  let t = 0;
  for (const [slug, author, title, pinned, posts] of threads) {
    const created = now - (5 - t++) * day;
    const id = addThread.run(cat(slug), users[author], title, pinned, posts.length, created, created + posts.length * 3600000).lastInsertRowid;
    posts.forEach(([who, body], i) => addPost.run(id, users[who], body, created + i * 3600000));
  }
  db.exec('COMMIT');
}

ensureMainWikiPage(hub, adminId).then(() => {
  console.log(`Demo data added to ${dbFile}`);
  console.log(`Demo accounts: demo-admin, demo-mod, striker_sam, keeper_kim — password: ${password}`);
});
