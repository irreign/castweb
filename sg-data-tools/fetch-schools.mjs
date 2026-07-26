// Pulls MOE's "General Information of Schools" dataset from data.gov.sg and
// geocodes every school's address via OneMap to get real coordinates.
//
// Usage:
//   node fetch-schools.mjs <dataset-id> [--level=PRIMARY]
//
// You MUST pass the current dataset ID yourself — see fetch-dataset.mjs for
// how to find it on data.gov.sg (search "General information of schools",
// open the dataset, click "Data API", copy the id shown there). This script
// deliberately does not hardcode one, since that ID is the part most likely
// to have rotated since this was written.
//
// Expected CSV columns (as of the dataset's long-standing schema): school_name,
// address, postal_code, mrt_desc, mainlevel_code (PRIMARY / SECONDARY / etc).
// If data.gov.sg has renamed these columns, the script will print what it
// actually found so you can adjust the field names below.

import { writeFile } from 'node:fs/promises';
import { fetchDatasetCsv, parseCsv } from './fetch-dataset.mjs';
import { geocode } from './onemap.mjs';

async function main() {
  const [datasetId, ...rest] = process.argv.slice(2);
  if (!datasetId) {
    console.error('Usage: node fetch-schools.mjs <dataset-id> [--level=PRIMARY]');
    console.error('See the comment at the top of this file for how to find the dataset id.');
    process.exit(1);
  }
  const levelFlag = rest.find((a) => a.startsWith('--level='));
  const levelFilter = levelFlag ? levelFlag.split('=')[1].toUpperCase() : null;

  console.log(`Fetching school directory (dataset ${datasetId})...`);
  const csv = await fetchDatasetCsv(datasetId);
  const rows = parseCsv(csv);

  if (rows.length === 0) {
    console.error('Got 0 rows — the CSV may be empty or the dataset ID is wrong.');
    process.exit(1);
  }
  console.log(`Columns found: ${Object.keys(rows[0]).join(', ')}`);

  let filtered = rows;
  if (levelFilter) {
    filtered = rows.filter((r) => (r.mainlevel_code || '').toUpperCase() === levelFilter);
    console.log(`Filtered to ${filtered.length} of ${rows.length} schools at level "${levelFilter}".`);
  }

  console.log(`Geocoding ${filtered.length} schools via OneMap (one request each, ~150ms apart)...`);
  const results = [];
  for (const row of filtered) {
    const name = row.school_name;
    const address = [row.address, row.postal_code].filter(Boolean).join(' ');
    let geo = null;
    try {
      geo = await geocode(address || name);
    } catch (err) {
      console.warn(`Geocoding failed for ${name}: ${err.message}`);
    }
    results.push({
      name,
      address: row.address,
      postalCode: row.postal_code,
      mrt: row.mrt_desc,
      lat: geo?.lat ?? null,
      lon: geo?.lon ?? null,
    });
    await new Promise((r) => setTimeout(r, 150));
  }

  const missing = results.filter((r) => r.lat == null).length;
  await writeFile('schools.output.json', JSON.stringify(results, null, 2));
  console.log(`Wrote ${results.length} schools to schools.output.json (${missing} failed to geocode).`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
