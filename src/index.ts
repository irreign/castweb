import { Hono } from 'hono';
import type { AppEnv, Env } from './env';
import { HttpError, errorBody } from './http';
import { authRoutes } from './routes/auth';
import { appRoutes } from './routes/app';
import { publicRoutes } from './routes/public';
import { webhookRoutes } from './routes/webhooks';
import { platformRoutes } from './routes/platform';
import { first } from './db';
import { normaliseSettings } from './settings';
import { retryPending } from './services/notifications';
import { retryFailedEvents } from './services/whatsapp';
import { runRetention } from './services/retention';

export const app = new Hono<AppEnv>();

// Baseline security headers for every Worker-served response.
app.use('*', async (c, next) => {
  await next();
  if (!c.res.headers || c.res.status === 101) return;
  c.res = new Response(c.res.body, c.res); // asset responses have immutable headers; clone before editing
  const h = c.res.headers;
  h.set('X-Content-Type-Options', 'nosniff');
  h.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  if (c.req.path.startsWith('/api/')) { h.set('Cache-Control', 'no-store'); h.set('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'"); }
});

app.get('/api/health', async (c) => {
  try { await c.env.DB.prepare('SELECT 1').first(); return c.json({ ok: true, db: true, time: new Date().toISOString() }); }
  catch { return c.json({ ok: false, db: false }, 503); }
});

app.route('/api/auth', authRoutes);
app.route('/api/app', appRoutes);
app.route('/api/public', publicRoutes);
app.route('/api/webhooks', webhookRoutes);
app.route('/api/platform', platformRoutes);

// The chat widget runs in an iframe on OUR origin, so it needs no CORS and holds no credentials.
// Which sites may embed it is enforced here, per agency, with CSP frame-ancestors.
app.get('/widget/frame', async (c) => {
  const key = c.req.query('k') ?? '';
  const t = await first<{ settings_json: string }>(c.env.DB, `SELECT settings_json FROM tenants WHERE public_key = ? AND status = 'active'`, key);
  if (!t) return c.text('This chat is not available', 404);
  const origins = normaliseSettings(t.settings_json).branding.allowedOrigins.map((o) => new URL(o).origin);
  const preview = c.req.query('preview') === '1';
  const ancestors = preview ? "'self'" : origins.length ? origins.join(' ') : '*';
  const asset = await c.env.ASSETS!.fetch(new URL('/widget/frame.html', c.req.url));
  const res = new Response(asset.body, asset);
  res.headers.set('Content-Security-Policy', `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; frame-ancestors ${ancestors}`);
  res.headers.set('Cache-Control', 'no-store');
  res.headers.delete('X-Frame-Options');
  return res;
});
app.all('/widget/*', (c) => c.env.ASSETS!.fetch(c.req.raw));
app.all('/api/*', (c) => c.json({ error: { code: 'not_found', message: 'Not found' } }, 404));
app.all('*', (c) => (c.env.ASSETS ? c.env.ASSETS.fetch(c.req.raw) : c.text('Not found', 404)));

app.onError((err, c) => {
  if (err instanceof HttpError) {
    const body = errorBody(err);
    return c.json(body, err.status as 400);
  }
  // Log a short, content-free reason. Never log request bodies (they contain customer messages).
  const ref = crypto.randomUUID().slice(0, 8);
  console.error(`unhandled_error ref=${ref} path=${c.req.path} msg=${String((err as Error)?.message).slice(0, 200)}`);
  return c.json({ error: { code: 'internal_error', message: `Something went wrong on our side. Reference: ${ref}` } }, 500);
});

export default {
  fetch: app.fetch,
  async scheduled(_evt: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil((async () => {
      const results = await Promise.allSettled([retryPending(env), retryFailedEvents(env), runRetention(env)]);
      for (const r of results) if (r.status === 'rejected') console.error('cron_error', String(r.reason?.message ?? r.reason).slice(0, 200));
    })());
  },
};
