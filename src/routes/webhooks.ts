import { Hono } from 'hono';
import type { AppEnv } from '../env';
import { HttpError, notConfigured } from '../http';
import { timingSafeEqual } from '../crypto';
import { rateLimit, clientIp } from '../ratelimit';
import { verifySignature } from '../providers/whatsapp';
import { processWebhookPayload } from '../services/whatsapp';

export const webhookRoutes = new Hono<AppEnv>();

// Meta subscription handshake.
webhookRoutes.get('/whatsapp', async (c) => {
  await rateLimit(c.env.DB, `wa-verify:${clientIp(c.req.raw)}`, 30, 300);
  if (!c.env.WHATSAPP_VERIFY_TOKEN) throw notConfigured('WHATSAPP_VERIFY_TOKEN is not set');
  const q = c.req.query();
  if (q['hub.mode'] === 'subscribe' && q['hub.verify_token'] && timingSafeEqual(q['hub.verify_token'], c.env.WHATSAPP_VERIFY_TOKEN) && q['hub.challenge']) {
    return c.text(q['hub.challenge'].replace(/[^\w-]/g, ''), 200);
  }
  throw new HttpError(403, 'forbidden', 'Verification failed');
});

webhookRoutes.post('/whatsapp', async (c) => {
  if (!c.env.WHATSAPP_APP_SECRET) throw notConfigured('WHATSAPP_APP_SECRET is not set; refusing to accept unsigned webhooks');
  await rateLimit(c.env.DB, `wa-hook:${clientIp(c.req.raw)}`, 600, 60);
  const raw = new Uint8Array(await c.req.arrayBuffer());
  if (raw.byteLength > 1_000_000) throw new HttpError(413, 'too_large', 'Payload too large');
  if (!(await verifySignature(c.env.WHATSAPP_APP_SECRET, raw, c.req.header('x-hub-signature-256') ?? null))) {
    throw new HttpError(401, 'invalid_signature', 'Signature verification failed');
  }
  let payload: unknown;
  try { payload = JSON.parse(new TextDecoder().decode(raw)); } catch { throw new HttpError(400, 'bad_request', 'Invalid JSON'); }
  const result = await processWebhookPayload(c.env, payload);
  // Always 200 once the event is durably recorded, so Meta does not retry events we have already stored for our own retry loop.
  return c.json({ ok: true, ...result });
});

