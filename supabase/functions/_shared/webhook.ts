// Auth for the two webhook-only functions (ai-extract, push-dispatch).
// Supabase DB Webhooks are configured to send a shared secret header
// rather than a user JWT — this is what stands in for authentication on
// those endpoints (docs/08-api-design.md §8.2).
export function verifyWebhookSecret(req: Request): boolean {
  const expected = Deno.env.get('DB_WEBHOOK_SECRET');
  if (!expected) {
    // Fail closed: an unconfigured secret must never be treated as "no
    // auth required".
    console.error('DB_WEBHOOK_SECRET is not configured');
    return false;
  }
  return req.headers.get('x-webhook-secret') === expected;
}
