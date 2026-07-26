// Generic puller for data.gov.sg's "poll-download" API, which is the current
// (as of this writing) way to get a CSV out of a dataset on data.gov.sg.
//
// Confidence: medium. data.gov.sg has changed its API shape before (there
// used to be an older CKAN-style `datastore_search` API). If poll-download
// 404s or returns something unexpected, data.gov.sg's site has a "Data API"
// tab on every dataset page that shows a ready-to-use fetch snippet with the
// CURRENT endpoint and dataset ID for that exact dataset — copy that over
// this file's request instead of trusting this comment.
//
// You get the dataset ID by: go to data.gov.sg, search for the dataset by
// name, open it, click "Data API", and copy the id that looks like
// "d_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" out of the snippet shown there.

const POLL_DOWNLOAD_URL = (datasetId) =>
  `https://api-open.data.gov.sg/v1/public/api/datasets/${datasetId}/poll-download`;

export async function fetchDatasetCsv(datasetId) {
  const res = await fetch(POLL_DOWNLOAD_URL(datasetId));
  if (!res.ok) {
    throw new Error(
      `data.gov.sg poll-download failed (${res.status}) for dataset ${datasetId}. ` +
        `The dataset ID may be stale — see the comment at the top of fetch-dataset.mjs.`
    );
  }
  const body = await res.json();
  const downloadUrl = body?.data?.url;
  if (!downloadUrl) {
    throw new Error(`Unexpected response shape from data.gov.sg: ${JSON.stringify(body)}`);
  }
  const csvRes = await fetch(downloadUrl);
  if (!csvRes.ok) {
    throw new Error(`Failed to download CSV from ${downloadUrl} (${csvRes.status})`);
  }
  return await csvRes.text();
}

export function parseCsv(csvText) {
  const lines = csvText.split(/\r?\n/).filter((l) => l.length > 0);
  const headers = splitCsvLine(lines[0]);
  return lines.slice(1).map((line) => {
    const cells = splitCsvLine(line);
    const row = {};
    headers.forEach((h, i) => {
      row[h] = cells[i] ?? '';
    });
    return row;
  });
}

function splitCsvLine(line) {
  const cells = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      cells.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  cells.push(cur);
  return cells;
}
