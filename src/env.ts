export interface Env {
  DB: D1Database;
  ASSETS?: Fetcher;
  FILES?: R2Bucket;
  ENVIRONMENT?: string;
  // Secrets (set with `wrangler secret put`; never committed):
  PLATFORM_ADMIN_TOKEN?: string;   // authorises tenant provisioning
  ENCRYPTION_KEY?: string;         // base64, 32 bytes; encrypts per-tenant provider tokens
  ANTHROPIC_API_KEY?: string;      // optional: enables the LLM; without it the assistant is extractive-only
  ANTHROPIC_MODEL?: string;
  RESEND_API_KEY?: string;         // optional: email notifications
  EMAIL_FROM?: string;
  WHATSAPP_APP_SECRET?: string;    // Meta app secret: webhook signature verification
  WHATSAPP_VERIFY_TOKEN?: string;  // webhook subscription handshake
  WHATSAPP_MODE?: string;          // 'live' (default) | 'test' (no outbound network calls)
}

export type Role = 'owner' | 'admin' | 'consultant';

export interface AuthUser {
  userId: string;
  tenantId: string;
  role: Role;
  name: string;
  email: string;
}

export type AppVars = { user: AuthUser };
export type AppEnv = { Bindings: Env; Variables: AppVars };
