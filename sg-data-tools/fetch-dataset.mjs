// data.gov.sg's public CKAN-style `datastore_search` API. Confirmed against
// data.gov.sg's own documented example (not guessed) — plain JSON records,
// paginated via limit/offset, with optional exact-match `filters` and `sort`.
//
// Docs pattern: https://data.gov.sg/api/action/datastore_search?resource_id=<id>&limit=10

const BASE = 'https://data.gov.sg/api/action/datastore_search';

/**
 * Fetch records from a data.gov.sg dataset, paginating automatically.
 *
 * @param {string} datasetId - e.g. "d_688b934f82c1059ed0a6993d2a829089"
 * @param {object} [options]
 * @param {number} [options.pageSize=1000] - rows per request
 * @param {Record<string,string>} [options.filters] - exact-match field filters,
 *   e.g. { town: "BEDOK" }
 * @param {string} [options.sort] - e.g. "month desc"
 * @param {(records: object[]) => boolean} [options.stopWhen] - called after
 *   each page; return true to stop paginating early (e.g. once sorted rows
 *   go past a date cutoff you care about)
 */
export async function fetchAllRecords(datasetId, options = {}) {
  const { pageSize = 1000, filters, sort, stopWhen } = options;
  let offset = 0;
  let all = [];
  let total = Infinity;

  while (offset < total) {
    const url = new URL(BASE);
    url.searchParams.set('resource_id', datasetId);
    url.searchParams.set('limit', String(pageSize));
    url.searchParams.set('offset', String(offset));
    if (filters) url.searchParams.set('filters', JSON.stringify(filters));
    if (sort) url.searchParams.set('sort', sort);

    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(
        `data.gov.sg datastore_search failed (${res.status}) for dataset ${datasetId}. ` +
          `Double-check the dataset id from the dataset's page on data.gov.sg.`
      );
    }
    const body = await res.json();
    if (!body.success) {
      throw new Error(`data.gov.sg returned an error: ${JSON.stringify(body)}`);
    }

    const { records, total: reportedTotal } = body.result;
    total = reportedTotal ?? records.length;
    all = all.concat(records);
    offset += records.length;

    if (records.length === 0) break; // safety net against infinite loop
    if (stopWhen && stopWhen(records)) break;
  }

  return all;
}
