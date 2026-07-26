// Condenses a ura-transactions.output.json (one row per sale, can be tens of
// thousands of rows) down to one row per project — real name, district,
// tenure, property type, and average/min/max psf. Small enough to paste
// into a chat, unlike the raw transaction list.
//
// Usage:
//   node summarize-ura.mjs [input-file]     # defaults to ura-transactions.output.json

import { readFile, writeFile } from 'node:fs/promises';

async function main() {
  const inputFile = process.argv[2] || 'ura-transactions.output.json';
  const raw = await readFile(inputFile, 'utf-8');
  const rows = JSON.parse(raw);

  const byProject = new Map();
  for (const r of rows) {
    const key = r.project;
    if (!byProject.has(key)) {
      byProject.set(key, {
        project: r.project,
        street: r.street,
        district: r.district,
        propertyType: r.propertyType,
        tenure: r.tenure,
        count: 0,
        psfSum: 0,
        psfCount: 0,
        psfMin: Infinity,
        psfMax: -Infinity,
      });
    }
    const agg = byProject.get(key);
    agg.count += 1;
    if (r.psf) {
      agg.psfSum += r.psf;
      agg.psfCount += 1;
      agg.psfMin = Math.min(agg.psfMin, r.psf);
      agg.psfMax = Math.max(agg.psfMax, r.psf);
    }
  }

  const summary = [...byProject.values()]
    .map((p) => ({
      project: p.project,
      street: p.street,
      district: p.district,
      propertyType: p.propertyType,
      tenure: p.tenure,
      transactionCount: p.count,
      avgPsf: p.psfCount ? Math.round(p.psfSum / p.psfCount) : null,
      psfMin: p.psfMin === Infinity ? null : p.psfMin,
      psfMax: p.psfMax === -Infinity ? null : p.psfMax,
    }))
    .sort((a, b) => (a.district || '').localeCompare(b.district || '') || a.project.localeCompare(b.project));

  await writeFile('ura-summary.output.json', JSON.stringify(summary, null, 2));
  console.log(`Summarized ${rows.length} transactions into ${summary.length} projects -> ura-summary.output.json`);

  const daintree = summary.filter((p) => p.project?.toUpperCase().includes('DAINTREE'));
  console.log('');
  if (daintree.length) {
    console.log('Daintree match(es) found:');
    console.log(JSON.stringify(daintree, null, 2));
  } else {
    console.log('No project matching "Daintree" in this batch — try fetching another batch (node fetch-ura-private.mjs 2, 3, 4).');
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
