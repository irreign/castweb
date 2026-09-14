// Pulls real HDB resale transactions from data.gov.sg.
//
// "Resale Flat Prices" isn't a single dataset — it's a *collection* of
// several datasets split by time period (e.g. 1990-1999, 2000-2012,
// 2012-2014, 2015-2016, 2017-onwards), grouped under collection id 189
// (confirmed directly from data.gov.sg, not guessed). This script fetches
// the collection's metadata to discover the current child dataset ids, then
// queries each one with the classic datastore_search API (confirmed working
// against fetch-dataset.mjs already).
//
// Usage:
//   node fetch-hdb-resale.mjs [collectionId] [TOWN] [--months=6]
//   node fetch-hdb-resale.mjs                          # defaults to 189, all towns, 6 months
//   node fetch-hdb-resale.mjs 189 BEDOK --months=3
//
// Confidence note: the collection-metadata endpoint and its exact JSON shape
// weren't something I could verify live (network policy blocks data.gov.sg
// from this session). Rather than guess a field name and risk being wrong
// again, this scans the raw metadata response for anything shaped like a
// dataset id (`d_` + 32 hex characters) instead of assuming a specific
// field path — if the collection's structure changes, this still finds the
// ids as long as they appear anywhere in the response.

import { writeFile } from 'node:fs/promises';
import { fetchAllRecords } from './fetch-dataset.mjs';
import { geocode } from './onemap.mjs';

const METADATA_URL = (collectionId) =>
  `https://api-production.data.gov.sg/v2/public/api/collections/${collectionId}/metadata`;

async function discoverDatasetIds(collectionId) {
  const res = await fetch(METADATA_URL(collectionId));
  if (!res.ok) {
    throw new Error(`Collection metadata request failed (${res.status}) for collection ${collectionId}.`);
  }
  const text = await res.text();
  const ids = [...new Set(text.match(/d_[0-9a-f]{32}/g) ?? [])];
  if (ids.length === 0) {
    console.error('Raw metadata response (no dataset-id-shaped strings found in it):');
    console.error(text);
    throw new Error('Could not find any dataset ids in the collection metadata — see the raw response above.');
  }
  return ids;
}

async function main() {
  const args = process.argv.slice(2);
  const collectionId = args[0] && /^\d+$/.test(args[0]) ? args[0] : '189';
  const rest = args[0] === collectionId ? args.slice(1) : args;
  const townFilter = rest[0] && !rest[0].startsWith('--') ? rest[0].toUpperCase() : null;
  const monthsFlag = rest.find((a) => a.startsWith('--months='));
  const monthsBack = monthsFlag ? parseInt(monthsFlag.split('=')[1], 10) : 6;

  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - monthsBack);
  const cutoffStr = `${cutoff.getFullYear()}-${String(cutoff.getMonth() + 1).padStart(2, '0')}`;

  console.log(`Looking up dataset ids inside collection ${collectionId}...`);
  const datasetIds = await discoverDatasetIds(collectionId);
  console.log(`Found ${datasetIds.length} dataset id(s): ${datasetIds.join(', ')}`);

  let allRows = [];
  for (const id of datasetIds) {
    console.log(`Fetching from dataset ${id}${townFilter ? ` (town=${townFilter})` : ''}...`);
    try {
      const rows = await fetchAllRecords(id, {
        filters: townFilter ? { town: townFilter } : undefined,
        sort: 'month desc',
        stopWhen: (page) => page.every((r) => r.month && r.month < cutoffStr),
      });
      console.log(`  -> ${rows.length} rows`);
      allRows = allRows.concat(rows);
    } catch (err) {
      console.warn(`  -> failed: ${err.message}`);
    }
  }

  if (allRows.length === 0) {
    console.error('No rows fetched from any dataset in this collection — check the town spelling or widen --months.');
    process.exit(1);
  }
  console.log(`Fields found: ${Object.keys(allRows[0]).join(', ')}`);

  const filtered = allRows.filter((r) => r.month && r.month >= cutoffStr);
  console.log(`${filtered.length} of ${allRows.length} fetched rows are within the last ${monthsBack} months.`);

  if (filtered.length === 0) {
    process.exit(1);
  }

  const sampleSize = Math.min(filtered.length, 30);
  const sample = filtered.slice(0, sampleSize);
  console.log(`Geocoding a sample of ${sample.length} addresses via OneMap...`);

  const results = [];
  for (const row of sample) {
    const address = `${row.block} ${row.street_name}`;
    let geo = null;
    try {
      geo = await geocode(address);
    } catch (err) {
      console.warn(`Geocoding failed for ${address}: ${err.message}`);
    }
    results.push({
      town: row.town,
      block: row.block,
      street: row.street_name,
      flatType: row.flat_type,
      floorAreaSqm: Number(row.floor_area_sqm),
      leaseCommenceYear: Number(row.lease_commence_date),
      remainingLease: row.remaining_lease,
      resalePrice: Number(row.resale_price),
      month: row.month,
      lat: geo?.lat ?? null,
      lon: geo?.lon ?? null,
    });
    await new Promise((r) => setTimeout(r, 150));
  }

  await writeFile('hdb-resale.output.json', JSON.stringify(results, null, 2));
  console.log(`Wrote ${results.length} geocoded transactions to hdb-resale.output.json.`);
  console.log(`(${filtered.length - sample.length} more matched but weren't geocoded — narrow by town or lower --months if you need a bigger sample.)`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
