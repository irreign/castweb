// Pulls real private residential property transactions (project name, psf,
// floor area, district, transaction date) from URA's Property Market Data API.
// This is what should replace the hand-picked condo entries and made-up psf
// figures in the app's sample data.
//
// Setup (one-time, free):
//   1. Register at https://eservice.ura.gov.sg/maps/api/ for an AccessKey.
//   2. Set it as an env var before running:
//        export URA_ACCESS_KEY="your-key-here"
//
// Usage:
//   node fetch-ura-private.mjs [batch]     # batch is 1-4, each covers a different
//                                           # quarterly slice; omit to fetch batch 1
//
// Confidence: medium. The AccessKey -> Token -> invokeUraDS flow and the
// PMI_Resi_Transaction service name reflect URA's long-documented API shape,
// but I could not test this live from here (this environment's network
// policy blocks ura.gov.sg outright) — if the response shape doesn't match
// what this script expects, check https://www.ura.gov.sg/maps/api/ for the
// current docs and adjust the field names in the mapping below.

import { writeFile } from 'node:fs/promises';

const BASE = 'https://eservice.ura.gov.sg/uraDataService';

async function getToken(accessKey) {
  const res = await fetch(`${BASE}/insertNewToken/v1`, {
    headers: { AccessKey: accessKey },
  });
  if (!res.ok) {
    throw new Error(`URA token request failed (${res.status}). Check your AccessKey is valid and active.`);
  }
  const body = await res.json();
  if (body.Status !== 'Success' || !body.Result) {
    throw new Error(`Unexpected token response: ${JSON.stringify(body)}`);
  }
  return body.Result;
}

async function getTransactions(accessKey, token, batch) {
  const url = new URL(`${BASE}/invokeUraDS/v1`);
  url.searchParams.set('service', 'PMI_Resi_Transaction');
  url.searchParams.set('batch', String(batch));
  const res = await fetch(url, {
    headers: { AccessKey: accessKey, Token: token },
  });
  if (!res.ok) {
    throw new Error(`URA transaction request failed (${res.status}).`);
  }
  const body = await res.json();
  if (body.Status !== 'Success') {
    throw new Error(`Unexpected transaction response: ${JSON.stringify(body)}`);
  }
  return body.Result;
}

async function main() {
  const accessKey = process.env.URA_ACCESS_KEY;
  if (!accessKey) {
    console.error('Set URA_ACCESS_KEY first — see the setup instructions at the top of this file.');
    process.exit(1);
  }
  const batch = process.argv[2] ? Number(process.argv[2]) : 1;

  console.log('Requesting URA API token...');
  const token = await getToken(accessKey);

  console.log(`Fetching private residential transactions (batch ${batch})...`);
  const projects = await getTransactions(accessKey, token, batch);

  // The API groups transactions by project, each with a nested list of
  // individual sale records. Flatten that into one row per transaction.
  const flattened = [];
  for (const project of projects) {
    const transactions = project.transaction || [];
    for (const t of transactions) {
      flattened.push({
        project: project.project,
        street: project.street,
        district: project.district,
        propertyType: project.propertyType,
        tenure: project.tenure,
        price: Number(t.price),
        area: Number(t.area),
        psf: t.area && t.price ? Math.round(Number(t.price) / Number(t.area)) : null,
        floorRange: t.floorRange,
        contractDate: t.contractDate,
        typeOfSale: t.typeOfSale,
      });
    }
  }

  await writeFile('ura-transactions.output.json', JSON.stringify(flattened, null, 2));
  console.log(`Wrote ${flattened.length} transactions across ${projects.length} projects to ura-transactions.output.json.`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
