import type { Env } from '../env';

export interface EmailMessage { to: string; subject: string; text: string }
export type SendResult = { ok: true; id?: string } | { ok: false; notConfigured?: boolean; error: string };

export async function sendEmail(env: Env, msg: EmailMessage): Promise<SendResult> {
  if (!env.RESEND_API_KEY || !env.EMAIL_FROM) return { ok: false, notConfigured: true, error: 'Email provider is not configured' };
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify({ from: env.EMAIL_FROM, to: [msg.to], subject: msg.subject, text: msg.text }),
    });
    if (!res.ok) return { ok: false, error: `Email provider returned HTTP ${res.status}` };
    const j = await res.json().catch(() => ({})) as { id?: string };
    return { ok: true, id: j.id };
  } catch {
    return { ok: false, error: 'Could not reach the email provider' };
  }
}
