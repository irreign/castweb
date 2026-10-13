import type { Context, MiddlewareHandler } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import type { AppEnv, AuthUser, Role } from './env';
import { first, newId, nowIso, run, type DB } from './db';
import { hashPassword, randomToken, sha256Hex, verifyPassword } from './crypto';
import { forbidden, HttpError, unauthorized } from './http';
import { rateLimit, clientIp } from './ratelimit';
import { audit } from './services/audit';

const COOKIE = 'nl_session';
const SESSION_DAYS = 14;
const MAX_FAILS = 8;

export const ROLE_RANK: Record<Role, number> = { consultant: 1, admin: 2, owner: 3 };

const isHttps = (c: Context) => new URL(c.req.url).protocol === 'https:';

export async function createSession(c: Context<AppEnv>, userId: string, tenantId: string) {
  const token = randomToken(32);
  const exp = new Date(Date.now() + SESSION_DAYS * 864e5).toISOString();
  await run(c.env.DB, 'INSERT INTO sessions (id, user_id, tenant_id, created_at, expires_at) VALUES (?,?,?,?,?)', await sha256Hex(token), userId, tenantId, nowIso(), exp);
  setCookie(c, COOKIE, token, { httpOnly: true, secure: isHttps(c), sameSite: 'Lax', path: '/', maxAge: SESSION_DAYS * 86400 });
}

export async function destroySession(c: Context<AppEnv>) {
  const token = getCookie(c, COOKIE);
  if (token) await run(c.env.DB, 'DELETE FROM sessions WHERE id = ?', await sha256Hex(token));
  deleteCookie(c, COOKIE, { path: '/' });
}

/** Resolves the session AND re-reads the membership, so role changes and removals take effect immediately. */
export async function resolveSession(c: Context): Promise<AuthUser | null> {
  const token = getCookie(c, COOKIE);
  if (!token) return null;
  const row = await first<{ user_id: string; tenant_id: string; role: Role; name: string; email: string }>(c.env.DB,
    `SELECT s.user_id, s.tenant_id, m.role, u.name, u.email
       FROM sessions s
       JOIN users u ON u.id = s.user_id AND u.disabled = 0
       JOIN memberships m ON m.user_id = s.user_id AND m.tenant_id = s.tenant_id AND m.active = 1
       JOIN tenants t ON t.id = s.tenant_id AND t.status = 'active'
      WHERE s.id = ? AND s.expires_at > ?`, await sha256Hex(token), nowIso());
  return row ? { userId: row.user_id, tenantId: row.tenant_id, role: row.role, name: row.name, email: row.email } : null;
}

export const requireAuth: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (!getCookie(c, COOKIE)) throw unauthorized();
  const user = await resolveSession(c);
  if (!user) { deleteCookie(c, COOKIE, { path: '/' }); throw unauthorized('Your session has expired. Please sign in again.'); }
  c.set('user', user);
  await next();
};

export const requireRole = (min: Role): MiddlewareHandler<AppEnv> => async (c, next) => {
  const u = c.get('user');
  if (ROLE_RANK[u.role] < ROLE_RANK[min]) throw forbidden();
  await next();
};

/** CSRF defence for cookie-authenticated mutating requests: same-origin Origin header + custom header + JSON bodies (enforced in `body()`). */
export const csrfGuard: MiddlewareHandler<AppEnv> = async (c, next) => {
  const m = c.req.method;
  if (m !== 'GET' && m !== 'HEAD' && m !== 'OPTIONS') {
    const origin = c.req.header('origin');
    if (origin && origin !== new URL(c.req.url).origin) throw new HttpError(403, 'csrf', 'Cross-origin request blocked');
    if (c.req.header('x-requested-with') !== 'nexus') throw new HttpError(403, 'csrf', 'Missing required header');
  }
  await next();
};

export async function login(c: Context<AppEnv>, email: string, password: string, tenantSlug?: string) {
  const db = c.env.DB;
  await rateLimit(db, `login:${clientIp(c.req.raw)}`, 20, 600);
  const user = await first<{ id: string; password_hash: string | null; disabled: number; failed_logins: number; locked_until: string | null }>(db,
    'SELECT id, password_hash, disabled, failed_logins, locked_until FROM users WHERE email = ?', email.toLowerCase());
  const ok = await verifyPassword(password, user?.password_hash ?? null);
  const generic = new HttpError(401, 'invalid_credentials', 'Incorrect email or password');
  if (!user || user.disabled) throw generic;
  if (user.locked_until && user.locked_until > nowIso()) throw new HttpError(429, 'locked', 'Too many failed attempts. Try again in a few minutes.');
  if (!ok) {
    const fails = user.failed_logins + 1;
    await run(db, 'UPDATE users SET failed_logins = ?, locked_until = ? WHERE id = ?', fails, fails >= MAX_FAILS ? new Date(Date.now() + 15 * 60e3).toISOString() : null, user.id);
    throw generic;
  }
  await run(db, 'UPDATE users SET failed_logins = 0, locked_until = NULL WHERE id = ?', user.id);
  const m = await first<{ tenant_id: string }>(db,
    `SELECT m.tenant_id FROM memberships m JOIN tenants t ON t.id = m.tenant_id
      WHERE m.user_id = ? AND m.active = 1 AND t.status = 'active' AND (? IS NULL OR t.slug = ?) ORDER BY m.created_at LIMIT 1`, user.id, tenantSlug ?? null, tenantSlug ?? null);
  if (!m) throw generic;
  await createSession(c, user.id, m.tenant_id);
  await audit(db, m.tenant_id, { type: 'user', id: user.id }, 'login', 'user', user.id);
  return user.id;
}

export const MIN_PASSWORD = 10;

export async function setPassword(db: DB, userId: string, password: string) {
  await run(db, 'UPDATE users SET password_hash = ?, failed_logins = 0, locked_until = NULL WHERE id = ?', await hashPassword(password), userId);
}

export { newId };
