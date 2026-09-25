// Cloudflare Pages Function — GET/POST /api/state
//
// Storage: one JSON blob under the KV key "state", in the KV namespace bound
// to this Pages project as LUMI_KV (Cloudflare dashboard → your Pages
// project → Settings → Functions → KV namespace bindings).
//
// Auth: every request must carry header "x-lumi-pin" matching the secret
// environment variable LUMI_PIN (Settings → Environment variables → add
// LUMI_PIN, mark it "Encrypt"). There is no per-user account system here —
// this app is built for one person, and the PIN is what keeps the public
// URL from being an open door to your numbers.

const JSON_HEADERS = { "content-type": "application/json; charset=utf-8" };

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

function checkPin(request, env) {
  if (!env.LUMI_PIN) {
    return { ok: false, setupNeeded: true };
  }
  const header = request.headers.get("x-lumi-pin") || "";
  return { ok: header === env.LUMI_PIN, setupNeeded: false };
}

function defaultState() {
  const today = new Date();
  const y = today.getFullYear();
  const m = today.getMonth();
  const iso = (d) => new Date(y, m, d).toISOString().slice(0, 10);
  return {
    seeded: true,
    profile: {
      name: "Sylvia",
      accountName: "Everyday account",
      cashOnHand: 5240,
      incomeAmount: 7800,
      incomeDay: 15,
    },
    bills: [
      { id: "b1", name: "DBS Credit Card", amount: 1200, day: 17 },
      { id: "b2", name: "Insurance", amount: 280, day: 21 },
      { id: "b3", name: "School Fees", amount: 650, day: 30 },
    ],
    goals: [
      { id: "g1", emoji: "🇯🇵", name: "Japan Family Trip", target: 10000, current: 7820, monthlyContribution: 400 },
      { id: "g2", emoji: "🐷", name: "Emergency Fund", target: 20000, current: 12000, monthlyContribution: 300 },
      { id: "g3", emoji: "🚗", name: "New Car", target: 80000, current: 8500, monthlyContribution: 200 },
    ],
    transactions: [
      { id: "t1", merchant: "Grab", amount: 18.5, category: "Dining Out", date: iso(Math.max(1, today.getDate() - 1)), note: "Grab 18.50 dinner last night" },
      { id: "t2", merchant: "NTUC FairPrice", amount: 64.2, category: "Groceries", date: iso(Math.max(1, today.getDate() - 3)) },
      { id: "t3", merchant: "Starbucks", amount: 7.4, category: "Dining Out", date: iso(Math.max(1, today.getDate() - 4)) },
      { id: "t4", merchant: "Grab", amount: 22.9, category: "Dining Out", date: iso(Math.max(1, today.getDate() - 6)) },
      { id: "t5", merchant: "Shopee", amount: 39.9, category: "Shopping", date: iso(Math.max(1, today.getDate() - 8)) },
    ],
  };
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const auth = checkPin(request, env);
  if (auth.setupNeeded) {
    return json({ error: "LUMI_PIN is not configured for this deployment yet. Add it under Settings → Environment variables on the Pages project, then redeploy." }, 500);
  }
  if (!auth.ok) return json({ error: "Incorrect passcode." }, 401);

  if (!env.LUMI_KV) {
    return json({ error: "LUMI_KV is not bound to this Pages project yet. Add a KV namespace binding named LUMI_KV under Settings → Functions." }, 500);
  }

  const raw = await env.LUMI_KV.get("state");
  if (!raw) {
    const seeded = defaultState();
    await env.LUMI_KV.put("state", JSON.stringify(seeded));
    return json(seeded);
  }
  return json(JSON.parse(raw));
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const auth = checkPin(request, env);
  if (auth.setupNeeded) {
    return json({ error: "LUMI_PIN is not configured for this deployment yet." }, 500);
  }
  if (!auth.ok) return json({ error: "Incorrect passcode." }, 401);
  if (!env.LUMI_KV) {
    return json({ error: "LUMI_KV is not bound to this Pages project yet." }, 500);
  }

  let body;
  try {
    body = await request.json();
  } catch (e) {
    return json({ error: "Invalid JSON body." }, 400);
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return json({ error: "Body must be a JSON object." }, 400);
  }

  await env.LUMI_KV.put("state", JSON.stringify(body));
  return json({ ok: true });
}
