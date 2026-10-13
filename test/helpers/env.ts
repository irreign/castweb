import { app } from '../../src/index';
import type { Env } from '../../src/env';
import { migratedDb } from './d1';
import { provisionTenant } from '../../src/services/tenants';
import { acceptInvite } from '../../src/services/tenants';
import { seedAvailabilityFromHours } from '../../src/services/bookings';
import { inviteMember } from '../../src/services/tenants';

export const PASSWORD = 'correct horse battery';

export function makeEnv(over: Partial<Env> = {}): Env {
  return {
    DB: migratedDb(),
    ENVIRONMENT: 'test',
    PLATFORM_ADMIN_TOKEN: 'op-token',
    ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'),
    WHATSAPP_APP_SECRET: 'wa-app-secret',
    WHATSAPP_VERIFY_TOKEN: 'wa-verify',
    WHATSAPP_MODE: 'test',
    ...over,
  };
}

export interface TenantFx { tenantId: string; publicKey: string; ownerEmail: string; ownerId: string }

export async function seedTenant(env: Env, slug: string, name = slug.toUpperCase() + ' Maid Agency'): Promise<TenantFx> {
  const email = `owner@${slug}.test`;
  const r = await provisionTenant(env.DB, { agencyName: name, slug, ownerName: `${slug} owner`, ownerEmail: email, timezone: 'Asia/Singapore' });
  const { userId } = await acceptInvite(env.DB, r.inviteToken, PASSWORD);
  await seedAvailabilityFromHours(env.DB, r.tenantId, userId);
  return { tenantId: r.tenantId, publicKey: r.publicKey, ownerEmail: email, ownerId: userId };
}

export async function seedMember(env: Env, tenantId: string, email: string, role: 'admin' | 'consultant', actorId: string) {
  const r = await inviteMember(env.DB, tenantId, actorId, { name: email.split('@')[0], email, role });
  const { userId } = await acceptInvite(env.DB, r.inviteToken, PASSWORD);
  await seedAvailabilityFromHours(env.DB, tenantId, userId);
  return userId;
}

export async function loginCookie(env: Env, email: string, password = PASSWORD): Promise<string> {
  const res = await app.request('/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json', 'x-requested-with': 'nexus' }, body: JSON.stringify({ email, password }) }, env);
  if (res.status !== 200) throw new Error(`login failed ${res.status}: ${await res.text()}`);
  return (res.headers.get('set-cookie') ?? '').split(';')[0];
}

export function client(env: Env, cookie?: string) {
  const call = async (method: string, path: string, body?: unknown, extra: Record<string, string> = {}) => {
    const headers: Record<string, string> = { 'x-requested-with': 'nexus', ...extra };
    if (cookie) headers.cookie = cookie;
    let payload: BodyInit | undefined;
    if (body instanceof FormData) payload = body; else if (body !== undefined) { headers['content-type'] = 'application/json'; payload = JSON.stringify(body); }
    const res = await app.request(path, { method, headers, body: payload }, env);
    const text = await res.text();
    let json: any = null; try { json = JSON.parse(text); } catch { /* non-JSON */ }
    return { status: res.status, json, text, headers: res.headers };
  };
  return { get: (p: string, h?: Record<string, string>) => call('GET', p, undefined, h), post: (p: string, b?: unknown, h?: Record<string, string>) => call('POST', p, b ?? {}, h), put: (p: string, b?: unknown) => call('PUT', p, b ?? {}), patch: (p: string, b?: unknown) => call('PATCH', p, b ?? {}), del: (p: string) => call('DELETE', p) };
}

/** Drives the public widget API for a tenant. */
export async function startWidget(env: Env, publicKey: string) {
  const c = client(env);
  const r = await c.post(`/api/public/${publicKey}/conversations`);
  if (r.status !== 201) throw new Error('conversation create failed ' + r.text);
  const { conversationId, token } = r.json;
  const h = { 'x-conversation-token': token };
  return {
    conversationId, token,
    say: (text: string, id = crypto.randomUUID()) => c.post(`/api/public/${publicKey}/conversations/${conversationId}/messages`, { text, clientMessageId: id }, h),
    contact: (b: unknown) => c.post(`/api/public/${publicKey}/conversations/${conversationId}/contact`, b, h),
    handoff: () => c.post(`/api/public/${publicKey}/conversations/${conversationId}/handoff`, {}, h),
    book: (start: string, key = crypto.randomUUID()) => c.post(`/api/public/${publicKey}/conversations/${conversationId}/book`, { start, idempotencyKey: key }, h),
    poll: (after = '') => c.get(`/api/public/${publicKey}/conversations/${conversationId}/messages?after=${encodeURIComponent(after)}`, h),
    slots: () => c.get(`/api/public/${publicKey}/slots`),
  };
}
