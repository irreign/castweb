# Tests

```
npm test
# or directly:
node --experimental-strip-types --test tests/*.test.ts
```

No build step, no dependencies — these run against the exact same
`supabase/functions/_shared/{extraction,dates}.ts` source the Edge
Functions import, using Node 22's built-in TypeScript type-stripping and
test runner.

## What these prove, and what they don't

`extraction.test.ts` covers the 8 minimum scenarios from brief §28
(explicit event, birthday, date range, relative date, ambiguous, non-event,
correction, duplicate) plus conversational context, malformed-output
handling, and threshold governance — but every test feeds **synthetic**
model output into `validateExtraction`/`matchAgainstExistingEvents`/
`decideOutcome`. They prove: *given what Claude plausibly returns for a
sentence, does the server-side pipeline route it correctly and never
silently guess*. They do not prove Claude itself returns that output for
that sentence — that requires a live model call.

`dates.test.ts` covers relative-date resolution (§8) directly and
completely, including the one genuinely ambiguous rule the brief implies:
"next Monday" always skips the current week even when the nearest Monday
hasn't happened yet.

## Running the same 8 scenarios against the live Claude API

Once `CLAUDE_API_KEY` is set, the fastest way to sanity-check prompt
quality against a real model is to `supabase functions serve ai-extract`
locally and POST the brief's example sentences at it end-to-end (through a
seeded family/conversation) — see `supabase/README.md`. This is
intentionally a manual follow-up, not automated in this repo: it costs
real API calls, and prompt wording is expected to be iterated against
live results (docs/09 §"Known issues").
