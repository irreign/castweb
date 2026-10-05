'use strict';

const crypto = require('node:crypto');

const SESSION_COOKIE = 'tg_session';
const CSRF_COOKIE = 'tg_csrf';
const FLASH_COOKIE = 'tg_flash';
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

// ─── Passwords (scrypt, built into Node) ───────────────────────────────────

function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt$${salt.toString('base64')}$${hash.toString('base64')}`;
}

function verifyPassword(password, stored) {
  const [scheme, saltB64, hashB64] = String(stored).split('$');
  if (scheme !== 'scrypt' || !saltB64 || !hashB64) return false;
  const expected = Buffer.from(hashB64, 'base64');
  const actual = crypto.scryptSync(password, Buffer.from(saltB64, 'base64'), expected.length, { N: 16384, r: 8, p: 1 });
  return crypto.timingSafeEqual(expected, actual);
}

// ─── Cookies ───────────────────────────────────────────────────────────────

function parseCookies(header) {
  const out = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    const key = part.slice(0, i).trim();
    try {
      out[key] = decodeURIComponent(part.slice(i + 1).trim());
    } catch {
      // ignore malformed cookie values
    }
  }
  return out;
}

function cookieOptions(req, extra = {}) {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: req.secure,
    path: '/',
    ...extra,
  };
}

// ─── Sessions ──────────────────────────────────────────────────────────────

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

function createSession(db, req, res, userId) {
  const token = crypto.randomBytes(32).toString('base64url');
  const now = Date.now();
  db.prepare('INSERT INTO sessions (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)').run(
    sha256(token),
    userId,
    now + SESSION_TTL_MS,
    now
  );
  res.cookie(SESSION_COOKIE, token, cookieOptions(req, { maxAge: SESSION_TTL_MS }));
}

function destroySession(db, req, res) {
  const token = req.cookies[SESSION_COOKIE];
  if (token) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(sha256(token));
  res.clearCookie(SESSION_COOKIE, cookieOptions(req));
}

function revokeOtherSessions(db, req, userId) {
  db.prepare('DELETE FROM sessions WHERE user_id = ? AND token_hash != ?').run(
    userId,
    sha256(req.cookies[SESSION_COOKIE] || '')
  );
}

// Loads cookies, the signed-in user, a CSRF token and any flash message.
function sessionMiddleware(db) {
  const findSession = db.prepare(
    `SELECT u.id, u.username, u.role, u.verified, u.banned, u.fa_id, u.ign
       FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = ? AND s.expires_at > ?`
  );
  return (req, res, next) => {
    req.cookies = parseCookies(req.headers.cookie);

    req.user = null;
    const token = req.cookies[SESSION_COOKIE];
    if (token) {
      const user = findSession.get(sha256(token), Date.now());
      if (user && !user.banned) req.user = { ...user };
      else if (user && user.banned) destroySession(db, req, res);
    }

    // Double-submit CSRF token: random value in a cookie that must be echoed in every form.
    let csrf = req.cookies[CSRF_COOKIE];
    if (!csrf || !/^[A-Za-z0-9_-]{32,}$/.test(csrf)) {
      csrf = crypto.randomBytes(24).toString('base64url');
      res.cookie(CSRF_COOKIE, csrf, cookieOptions(req, { maxAge: SESSION_TTL_MS }));
    }
    res.locals.csrf = csrf;

    if (req.cookies[FLASH_COOKIE]) {
      try {
        res.locals.flash = JSON.parse(Buffer.from(req.cookies[FLASH_COOKIE], 'base64url').toString());
      } catch {
        res.locals.flash = null;
      }
      res.clearCookie(FLASH_COOKIE, cookieOptions(req));
    }

    res.flash = (type, message) => {
      const value = Buffer.from(JSON.stringify({ type, message: String(message) })).toString('base64url');
      res.cookie(FLASH_COOKIE, value, cookieOptions(req, { maxAge: 60_000 }));
    };
    next();
  };
}

function csrfProtection(req, res, next) {
  if (req.method !== 'POST') return next();
  const sent = req.body && typeof req.body._csrf === 'string' ? req.body._csrf : '';
  const expected = res.locals.csrf;
  const ok =
    sent.length === expected.length && crypto.timingSafeEqual(Buffer.from(sent), Buffer.from(expected));
  if (!ok) {
    res.status(403);
    return next(Object.assign(new Error('Your form expired. Go back, refresh the page and try again.'), { status: 403 }));
  }
  next();
}

// ─── Guards ────────────────────────────────────────────────────────────────

const ROLE_RANK = { user: 0, mod: 1, admin: 2 };

function hasRole(user, role) {
  return Boolean(user) && ROLE_RANK[user.role] >= ROLE_RANK[role];
}

function requireUser(req, res, next) {
  if (req.user) return next();
  res.flash('info', 'Log in or create an account to do that.');
  res.redirect(`/login?next=${encodeURIComponent(req.originalUrl)}`);
}

function requireRole(role) {
  return (req, res, next) => {
    if (hasRole(req.user, role)) return next();
    next(Object.assign(new Error('You do not have permission to do that.'), { status: 403 }));
  };
}

// ─── Simple in-memory rate limiter (per process) ───────────────────────────

function rateLimiter({ windowMs, max }) {
  const hits = new Map();
  return {
    // Returns true when the key is over its limit.
    hit(key) {
      const now = Date.now();
      const entry = hits.get(key);
      if (!entry || entry.reset < now) {
        hits.set(key, { count: 1, reset: now + windowMs });
        if (hits.size > 10_000) {
          for (const [k, v] of hits) if (v.reset < now) hits.delete(k);
        }
        return false;
      }
      entry.count += 1;
      return entry.count > max;
    },
    reset(key) {
      hits.delete(key);
    },
  };
}

function safeNext(value) {
  return typeof value === 'string' && value.startsWith('/') && !value.startsWith('//') && !value.startsWith('/\\')
    ? value
    : '/';
}

module.exports = {
  hashPassword,
  verifyPassword,
  createSession,
  destroySession,
  revokeOtherSessions,
  sessionMiddleware,
  csrfProtection,
  hasRole,
  requireUser,
  requireRole,
  rateLimiter,
  safeNext,
};
