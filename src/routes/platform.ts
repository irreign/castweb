import { Hono } from 'hono';
import type { AppEnv } from '../env';
import { body, HttpError, notConfigured } from '../http';
import { timingSafeEqual } from '../crypto';
import { provisionSchema, provisionTenant } from '../services/tenants';
import { rateLimit, clientIp } from '../ratelimit';
import { all } from '../db';

/** Operator-only API (Nexus Logic staff). Authorised by the PLATFORM_ADMIN_TOKEN secret; no agency user can reach it. */
export const platformRoutes = new Hono<AppEnv>();

platformRoutes.use('*', async (c, next) => {
  if (!c.env.PLATFORM_ADMIN_TOKEN) throw notConfigured('PLATFORM_ADMIN_TOKEN is not set');
  await rateLimit(c.env.DB, `platform:${clientIp(c.req.raw)}`, 30, 600);
  const given = (c.req.header('authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!given || !timingSafeEqual(given, c.env.PLATFORM_ADMIN_TOKEN)) throw new HttpError(401, 'unauthorized', 'Invalid operator token');
  await next();
});

platformRoutes.post('/tenants', async (c) => {
  const input = await body(c, provisionSchema);
  const r = await provisionTenant(c.env.DB, input);
  const origin = new URL(c.req.url).origin;
  return c.json({ tenantId: r.tenantId, widgetKey: r.publicKey, inviteUrl: `${origin}/app/#/accept-invite?token=${r.inviteToken}`, inviteExpiresInDays: 7 }, 201);
});

platformRoutes.get('/tenants', async (c) => {
  const rows = await all(c.env.DB, `SELECT t.id, t.slug, t.name, t.status, t.is_demo, t.created_at,
    (SELECT COUNT(*) FROM leads l WHERE l.tenant_id = t.id) AS leads, (SELECT COUNT(*) FROM memberships m WHERE m.tenant_id = t.id AND m.active = 1) AS members FROM tenants t ORDER BY t.created_at DESC LIMIT 200`);
  return c.json({ items: rows });
});
