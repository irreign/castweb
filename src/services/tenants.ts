import { z } from 'zod';
import { all, first, isUniqueViolation, newId, nowIso, run, type DB } from '../db';
import { randomToken, sha256Hex } from '../crypto';
import { conflict, notFound, badRequest } from '../http';
import { audit } from './audit';
import { settingsSchema } from '../settings';
import { hashPassword } from '../crypto';
import type { Role } from '../env';

export const slugSchema = z.string().regex(/^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/, 'Use 3-40 lowercase letters, numbers or hyphens');

export const provisionSchema = z.object({
  agencyName: z.string().min(2).max(120),
  slug: slugSchema,
  ownerName: z.string().min(1).max(120),
  ownerEmail: z.string().email().max(200),
  timezone: z.string().max(60).default('Asia/Singapore'),
  demo: z.boolean().optional(), // operator-only: flags the agency as sample data; the UI shows a permanent DEMO banner
});

/** Creates a tenant with an owner invite. The owner sets their own password via the invite link. */
export async function provisionTenant(db: DB, input: z.infer<typeof provisionSchema>, opts: { demo?: boolean } = {}) {
  opts = { demo: opts.demo ?? input.demo };
  try { new Intl.DateTimeFormat('en-SG', { timeZone: input.timezone }); } catch { throw badRequest('Unknown timezone'); }
  const tenantId = newId('ten');
  const publicKey = 'pk_' + randomToken(12);
  const email = input.ownerEmail.toLowerCase();
  const existing = await first<{ id: string }>(db, 'SELECT id FROM users WHERE email = ?', email);
  const userId = existing?.id ?? newId('usr');
  const inviteToken = randomToken(24);
  const settings = settingsSchema.parse({ notifications: { agencyEmail: email } });
  const stmts = [
    db.prepare('INSERT INTO tenants (id, slug, name, public_key, timezone, settings_json, is_demo, created_at) VALUES (?,?,?,?,?,?,?,?)')
      .bind(tenantId, input.slug, input.agencyName, publicKey, input.timezone, JSON.stringify(settings), opts.demo ? 1 : 0, nowIso()),
    ...(existing ? [] : [db.prepare('INSERT INTO users (id, email, name, created_at) VALUES (?,?,?,?)').bind(userId, email, input.ownerName, nowIso())]),
    db.prepare('INSERT INTO memberships (id, tenant_id, user_id, role, created_at) VALUES (?,?,?,?,?)').bind(newId('mem'), tenantId, userId, 'owner', nowIso()),
    db.prepare('INSERT INTO invites (id, tenant_id, user_id, token_hash, expires_at, created_at) VALUES (?,?,?,?,?,?)')
      .bind(newId('inv'), tenantId, userId, await sha256Hex(inviteToken), new Date(Date.now() + 7 * 864e5).toISOString(), nowIso()),
  ];
  try { await db.batch(stmts); } catch (e) {
    if (isUniqueViolation(e)) throw conflict('That agency address (slug) is already taken');
    throw e;
  }
  await audit(db, tenantId, { type: 'system' }, 'tenant.provisioned', 'tenant', tenantId);
  return { tenantId, publicKey, inviteToken };
}

export async function inviteMember(db: DB, tenantId: string, actorId: string, input: { name: string; email: string; role: Role }) {
  const email = input.email.toLowerCase();
  const existing = await first<{ id: string }>(db, 'SELECT id FROM users WHERE email = ?', email);
  const userId = existing?.id ?? newId('usr');
  if (existing) {
    const m = await first(db, 'SELECT id FROM memberships WHERE tenant_id = ? AND user_id = ?', tenantId, userId);
    if (m) throw conflict('That person is already on your team');
  }
  const token = randomToken(24);
  await db.batch([
    ...(existing ? [] : [db.prepare('INSERT INTO users (id, email, name, created_at) VALUES (?,?,?,?)').bind(userId, email, input.name, nowIso())]),
    db.prepare('INSERT INTO memberships (id, tenant_id, user_id, role, created_at) VALUES (?,?,?,?,?)').bind(newId('mem'), tenantId, userId, input.role, nowIso()),
    db.prepare('INSERT INTO invites (id, tenant_id, user_id, token_hash, expires_at, created_at) VALUES (?,?,?,?,?,?)')
      .bind(newId('inv'), tenantId, userId, await sha256Hex(token), new Date(Date.now() + 7 * 864e5).toISOString(), nowIso()),
  ]);
  await audit(db, tenantId, { type: 'user', id: actorId }, 'member.invited', 'user', userId, { role: input.role });
  return { userId, inviteToken: token };
}

export async function acceptInvite(db: DB, token: string, password: string): Promise<{ userId: string; tenantId: string }> {
  const inv = await first<{ id: string; user_id: string; tenant_id: string }>(db,
    'SELECT id, user_id, tenant_id FROM invites WHERE token_hash = ? AND accepted_at IS NULL AND expires_at > ?', await sha256Hex(token), nowIso());
  if (!inv) throw notFound('This invitation link is invalid or has expired');
  await db.batch([
    db.prepare('UPDATE users SET password_hash = ?, failed_logins = 0, locked_until = NULL WHERE id = ?').bind(await hashPassword(password), inv.user_id),
    db.prepare('UPDATE invites SET accepted_at = ? WHERE id = ?').bind(nowIso(), inv.id),
  ]);
  await audit(db, inv.tenant_id, { type: 'user', id: inv.user_id }, 'invite.accepted', 'user', inv.user_id);
  return { userId: inv.user_id, tenantId: inv.tenant_id };
}

export async function listTeam(db: DB, tenantId: string) {
  return all(db, `SELECT u.id, u.name, u.email, m.role, m.active, (u.password_hash IS NOT NULL) AS activated
                    FROM memberships m JOIN users u ON u.id = m.user_id WHERE m.tenant_id = ? ORDER BY m.created_at`, tenantId);
}
