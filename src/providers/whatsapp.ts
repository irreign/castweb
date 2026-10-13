import type { Env } from '../env';
import { hmacSha256Hex, timingSafeEqual } from '../crypto';
import { HttpError, notConfigured } from '../http';

const GRAPH = 'https://graph.facebook.com/v21.0';

/** Verifies Meta's X-Hub-Signature-256 header over the exact raw request body. */
export async function verifySignature(appSecret: string, rawBody: Uint8Array, header: string | null): Promise<boolean> {
  if (!header?.startsWith('sha256=')) return false;
  const expected = await hmacSha256Hex(appSecret, rawBody);
  return timingSafeEqual(expected, header.slice(7));
}

export interface InboundMessage { kind: 'message'; eventId: string; phoneNumberId: string; from: string; name?: string; type: string; text?: string; timestamp?: string }
export interface StatusUpdate { kind: 'status'; eventId: string; phoneNumberId: string; messageId: string; status: 'sent' | 'delivered' | 'read' | 'failed'; errorCode?: string; errorDetail?: string }
export type WhatsAppEvent = InboundMessage | StatusUpdate;

/** Flattens Meta's nested webhook payload. Tolerant of unknown shapes: unknown entries are skipped, never thrown on. */
export function parseWebhook(payload: any): WhatsAppEvent[] {
  const out: WhatsAppEvent[] = [];
  for (const entry of Array.isArray(payload?.entry) ? payload.entry : []) {
    for (const change of Array.isArray(entry?.changes) ? entry.changes : []) {
      const v = change?.value;
      const phoneNumberId = String(v?.metadata?.phone_number_id ?? '');
      if (!phoneNumberId) continue;
      const names: Record<string, string> = {};
      for (const c of Array.isArray(v?.contacts) ? v.contacts : []) if (c?.wa_id) names[String(c.wa_id)] = String(c?.profile?.name ?? '');
      for (const m of Array.isArray(v?.messages) ? v.messages : []) {
        if (!m?.id || !m?.from) continue;
        out.push({ kind: 'message', eventId: String(m.id), phoneNumberId, from: String(m.from), name: names[String(m.from)] || undefined,
          type: String(m.type ?? 'unknown'), text: m.type === 'text' ? String(m.text?.body ?? '') : undefined, timestamp: m.timestamp ? String(m.timestamp) : undefined });
      }
      for (const s of Array.isArray(v?.statuses) ? v.statuses : []) {
        if (!s?.id || !['sent', 'delivered', 'read', 'failed'].includes(s.status)) continue;
        const err = Array.isArray(s.errors) ? s.errors[0] : undefined;
        out.push({ kind: 'status', eventId: `${s.id}:${s.status}`, phoneNumberId, messageId: String(s.id), status: s.status,
          errorCode: err?.code != null ? String(err.code) : undefined, errorDetail: err?.title ? String(err.title).slice(0, 200) : undefined });
      }
    }
  }
  return out;
}

export interface SendOutcome { providerMessageId: string }

/** Sends via the Cloud API. In WHATSAPP_MODE=test nothing leaves the Worker: a synthetic id is returned. */
export async function sendMessage(env: Env, cfg: { phoneNumberId: string; token: string | null }, to: string, payload: { text: string } | { template: string; language?: string; params?: string[] }): Promise<SendOutcome> {
  if (env.WHATSAPP_MODE === 'test') return { providerMessageId: `test_${crypto.randomUUID()}` };
  if (!cfg.token) throw notConfigured('WhatsApp access token is not configured for this agency');
  const body = 'text' in payload
    ? { messaging_product: 'whatsapp', to, type: 'text', text: { body: payload.text.slice(0, 4000) } }
    : { messaging_product: 'whatsapp', to, type: 'template', template: { name: payload.template, language: { code: payload.language ?? 'en' },
        components: payload.params?.length ? [{ type: 'body', parameters: payload.params.map((p) => ({ type: 'text', text: p })) }] : undefined } };
  let res: Response;
  try {
    res = await fetch(`${GRAPH}/${encodeURIComponent(cfg.phoneNumberId)}/messages`, { method: 'POST', headers: { authorization: `Bearer ${cfg.token}`, 'content-type': 'application/json' }, body: JSON.stringify(body) });
  } catch {
    throw new HttpError(502, 'provider_unreachable', 'Could not reach WhatsApp. Please try again.');
  }
  const j = await res.json().catch(() => ({})) as any;
  if (!res.ok) throw new HttpError(502, 'provider_error', `WhatsApp rejected the message${j?.error?.code ? ` (code ${j.error.code})` : ''}`, { providerCode: j?.error?.code });
  const id = j?.messages?.[0]?.id;
  if (!id) throw new HttpError(502, 'provider_error', 'WhatsApp did not confirm the message');
  return { providerMessageId: String(id) };
}
