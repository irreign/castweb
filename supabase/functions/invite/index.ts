// invite: create and redeem family invite links (brief §16).
// Both operations run entirely as the calling user (userClient) — no
// service role involved. Role/ownership checks are enforced by RLS
// (invites_insert policy) on create, and by the redeem_invite() SECURITY
// DEFINER RPC (0001_init.sql) on redeem, which re-derives auth.uid() from
// the caller's own JWT rather than trusting anything the client sends.
//
// Routes (docs/08-api-design.md §8.2):
//   POST /functions/v1/invite/create  { family_id, max_uses?, expires_in_hours? }
//   POST /functions/v1/invite/redeem  { token }
import { handleCorsPreflight } from '../_shared/cors.ts';
import { HttpError, jsonResponse, withErrorHandling } from '../_shared/response.ts';
import { userClient } from '../_shared/supabaseClients.ts';

const DEFAULT_MAX_USES = 1;
const DEFAULT_EXPIRES_IN_HOURS = 168; // 7 days

function randomToken(): string {
  return crypto.randomUUID().replace(/-/g, '');
}

async function handleCreate(req: Request): Promise<Response> {
  const body = (await req.json().catch(() => null)) as
    { family_id?: unknown; max_uses?: unknown; expires_in_hours?: unknown } | null;

  const familyId = typeof body?.family_id === 'string' ? body.family_id : null;
  if (!familyId) throw new HttpError('VALIDATION_FAILED', 'family_id is required');

  const maxUses = Number.isInteger(body?.max_uses) && (body!.max_uses as number) > 0
    ? (body!.max_uses as number)
    : DEFAULT_MAX_USES;
  const expiresInHours = Number.isFinite(body?.expires_in_hours) && (body!.expires_in_hours as number) > 0
    ? (body!.expires_in_hours as number)
    : DEFAULT_EXPIRES_IN_HOURS;

  const asUser = userClient(req);
  const { data: authData, error: authError } = await asUser.auth.getUser();
  if (authError || !authData?.user) throw new HttpError('UNAUTHENTICATED', 'a valid session is required');

  const token = randomToken();
  const expiresAt = new Date(Date.now() + expiresInHours * 60 * 60 * 1000).toISOString();

  // RLS's invites_insert policy is the real authorization check here: it
  // rejects this insert unless the caller is an owner/adult member of
  // family_id, and requires created_by = auth.uid().
  const { data, error } = await asUser
    .from('invites')
    .insert({ family_id: familyId, token, created_by: authData.user.id, max_uses: maxUses, expires_at: expiresAt })
    .select('token, expires_at')
    .single();

  if (error || !data) {
    if (error?.code === '42501' /* insufficient_privilege */) {
      throw new HttpError('FORBIDDEN', 'only an owner or adult member can create invites for this family');
    }
    throw new HttpError('INTERNAL', 'failed to create invite');
  }

  return jsonResponse({ token: data.token, url: `hearth://invite/${data.token}`, expires_at: data.expires_at }, 200);
}

async function handleRedeem(req: Request): Promise<Response> {
  const body = (await req.json().catch(() => null)) as { token?: unknown } | null;
  const token = typeof body?.token === 'string' ? body.token : null;
  if (!token) throw new HttpError('VALIDATION_FAILED', 'token is required');

  const asUser = userClient(req);
  const { data, error } = await asUser.rpc('redeem_invite', { _token: token });

  if (error) {
    const message = error.message ?? '';
    if (message.includes('invite_not_found')) throw new HttpError('NOT_FOUND', 'this invite link is invalid');
    if (message.includes('invite_expired')) throw new HttpError('CONFLICT', 'this invite link has expired');
    if (message.includes('invite_exhausted')) throw new HttpError('CONFLICT', 'this invite link has already been used');
    if (message.includes('authentication required')) throw new HttpError('UNAUTHENTICATED', 'a valid session is required');
    console.error('invite/redeem: unexpected error', error);
    throw new HttpError('INTERNAL', 'failed to redeem invite');
  }

  return jsonResponse({ family_id: (data as { id: string } | null)?.id }, 200);
}

Deno.serve((req) => withErrorHandling(async () => {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;
  if (req.method !== 'POST') throw new HttpError('VALIDATION_FAILED', 'POST only');

  const path = new URL(req.url).pathname;
  if (path.endsWith('/redeem')) return handleRedeem(req);
  if (path.endsWith('/create')) return handleCreate(req);
  throw new HttpError('NOT_FOUND', 'unknown invite action — use /invite/create or /invite/redeem');
}));
