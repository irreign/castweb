'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { open } = require('../src/db');
const { createApp } = require('../src/app');
const { markup } = require('../src/render');

let server;
let base;
let db;

before(async () => {
  db = open(':memory:');
  server = createApp(db).listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => server.close());

// Minimal browser: keeps cookies and pulls the CSRF token from the last page.
class Client {
  constructor() {
    this.cookies = new Map();
  }
  cookieHeader() {
    return [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; ');
  }
  store(res) {
    for (const c of res.headers.getSetCookie()) {
      const [pair] = c.split(';');
      const i = pair.indexOf('=');
      const name = pair.slice(0, i);
      const value = pair.slice(i + 1);
      if (value === '' || /Expires=Thu, 01 Jan 1970/i.test(c)) this.cookies.delete(name);
      else this.cookies.set(name, value);
    }
  }
  async get(path) {
    const res = await fetch(base + path, { headers: { cookie: this.cookieHeader() }, redirect: 'manual' });
    this.store(res);
    const body = await res.text();
    const m = body.match(/name="_csrf" value="([^"]+)"/);
    if (m) this.csrf = m[1];
    return { status: res.status, body, location: res.headers.get('location') };
  }
  async post(path, fields = {}, { csrf = true } = {}) {
    if (csrf && !this.csrf) await this.get('/');
    const form = new URLSearchParams({ ...(csrf ? { _csrf: this.csrf } : {}), ...fields });
    const res = await fetch(base + path, {
      method: 'POST',
      headers: { cookie: this.cookieHeader(), 'content-type': 'application/x-www-form-urlencoded' },
      body: form,
      redirect: 'manual',
    });
    this.store(res);
    return { status: res.status, body: await res.text(), location: res.headers.get('location') };
  }
}

async function register(name) {
  const c = new Client();
  await c.get('/register');
  const r = await c.post('/register', { username: name, password: 'correct horse', confirm: 'correct horse' });
  assert.equal(r.status, 302, `register ${name}`);
  return c;
}

let admin;
let alice;
let bob;

test('first account becomes admin, later ones are regular users', async () => {
  admin = await register('Gaffer');
  alice = await register('alice');
  bob = await register('bob');
  const roles = db.prepare('SELECT username, role FROM users ORDER BY id').all().map((u) => [u.username, u.role]);
  assert.deepEqual(roles, [['Gaffer', 'admin'], ['alice', 'user'], ['bob', 'user']]);
  const home = await admin.get('/');
  assert.match(home.body, /href="\/admin"/);
});

test('duplicate usernames are rejected case-insensitively', async () => {
  const c = new Client();
  await c.get('/register');
  const r = await c.post('/register', { username: 'ALICE', password: 'whatever1', confirm: 'whatever1' });
  assert.equal(r.status, 400);
  assert.match(r.body, /taken/);
});

test('login works and wrong passwords fail', async () => {
  const c = new Client();
  await c.get('/login');
  assert.equal((await c.post('/login', { username: 'alice', password: 'nope-nope' })).status, 401);
  const ok = await c.post('/login', { username: 'alice', password: 'correct horse', next: '//evil.example' });
  assert.equal(ok.status, 302);
  assert.equal(ok.location, '/');
});

test('POST without a CSRF token is refused', async () => {
  const r = await alice.post('/forum/general/new', { title: 'x', body: 'y' }, { csrf: false });
  assert.equal(r.status, 403);
});

let threadId;

test('users can start threads and reply, and content is escaped', async () => {
  await alice.get('/forum/general/new');
  const r = await alice.post('/forum/general/new', {
    title: 'Best formation?',
    body: 'I like **4-3-3** <script>alert(1)</script>',
  });
  assert.equal(r.status, 302);
  threadId = Number(r.location.split('/').pop());
  await bob.get(`/t/${threadId}`);
  const reply = await bob.post(`/t/${threadId}/reply`, { body: '3-5-2 all day. See [[Formations]]' });
  assert.equal(reply.status, 302);
  const page = await bob.get(`/t/${threadId}`);
  assert.match(page.body, /<strong>4-3-3<\/strong>/);
  assert.doesNotMatch(page.body, /<script>alert/);
  assert.match(page.body, /&lt;script&gt;/);
  assert.match(page.body, /href="\/wiki\/formations" class="wikilink missing"/);
  assert.equal(db.prepare('SELECT post_count FROM threads WHERE id = ?').get(threadId).post_count, 2);
});

test('users cannot edit other people’s posts; moderators can lock threads', async () => {
  const post = db.prepare('SELECT id FROM posts WHERE thread_id = ? ORDER BY id LIMIT 1').get(threadId);
  await bob.get('/');
  assert.equal((await bob.post(`/p/${post.id}/edit`, { body: 'hacked' })).status, 403);
  await admin.get(`/t/${threadId}`);
  await admin.post(`/t/${threadId}/moderate`, { action: 'lock' });
  assert.equal((await bob.post(`/t/${threadId}/reply`, { body: 'late' })).status, 403);
});

test('only moderators can post announcements; verified lounge needs a blue tick', async () => {
  assert.equal((await alice.get('/forum/announcements/new')).status, 403);
  assert.equal((await alice.get('/forum/verified-lounge/new')).status, 403);
  assert.equal((await admin.get('/forum/announcements/new')).status, 200);
});

test('wiki pages can be created, edited, and keep history; stale edits are caught', async () => {
  await alice.get('/wiki/formations/edit');
  const created = await alice.post('/wiki/formations/edit', { title: 'Formations', body: '# 4-3-3\nBalanced.', summary: 'start' });
  assert.equal(created.status, 302);
  const edit = await bob.get('/wiki/formations/edit');
  const baseRevision = edit.body.match(/name="base_revision" value="(\d+)"/)[1];
  assert.equal(
    (await bob.post('/wiki/formations/edit', { title: 'Formations', body: '# 4-3-3\nBalanced. Good vs 4-4-2.', base_revision: baseRevision })).status,
    302
  );
  // Alice edits from the old version and gets a conflict instead of overwriting Bob.
  const stale = await alice.post('/wiki/formations/edit', { title: 'Formations', body: 'overwrite', base_revision: baseRevision });
  assert.equal(stale.status, 409);
  const history = await alice.get('/wiki/formations/history');
  assert.equal((history.body.match(/\/wiki\/formations\/rev\/\d+/g) || []).length, 2);
  const view = await alice.get('/wiki/formations');
  assert.match(view.body, /Good vs 4-4-2/);
});

test('blue tick verification: request, approve, then verified-only features unlock', async () => {
  const page = await alice.get('/verify');
  const code = db.prepare("SELECT verify_code FROM users WHERE username = 'alice'").get().verify_code;
  assert.match(page.body, new RegExp(code));
  assert.equal((await alice.post('/verify', { ign: 'AliceFC', fa_name: 'Lions', evidence: 'https://imgur.com/x' })).status, 302);

  // Regular users cannot reach the admin panel.
  assert.equal((await bob.get('/admin')).status, 403);

  const req = db.prepare("SELECT id FROM verification_requests WHERE status = 'pending'").get();
  await admin.get('/admin');
  assert.equal((await admin.post(`/admin/requests/${req.id}`, { decision: 'approve' })).status, 302);
  const user = db.prepare("SELECT verified, ign FROM users WHERE username = 'alice'").get();
  assert.deepEqual({ ...user }, { verified: 1, ign: 'AliceFC' });

  const profile = await alice.get('/u/alice');
  assert.match(profile.body, /class="tick"/);
  assert.equal((await alice.get('/forum/verified-lounge/new')).status, 200);
});

test('verified managers can list an FA; only moderators set ranking points', async () => {
  await bob.get('/fas');
  assert.equal((await bob.post('/fas', { name: 'Nope FC' })).status, 403);

  const r = await alice.post('/fas', { name: 'Lions', tag: 'LNS', region: 'Singapore', recruiting: '1', points: '999999' });
  assert.equal(r.status, 302);
  const fa = db.prepare("SELECT * FROM fas WHERE name = 'Lions'").get();
  assert.equal(fa.points, 0, 'leaders cannot set their own points');

  await admin.get(`/fas/${fa.id}/edit`);
  await admin.post(`/fas/${fa.id}/edit`, { name: 'Lions', tag: 'LNS', points: '5400', leader: 'alice', recruiting: '1' });
  const rankings = await bob.get('/rankings');
  assert.match(rankings.body, /Lions/);
  assert.match(rankings.body, /5,400/);
});

test('moderators manage seasons; countdown and pack players appear on the home page', async () => {
  await alice.get('/season');
  const starts = new Date(Date.now() - 5 * 86400000).toISOString().slice(0, 16);
  const ends = new Date(Date.now() + 10 * 86400000 + 3600000).toISOString().slice(0, 16);
  assert.equal((await alice.post('/season', { name: 'Season 9', starts_at: starts, ends_at: ends })).status, 403);

  await admin.get('/season');
  const r = await admin.post('/season', { name: 'Season 9', starts_at: starts, ends_at: ends, is_current: '1' });
  assert.equal(r.status, 302);
  const seasonId = Number(r.location.split('/').pop());

  // Verified Alice can add pack players; unverified Bob cannot.
  assert.equal(
    (await alice.post(`/season/${seasonId}/players`, { player_name: 'Sample Striker', pack_name: 'Season Pack', rating: '91', position: 'st', rarity: 'Legendary' })).status,
    302
  );
  assert.equal((await bob.post(`/season/${seasonId}/players`, { player_name: 'X', pack_name: 'Y' })).status, 403);

  const home = await bob.get('/');
  assert.match(home.body, /Season 9/);
  assert.match(home.body, /data-unit="days">10</);
  assert.match(home.body, /Sample Striker/);
  const season = await bob.get('/season');
  assert.match(season.body, />ST</);
});

test('suspended users are signed out and cannot log in', async () => {
  const bobId = db.prepare("SELECT id FROM users WHERE username = 'bob'").get().id;
  await admin.get('/admin');
  await admin.post(`/admin/users/${bobId}`, { role: 'user', banned: '1' });
  const page = await bob.get('/forum/general/new');
  assert.equal(page.status, 302);
  const c = new Client();
  await c.get('/login');
  assert.equal((await c.post('/login', { username: 'bob', password: 'correct horse' })).status, 403);
});

test('markup only allows http(s) links', () => {
  const out = String(markup('[click](javascript:alert(1)) and https://ok.example/a?b=1&c=2'));
  assert.doesNotMatch(out, /href="javascript/);
  assert.match(out, /href="https:\/\/ok.example\/a\?b=1&amp;c=2"/);
});
