// Minimal APNs (HTTP/2, token-based provider auth) client. Deno's fetch
// negotiates HTTP/2 automatically against a server that offers it, so no
// extra dependency is needed beyond Web Crypto for JWT signing.
// docs/07-security-model.md §7.5, brief §15.
function requireEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`missing required env var: ${name}`);
  return value;
}

interface ApnsConfig {
  keyId: string;
  teamId: string;
  bundleId: string;
  privateKeyPem: string;
  environment: 'sandbox' | 'production';
}

function readConfig(): ApnsConfig {
  return {
    keyId: requireEnv('APNS_KEY_ID'),
    teamId: requireEnv('APNS_TEAM_ID'),
    bundleId: requireEnv('APNS_BUNDLE_ID'),
    privateKeyPem: requireEnv('APNS_PRIVATE_KEY'),
    environment: (Deno.env.get('APNS_ENVIRONMENT') as 'sandbox' | 'production' | undefined) ?? 'production',
  };
}

function base64url(bytes: ArrayBuffer): string {
  const arr = new Uint8Array(bytes);
  let str = '';
  for (const b of arr) str += String.fromCharCode(b);
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function pemToArrayBuffer(pem: string): ArrayBuffer {
  const b64 = pem.replace(/-----BEGIN [^-]+-----/, '').replace(/-----END [^-]+-----/, '').replace(/\s+/g, '');
  const raw = atob(b64);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes.buffer;
}

// Apple asks providers to reuse a signed token for up to an hour rather
// than minting one per request.
let cachedJwt: { token: string; issuedAt: number } | null = null;
const JWT_TTL_MS = 50 * 60 * 1000;

async function signJwt(config: ApnsConfig): Promise<string> {
  const header = { alg: 'ES256', kid: config.keyId };
  const payload = { iss: config.teamId, iat: Math.floor(Date.now() / 1000) };
  const encHeader = base64url(new TextEncoder().encode(JSON.stringify(header)).buffer);
  const encPayload = base64url(new TextEncoder().encode(JSON.stringify(payload)).buffer);
  const signingInput = `${encHeader}.${encPayload}`;

  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemToArrayBuffer(config.privateKeyPem),
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    key,
    new TextEncoder().encode(signingInput),
  );
  return `${signingInput}.${base64url(signature)}`;
}

async function getJwt(config: ApnsConfig): Promise<string> {
  if (cachedJwt && Date.now() - cachedJwt.issuedAt < JWT_TTL_MS) return cachedJwt.token;
  const token = await signJwt(config);
  cachedJwt = { token, issuedAt: Date.now() };
  return token;
}

export interface ApnsPushPayload {
  title: string;
  body: string;
  threadId?: string;
  data?: Record<string, unknown>;
}

export type ApnsSendResult =
  | { ok: true }
  | { ok: false; shouldRemoveToken: boolean; reason: string };

/** Sends one push. Per docs/10-failure-modes.md: a BadDeviceToken/
 * Unregistered response means the token is permanently dead — the caller
 * should delete the row, not retry; any other failure is logged and
 * otherwise left alone (no retry-storming APNs). */
export async function sendApnsPush(deviceToken: string, payload: ApnsPushPayload): Promise<ApnsSendResult> {
  const config = readConfig();
  const jwt = await getJwt(config);
  const host = config.environment === 'sandbox' ? 'https://api.sandbox.push.apple.com' : 'https://api.push.apple.com';

  const res = await fetch(`${host}/3/device/${deviceToken}`, {
    method: 'POST',
    headers: {
      authorization: `bearer ${jwt}`,
      'apns-topic': config.bundleId,
      'apns-push-type': 'alert',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      aps: { alert: { title: payload.title, body: payload.body }, sound: 'default', 'thread-id': payload.threadId },
      ...payload.data,
    }),
  });

  if (res.ok) return { ok: true };

  const reason = await res.text().catch(() => res.statusText);
  const shouldRemoveToken = (res.status === 400 && reason.includes('BadDeviceToken')) || res.status === 410;
  return { ok: false, shouldRemoveToken, reason };
}
