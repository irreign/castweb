# sg-data-tools

Scripts to pull *real* Singapore property/school data, to replace the
hand-authored sample data in `Levelground/` and `LevelgroundExpo/`. They're
meant to be run on your own machine — this repo's Claude session sits behind
a network policy that blocks `data.gov.sg`, `onemap.gov.sg`, and `ura.gov.sg`
outright, so these can't be run from there.

Each script writes a `*.output.json` file. Send that file back (or its
contents) and it gets folded into the app's static `properties.ts` /
`schools.ts` / Swift equivalents, replacing the illustrative entries.

## Setup

```
cd sg-data-tools
node --version   # need Node 18+ for built-in fetch; you're almost certainly fine
```

No `npm install` needed — everything uses Node's built-in `fetch`.

## 1. Geocoding (OneMap) — no signup needed

```
node onemap.mjs "8 Toh Tuck Road"
node onemap.mjs "Beauty World MRT"
```

Prints the matched address, postal code, and lat/lon. High confidence this
just works — it's a long-stable public endpoint.

## 2. School directory (data.gov.sg)

First find the current dataset ID: go to data.gov.sg, search **"General
information of schools"**, open it, and copy the id out of the page's URL
(`.../datasets/d_xxxxxxxx/view`).

Then:
```
node fetch-schools.mjs <dataset-id> --level=PRIMARY
```

This fetches every primary school's address and geocodes each one via
OneMap — takes a couple minutes since it's one request per school. Writes
`schools.output.json`.

## 3. HDB resale transactions (data.gov.sg)

"Resale Flat Prices" isn't one dataset — it's a *collection* of several,
split by time period. The collection id (`189`) is already confirmed and
built in as the default, so no manual dataset-id hunting needed here:

```
node fetch-hdb-resale.mjs             # collection 189, all towns, last 6 months
node fetch-hdb-resale.mjs 189 BEDOK --months=6
```

Town name is optional (case-insensitive, must match how it appears in the
data, e.g. `BEDOK`, `JURONG WEST`); omit it to pull all towns. `--months`
controls how far back to look. The script fetches the collection's metadata
first to find its current child dataset ids, pulls from each, then geocodes
a sample of up to 30 matching transactions (not all of them, to avoid
hammering OneMap) and writes `hdb-resale.output.json`.

## 4. Private property transactions (URA) — needs a free API key

1. Register at https://eservice.ura.gov.sg/maps/api/ for an AccessKey (free,
   takes a few minutes).
2. `cp .env.example .env`, then edit `.env` and set `URA_ACCESS_KEY` to your
   real key. `.env` is gitignored — it never gets committed. (A plain shell
   `export` also works for a one-off manual run, but only `.env` gets picked
   up by the weekly automation in section 5, since launchd jobs don't
   inherit your shell's environment.)
3. `node fetch-ura-private.mjs 1` (batch 1–4, each a different quarterly
   slice — run a couple of them to get more coverage)

Writes `ura-transactions.output.json` — real project names, psf, floor area,
district, tenure, transaction date. This is the one that catches things like
Daintree Residence automatically instead of me having to know it by name.
A single batch can easily be 15,000+ rows across a few hundred projects —
run `node summarize-ura.mjs` afterward to condense that down to one row per
project (name, district, tenure, avg/min/max psf), which is small enough to
actually paste into chat.

## 5. Running it automatically every week

This can't be scheduled from the Claude Code session that built these
scripts — that environment is network-blocked from these exact sites, and
separately, there's no mechanism for a cloud session to reach out and
execute anything on your own Mac. The automation has to live on your
machine, using macOS's own scheduler (`launchd`).

**Setup:**
```
chmod +x run-weekly.sh
```
Open `com.henry.sgdatatools.weekly.plist` and check the two paths inside
match where you actually cloned the repo (currently set to
`/Users/Henry/castweb/sg-data-tools/` — fix both `ProgramArguments` and the
two log paths if your clone lives somewhere else, e.g. `castweb-check`).

Then install it:
```
cp com.henry.sgdatatools.weekly.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/com.henry.sgdatatools.weekly.plist
```
It'll fire every Monday at 9am from then on, even across reboots. To test it
immediately instead of waiting for Monday:
```
launchctl start com.henry.sgdatatools.weekly
```
Check `run-log.txt` in this folder afterward to see what happened.

To change the schedule, edit the `Hour`/`Minute`/`Weekday` numbers in the
plist (`Weekday`: 0=Sunday...6=Saturday) and reload:
```
launchctl unload ~/Library/LaunchAgents/com.henry.sgdatatools.weekly.plist
launchctl load ~/Library/LaunchAgents/com.henry.sgdatatools.weekly.plist
```

To stop it entirely:
```
launchctl unload ~/Library/LaunchAgents/com.henry.sgdatatools.weekly.plist
rm ~/Library/LaunchAgents/com.henry.sgdatatools.weekly.plist
```

**What it actually does:** runs schools (dataset id already filled in) and
HDB resale (collection 189, already filled in) unconditionally, runs URA
too if `.env` has a real `URA_ACCESS_KEY` in it, and — if URA ran — also
runs `summarize-ura.mjs` automatically so you get the condensed per-project
summary without an extra manual step. Every output gets a dated copy
(`schools.output.2026-08-03.json`, etc.) so you can compare week to week
instead of overwriting. It does **not** commit or push anything
automatically, and does not send anything to me — you still choose when to
hand a file over to be folded into the app.

## Honesty check on all of this

- OneMap: confirmed working.
- data.gov.sg `datastore_search` (schools): confirmed working — the exact
  endpoint came from data.gov.sg's own documented example, not a guess.
- data.gov.sg collections API (HDB resale, collection 189): confirmed the
  collection id and that dataset-id discovery + per-dataset fetching works.
- URA private transactions: confirmed working end to end — 20,507
  transactions across 292 projects on the first real run.

Everything above has now actually been run successfully at least once. What
hasn't been independently double-checked yet: whether every field URA
returns is being mapped correctly in `fetch-ura-private.mjs` (psf is
computed as price÷area, which assumes `area` is in square feet — worth a
sanity check against a project you know the numbers for), and whether batch
2–4 behave the same way batch 1 did.
