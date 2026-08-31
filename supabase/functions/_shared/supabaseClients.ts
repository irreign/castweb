// Supabase client construction for Edge Functions. Deno-only (imports the
// npm supabase-js package via Deno's npm: specifier) — not imported by the
// Node test suite.
//
// Two distinct clients, matching docs/07-security-model.md §7.2:
//   - adminClient(): service role, bypasses RLS entirely. Used only for
//     operations that legitimately act as "the system" (writing an AI
//     extraction result, reading data to build an assistant answer).
//   - userClient(req): carries the caller's own JWT, so `auth.uid()` and
//     RLS resolve as that user for any RPC call. Used whenever an action
//     should be attributed to and authorized as the calling user (the
//     SECURITY DEFINER RPCs in 0001_init.sql all read auth.uid()).
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';

function requireEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`missing required env var: ${name}`);
  return value;
}

export function adminClient(): SupabaseClient {
  const url = requireEnv('SUPABASE_URL');
  const serviceRoleKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
  return createClient(url, serviceRoleKey, { auth: { persistSession: false } });
}

export function userClient(req: Request): SupabaseClient {
  const url = requireEnv('SUPABASE_URL');
  const anonKey = requireEnv('SUPABASE_ANON_KEY');
  const authHeader = req.headers.get('Authorization') ?? '';
  return createClient(url, anonKey, {
    auth: { persistSession: false },
    global: { headers: { Authorization: authHeader } },
  });
}

export function hasBearerToken(req: Request): boolean {
  // Lightweight check used only for early-exit UX (e.g. "no Authorization
  // header at all") — the real authorization boundary is always RLS / the
  // SECURITY DEFINER RPCs re-deriving auth.uid() server-side, never this.
  return (req.headers.get('Authorization') ?? '').startsWith('Bearer ');
}
