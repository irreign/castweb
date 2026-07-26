#!/bin/bash
# Weekly refresh of the sg-data-tools outputs. Meant to be run by a macOS
# launchd job (see com.henry.sgdatatools.weekly.plist), but you can also just
# run it directly: ./run-weekly.sh
#
# Each fetch step is skipped (not failed) if its dataset id / key isn't
# configured yet below, so filling these in one at a time is fine.

set -uo pipefail
cd "$(dirname "$0")"

# ---- Configure these ----
SCHOOLS_DATASET_ID="d_688b934f82c1059ed0a6993d2a829089"
HDB_COLLECTION_ID="189"   # "Resale Flat Prices" collection, confirmed
HDB_TOWN=""               # optional, e.g. BEDOK — leave blank for all towns
# URA_ACCESS_KEY: export it in your shell profile, or uncomment and set here:
# URA_ACCESS_KEY="your-key-here"
# --------------------------

# launchd runs jobs with a minimal PATH — make sure node is findable.
export PATH="/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:${PATH:-}"

DATE=$(date +%Y-%m-%d)
LOG="run-log.txt"

echo "=== sg-data-tools weekly run: $DATE $(date +%H:%M:%S) ===" >> "$LOG"

if ! command -v node >/dev/null 2>&1; then
  echo "[$DATE] ERROR: node not found in PATH. Run 'which node' in a normal terminal and add that directory to the PATH line above." >> "$LOG"
  exit 1
fi

if [ -n "$SCHOOLS_DATASET_ID" ]; then
  echo "[$DATE] Fetching schools..." >> "$LOG"
  node fetch-schools.mjs "$SCHOOLS_DATASET_ID" --level=PRIMARY >> "$LOG" 2>&1
  if [ -f schools.output.json ]; then
    cp schools.output.json "schools.output.$DATE.json"
    echo "[$DATE] Saved schools.output.$DATE.json" >> "$LOG"
  fi
else
  echo "[$DATE] Skipping schools — SCHOOLS_DATASET_ID not set." >> "$LOG"
fi

if [ -n "$HDB_COLLECTION_ID" ]; then
  echo "[$DATE] Fetching HDB resale..." >> "$LOG"
  node fetch-hdb-resale.mjs "$HDB_COLLECTION_ID" $HDB_TOWN --months=1 >> "$LOG" 2>&1
  if [ -f hdb-resale.output.json ]; then
    cp hdb-resale.output.json "hdb-resale.output.$DATE.json"
    echo "[$DATE] Saved hdb-resale.output.$DATE.json" >> "$LOG"
  fi
else
  echo "[$DATE] Skipping HDB resale — HDB_COLLECTION_ID not set." >> "$LOG"
fi

if [ -n "${URA_ACCESS_KEY:-}" ]; then
  echo "[$DATE] Fetching URA transactions..." >> "$LOG"
  node fetch-ura-private.mjs 1 >> "$LOG" 2>&1
  if [ -f ura-transactions.output.json ]; then
    cp ura-transactions.output.json "ura-transactions.output.$DATE.json"
    echo "[$DATE] Saved ura-transactions.output.$DATE.json" >> "$LOG"
  fi
else
  echo "[$DATE] Skipping URA — URA_ACCESS_KEY not set." >> "$LOG"
fi

echo "[$DATE] Done." >> "$LOG"
echo "" >> "$LOG"
