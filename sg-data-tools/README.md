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

First find the current dataset ID:
1. Go to data.gov.sg, search **"General information of schools"**.
2. Open the dataset, click the **Data API** tab.
3. Copy the ID that looks like `d_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx` out of the
   snippet shown there.

Then:
```
node fetch-schools.mjs <dataset-id> --level=PRIMARY
```

This fetches every primary school's address and geocodes each one via
OneMap — takes a couple minutes since it's one request per school. Writes
`schools.output.json`.

## 3. HDB resale transactions (data.gov.sg)

Same deal — search **"Resale Flat Prices"** on data.gov.sg, grab the current
dataset ID from the Data API tab (pick the one covering recent years).

```
node fetch-hdb-resale.mjs <dataset-id> BEDOK --months=6
```

Town name is optional (case-insensitive, must match how it appears in the
data, e.g. `BEDOK`, `JURONG WEST`); omit it to pull all towns. `--months`
controls how far back to look. Geocodes a sample of up to 30 matching
transactions (not all of them, to avoid hammering OneMap) and writes
`hdb-resale.output.json`.

## 4. Private property transactions (URA) — needs a free API key

1. Register at https://eservice.ura.gov.sg/maps/api/ for an AccessKey (free,
   takes a few minutes).
2. `export URA_ACCESS_KEY="your-key-here"`
3. `node fetch-ura-private.mjs 1` (batch 1–4, each a different quarterly
   slice — run a couple of them to get more coverage)

Writes `ura-transactions.output.json` — real project names, psf, floor area,
district, tenure, transaction date. This is the one that would have caught
Daintree Residence automatically instead of me having to know it by name.

## Honesty check on all of this

- OneMap: I'm confident this works as written.
- data.gov.sg scripts: the CSV *columns* I'm confident about (long-stable
  schemas), the poll-download *mechanism* I'm fairly confident about, but the
  exact dataset IDs rotate, which is why they're required arguments instead
  of something I hardcoded and hoped was still right.
- URA: the AccessKey → Token → invokeUraDS flow is long-documented, but I
  could not test it live from this session (network policy blocks
  `ura.gov.sg` here) — if the response shape is off, the field names in
  `fetch-ura-private.mjs`'s mapping are the first thing to check against
  URA's current docs.

None of these scripts were run before being handed to you. Expect the first
attempt at each to surface a small mismatch (a renamed column, a stale
dataset ID) rather than working perfectly blind.
