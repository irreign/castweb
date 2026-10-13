const enc = new TextEncoder();

export const toHex = (buf: ArrayBuffer | Uint8Array) =>
  [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

export const b64 = (buf: ArrayBuffer | Uint8Array): string => {
  let s = '';
  for (const b of new Uint8Array(buf)) s += String.fromCharCode(b);
  return btoa(s);
};
export const unb64 = (s: string): Uint8Array => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

export async function sha256Hex(s: string): Promise<string> {
  return toHex(await crypto.subtle.digest('SHA-256', enc.encode(s)));
}

export function randomToken(bytes = 32): string {
  return toHex(crypto.getRandomValues(new Uint8Array(bytes)));
}

export function timingSafeEqual(a: string, b: string): boolean {
  const ea = enc.encode(a), eb = enc.encode(b);
  let diff = ea.length ^ eb.length;
  const n = Math.max(ea.length, eb.length);
  for (let i = 0; i < n; i++) diff |= (ea[i] ?? 0) ^ (eb[i] ?? 0);
  return diff === 0;
}

export async function hmacSha256Hex(secret: string, data: string | Uint8Array): Promise<string> {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const bytes = typeof data === 'string' ? enc.encode(data) : data;
  return toHex(await crypto.subtle.sign('HMAC', key, bytes));
}

// ---- Password hashing (PBKDF2-SHA256). Workers cap PBKDF2 iterations at 100,000. ----
const ITER = 100_000;

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const bits = await pbkdf2(password, salt, ITER);
  return `pbkdf2$${ITER}$${b64(salt)}$${b64(bits)}`;
}

async function pbkdf2(password: string, salt: Uint8Array, iter: number): Promise<ArrayBuffer> {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  return crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: iter }, key, 256);
}

export async function verifyPassword(password: string, stored: string | null): Promise<boolean> {
  // Always do the work, even for unknown users, to keep timing uniform.
  const parts = (stored ?? 'pbkdf2$100000$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=').split('$');
  if (parts[0] !== 'pbkdf2') return false;
  const bits = await pbkdf2(password, unb64(parts[2]), Number(parts[1]));
  return !!stored && timingSafeEqual(b64(bits), parts[3]);
}

// ---- AES-GCM secret box for per-tenant provider tokens ----
async function boxKey(secret: string | undefined): Promise<CryptoKey> {
  if (!secret) throw new Error('ENCRYPTION_KEY is not configured');
  const raw = unb64(secret);
  if (raw.length !== 32) throw new Error('ENCRYPTION_KEY must be 32 bytes, base64-encoded');
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

export async function encryptSecret(plain: string, secret: string | undefined): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await boxKey(secret), enc.encode(plain));
  return `v1.${b64(iv)}.${b64(ct)}`;
}

export async function decryptSecret(boxed: string, secret: string | undefined): Promise<string> {
  const [v, iv, ct] = boxed.split('.');
  if (v !== 'v1') throw new Error('Unknown secret format');
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(iv) }, await boxKey(secret), unb64(ct));
  return new TextDecoder().decode(pt);
}
