# Lumi — Safe to Spend

An interactive redesign of Lumi's core screens, built around one idea: **the app answers "how much can I safely spend right now," not "where did my money go."**

Open `index.html` directly in a browser (no build step, no dependencies) to try it — Home, Add, Coach and Goals are all live: type a transaction, ask "can I afford this," drag the goal-acceleration slider.

## Critique of the current direction

**Working well**

- The Safe-to-Spend number already exists as a concept and sits at the top of Home — the right instinct.
- Quick Add's premise (type a sentence, get a parsed transaction) is genuinely differentiated; most competitors still open a form first.
- "Can I afford it?" as a named, first-class feature (not a generic chatbot) is the strongest idea in the brief — it turns a yes/no question into a decision with visible trade-offs.
- Goals framed as trips/funds/cars with photos, not raw numbers, is the right emotional register.

**Weak points in the current screens**

- Every screen is a stack of bordered cards (balance card, bills card, goals card, insights card). Card chrome is competing with the numbers for attention, so nothing is actually the hero — it reads as a dashboard, not an assistant.
- The safe-to-spend number is roughly the same visual weight as "Cash on hand" and "Committed" beneath it. If it's the most important number in the product, it needs to be 4-5× the size of everything else on the screen, not just in a tinted box.
- The AI screen looks like a chat transcript. A money coach that only talks is slower than one that shows a bar chart of the two futures ("today" vs "after this purchase") — the simulation is the answer, the text is a caption.
- Categories ("Dining Out S$742, ↑23%") are presented as the payoff of Insights. Nobody changes behavior because a pie slice grew — they change behavior when told a category shift moves a *date* (their Japan trip, their emergency fund). The category breakdown should be evidence, not the headline.
- Tone risk: "You spent S$173 more on dining" reads as a scold. Reworded throughout to "running above your usual pace" / "your fastest-growing category" — observational, not judgmental.

**What this redesign removes, on purpose**

- No persistent balance-card grid on Home. Cash on hand / upcoming bills / committed / savings goals become one quiet typographic row ("Your position"), below the fold created by the hero number, not competing with it.
- No chat-first AI. The Coach screen opens on four decisions, not a text box.
- No category pie/bar chart on this pass. It's a legitimate future screen, but it wasn't the differentiator — the goal-acceleration slider ("cut dining by 20% → reach your trip 3 months sooner") does the same behavioral job with far less visual weight, so it's built here instead.

## Design system

| Token | Light | Dark | Use |
|---|---|---|---|
| `--canvas` | `#F3F1EA` | `#171813` | App background — warm linen, not fintech white or cream-cliché |
| `--canvas-raised` | `#EAE5D6` | `#211F18` | The *one* elevated surface: the AI insight card |
| `--ink` / `--ink-muted` / `--ink-faint` | `#1C1B17` / `#6B6759` / `#9B9686` | inverted | Primary / secondary / meta text — three steps, no more |
| `--accent` / `--accent-2` | `#2F5D46` / `#3F7D58` | `#6FAE8B` / `#86C7A1` | Moss green, not mint or fintech neon. `-2` is the brighter working tone for fills/links |
| `--danger` | `#B5544A` | `#E08578` | Terracotta, not alarm red — a bill due, not an error |
| `--warning` | `#A97A34` | `#D9A75B` | Ochre — a date worth noticing, not a threat |
| `--divider` | `#E2DDCE` | `#33322A` | The only border weight in the system |

**Type** — Fraunces (serif, optical-size axis) carries every number and headline that should feel considered: the hero figure, goal names, the AI insight's headline, simulated dates. Work Sans carries everything functional: labels, list rows, buttons, captions. The split does real work — it's how the hero number reads as *the* number rather than another UI label, without needing a bigger card or a bright color to say so.

**Layout rule** — exactly one card style exists (the AI insight surface, `--canvas-raised` + 20px radius). Everything else — the next-up timeline, the position row, goal rows — is flat typography separated by hairlines and spacing. Reserving elevation for a single surface is what makes that surface read as "look at this" instead of one box among many.

**Motion** — deliberately restrained: screens cross-fade, a slider updates a number in place, a saved transaction gets one toast. Nothing animates on load; the page is legible at rest.

## What's deliberately out of scope here

This is a front-end prototype: static example data, no backend, no auth, no persistence. It's meant to settle the *product and visual* direction before the harder engineering work — a real data model (Users, Households, Accounts, Transactions, Cash-Flow Events, Goals, Budgets), an AI provider abstraction, and the parsing/forecasting logic behind Quick Add and "Can I afford it?" — starts.
