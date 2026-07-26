// Pulls real HDB resale transactions from data.gov.sg — actual town, block,
// street, floor area, lease commence date, and resale price.
//
// Usage:
//   node fetch-hdb-resale.mjs <dataset-id> [TOWN] [--months=6]
//
// Get the dataset id from the dataset's page on data.gov.sg (search "Resale
// Flat Prices", pick the resource covering recent years, copy the id from
// the page URL: .../datasets/d_xxxxxxxx/view).
//
// Expected fields (long-standing schema for this dataset): month, town,
// flat_type, block, street_name, storey_range, floor_area_sqm, flat_model,
// lease_commence_date, remaining_lease, resale_price.

import { writeFile } from 'node:fs/promises';
import { fetchAllRecords } from './fetch-dataset.mjs';
import { geocode } from './onemap.mjs';

async function main() {
  const args = process.argv.slice(2);
  const datasetId = args[0];
  if (!datasetId) {
    console.error('Usage: node fetch-hdb-resale.mjs <dataset-id> [TOWN] [--months=6]');
    process.exit(1);
  }
  const townFilter = args[1] && !args[1].startsWith('--') ? args[1].toUpperCase() : null;
  const monthsFlag = args.find((a) => a.startsWith('--months='));
  const monthsBack = monthsFlag ? parseInt(monthsFlag.split('=')[1], 10) : 6;

  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - monthsBack);
  const cutoffStr = `${cutoff.getFullYear()}-${String(cutoff.getMonth() + 1).padStart(2, '0')}`;

  console.log(
    `Fetching HDB resale transactions (dataset ${datasetId})${townFilter ? ` in ${townFilter}` : ''}, back to ${cutoffStr}...`
  );

  const rows = await fetchAllRecords(datasetId, {
    filters: townFilter ? { town: townFilter } : undefined,
    sort: 'month desc',
    // Sorted newest-first, so once an entire page is older than our cutoff
    // there's no point fetching further pages.
    stopWhen: (page) => page.every((r) => r.month < cutoffStr),
  });

  if (rows.length === 0) {
    console.error('Got 0 rows — check the town spelling (must match the data exactly, e.g. "BEDOK") or the dataset id.');
    process.exit(1);
  }
  console.log(`Fetched ${rows.length} rows. Fields found: ${Object.keys(rows[0]).join(', ')}`);

  const filtered = rows.filter((r) => r.month >= cutoffStr);
  console.log(`${filtered.length} of those are within the last ${monthsBack} months.`);

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
