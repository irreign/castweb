// Pulls real HDB resale transactions from data.gov.sg — actual town, block,
// street, floor area, lease commence date, and resale price. This is what
// should replace the hand-picked HDB entries in the app's sample data.
//
// Usage:
//   node fetch-hdb-resale.mjs <dataset-id> [town] [--months=6]
//
// You MUST pass the current dataset ID — search data.gov.sg for "Resale
// Flat Prices" (there are a few variants split by date range; the one
// covering recent years is what you want), open its "Data API" tab, and
// copy the id shown there. See fetch-dataset.mjs for details.
//
// Expected CSV columns (long-standing schema for this dataset): month, town,
// flat_type, block, street_name, storey_range, floor_area_sqm, flat_model,
// lease_commence_date, remaining_lease, resale_price.

import { writeFile } from 'node:fs/promises';
import { fetchDatasetCsv, parseCsv } from './fetch-dataset.mjs';
import { geocode } from './onemap.mjs';

async function main() {
  const args = process.argv.slice(2);
  const datasetId = args[0];
  if (!datasetId) {
    console.error('Usage: node fetch-hdb-resale.mjs <dataset-id> [town] [--months=6]');
    console.error('See the comment at the top of this file for how to find the dataset id.');
    process.exit(1);
  }
  const townFilter = args[1] && !args[1].startsWith('--') ? args[1].toUpperCase() : null;
  const monthsFlag = args.find((a) => a.startsWith('--months='));
  const monthsBack = monthsFlag ? parseInt(monthsFlag.split('=')[1], 10) : 6;

  console.log(`Fetching HDB resale transactions (dataset ${datasetId})...`);
  const csv = await fetchDatasetCsv(datasetId);
  const rows = parseCsv(csv);

  if (rows.length === 0) {
    console.error('Got 0 rows — the CSV may be empty or the dataset ID is wrong.');
    process.exit(1);
  }
  console.log(`Columns found: ${Object.keys(rows[0]).join(', ')}`);
  console.log(`Total rows: ${rows.length}`);

  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - monthsBack);
  const cutoffStr = `${cutoff.getFullYear()}-${String(cutoff.getMonth() + 1).padStart(2, '0')}`;

  let filtered = rows.filter((r) => r.month >= cutoffStr);
  if (townFilter) {
    filtered = filtered.filter((r) => (r.town || '').toUpperCase() === townFilter);
  }
  console.log(`Filtered to ${filtered.length} transactions from ${cutoffStr} onward${townFilter ? ` in ${townFilter}` : ''}.`);

  if (filtered.length === 0) {
    console.error('No rows matched — check the town spelling (as it appears in the town column) or widen --months.');
    process.exit(1);
  }

  // Geocode a sample (not every row — could be thousands) to avoid hammering OneMap.
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
  console.log(`(${filtered.length - sample.length} more matched but weren't geocoded — raise --months or narrow by town if you need a bigger sample.)`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
