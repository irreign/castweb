// Minimal CORS support for the two functions the iOS app calls directly
// (ai-assistant, invite). ai-extract and push-dispatch are webhook-only and
// never receive a browser-style preflight, but responding correctly here
// costs nothing and helps anyone testing the functions from a browser/Studio.
export const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export function handleCorsPreflight(req: Request): Response | null {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }
  return null;
}
