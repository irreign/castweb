import { Hono } from 'hono';
import { z } from 'zod';
import type { AppEnv } from '../env';
import { acceptInviteAndLogin } from './auth-helpers';
import { csrfGuard, destroySession, login, MIN_PASSWORD, requireAuth } from '../auth';
import { body } from '../http';
import { first } from '../db';

export const authRoutes = new Hono<AppEnv>();

authRoutes.use('*', csrfGuard);

authRoutes.post('/login', async (c) => {
  const { email, password, agency } = await body(c, z.object({ email: z.string().email().max(200), password: z.string().min(1).max(200), agency: z.string().max(60).optional() }));
  await login(c, email, password, agency);
  return c.json({ ok: true });
});

authRoutes.post('/logout', async (c) => { await destroySession(c); return c.json({ ok: true }); });

authRoutes.post('/accept-invite', async (c) => {
  const { token, password } = await body(c, z.object({ token: z.string().min(10).max(200), password: z.string().min(MIN_PASSWORD, `Use at least ${MIN_PASSWORD} characters`).max(200) }));
  await acceptInviteAndLogin(c, token, password);
  return c.json({ ok: true });
});

authRoutes.get('/me', requireAuth, async (c) => {
  const u = c.get('user');
  const t = await first<{ name: string; slug: string; public_key: string; timezone: string; is_demo: number }>(c.env.DB, 'SELECT name, slug, public_key, timezone, is_demo FROM tenants WHERE id = ?', u.tenantId);
  return c.json({
    user: { id: u.userId, name: u.name, email: u.email, role: u.role },
    tenant: { name: t!.name, slug: t!.slug, publicKey: t!.public_key, timezone: t!.timezone, isDemo: !!t!.is_demo },
    capabilities: { manageKnowledge: u.role !== 'consultant', manageSettings: u.role !== 'consultant', manageTeam: u.role !== 'consultant', viewReports: u.role !== 'consultant', ownerOnly: u.role === 'owner' },
  });
});
