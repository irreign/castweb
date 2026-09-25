# Lumi — Safe to Spend

A real, single-user personal finance app centered on one number: **how much can I safely spend right now.** Not a demo anymore — your own income, bills, goals and transactions are entered once in Settings, stored in a Cloudflare KV database behind a passcode, and every screen computes live from that data.

## How it works

- **Frontend:** `index.html` — one static file, no build step, no framework. On load it asks for your passcode, fetches your data from `/api/state`, and renders everything from it.
- **Backend:** `functions/api/state.js` — a Cloudflare Pages Function. `GET` returns your data (seeding sensible starter numbers the first time), `POST` overwrites it. Both require a passcode header.
- **Storage:** one JSON document in a Cloudflare KV namespace. This is intentionally a single blob, not a relational schema — there's one person's data here, not a multi-tenant system, so read-modify-write on one document is simpler and has fewer moving parts than a database schema would be.
- **Auth:** a single shared passcode, set as a Cloudflare secret (`LUMI_PIN`), checked on every request via an `x-lumi-pin` header. There's no account system — this is built for one person, and the passcode exists only to keep the public URL from being an open door to your numbers. It is not bank-grade security; don't put anything in here you wouldn't want visible to someone who both finds the URL and guesses the passcode.

## One-time Cloudflare setup

You already have a Pages project. Two things need to be added to it — both in the dashboard, no CLI required:

1. **KV namespace:** Workers & Pages → **KV** → Create a namespace (any name, e.g. `lumi-data`). Then, on your Pages project → **Settings → Functions → KV namespace bindings** → add a binding: variable name `LUMI_KV`, pointing at that namespace.
2. **Passcode secret:** Pages project → **Settings → Environment variables** → add `LUMI_PIN`, value = whatever passcode you want to use, and mark it **Encrypt**. Do this for both Production and Preview if you use both.

Then redeploy with **the whole `lumi` folder this time** (not just `index.html`) — it needs `functions/api/state.js` alongside it for the API routes to exist. If your project is Git-connected, just push; if you're doing a direct upload, drag the entire `lumi` folder in.

First load after that will ask for your passcode, then seed some example starter numbers (an example income, three example bills, three example goals, five example transactions) so the screens aren't empty — replace them in Settings and Add whenever you're ready; nothing about them is real.

## What's actually computed, not hardcoded

- **Safe to spend today** = (this month's income − this month's bills − this month's goal contributions − what you've already spent this month) ÷ days left in the month.
- **Next up** = your bills' due dates and your next payday, computed from the day-of-month you set in Settings, sorted and dated relative to today.
- **Your position** = cash on hand minus spend-to-date (Available), this month's bills (Committed), this month's total goal contributions (Goals).
- **Home insight** = a real comparison of your last 30 days of spending against the 30 days before that, by category — not a canned message, and it says plainly when there isn't enough data yet instead of making something up.
- **Can I afford it** = recomputes your daily safe-to-spend as if the purchase already happened, and estimates how many days it eats into your top goal's typical monthly contribution.
- **Goals slider** = frees up a percentage of your actual last-30-days dining spend and re-projects the goal's target date from its remaining amount and (contribution + freed amount).
- **Quick Add parsing** = a small rule-based parser, not AI: it pulls the first number as the amount, matches merchant/category keywords (NTUC → Groceries, Grab + a food word → Dining Out, Grab alone → Transport, etc.), and title-cases the first likely merchant word. It's honest about being rules, not language understanding — it won't parse unusual phrasing well, and you can always fix the fields before saving.

## Editing your data

- **Settings** (gear icon, top-right of Home): your name, account label, cash on hand, monthly income and payday; add/remove bills and goals there too.
- **Add screen:** type a transaction, check the parsed fields, save. A "Recent" list underneath lets you delete a mistake.
- Everything writes through to the same KV document immediately — open the app on another device with the same passcode and you'll see the same numbers.

## Known limits (by design, for now)

- One passcode, one dataset — this isn't a multi-user product.
- No bank linking; all entry is manual (or parsed from what you type).
- No transaction editing, only delete-and-re-add.
- Quick Add's "Speak" and "Scan" modes are UI-only placeholders that resolve to a sample parsed entry — there's no real voice or OCR pipeline wired up.
- The "Help me save" and "Explain my spending" coach panels look at your last 30 days only; there's no multi-month trend history yet.
