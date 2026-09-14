// Geocode a Singapore address, postal code, or place name via OneMap's public
// Search API — no API key required for this endpoint.
// Docs: https://www.onemap.gov.sg/apidocs/search
//
// Confidence: high. This endpoint has been stable and public for years.

const ONEMAP_SEARCH_URL = 'https://www.onemap.gov.sg/api/common/elastic/search';

export async function geocode(query) {
  const url = new URL(ONEMAP_SEARCH_URL);
  url.searchParams.set('searchVal', query);
  url.searchParams.set('returnGeom', 'Y');
  url.searchParams.set('getAddrDetails', 'Y');
  url.searchParams.set('pageNum', '1');

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(
      `OneMap search failed (${res.status}) for "${query}". ` +
        `If this keeps failing, check https://www.onemap.gov.sg/apidocs/search for API changes.`
    );
  }
  const data = await res.json();
  if (!data.results || data.results.length === 0) {
    return null;
  }
  const top = data.results[0];
  return {
    query,
    address: top.ADDRESS,
    postalCode: top.POSTAL,
    lat: parseFloat(top.LATITUDE),
    lon: parseFloat(top.LONGITUDE),
  };
}

// CLI usage: node onemap.mjs "8 Toh Tuck Road"
const isMain = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const query = process.argv.slice(2).join(' ');
  if (!query) {
    console.error('Usage: node onemap.mjs "<address, postal code, or place name>"');
    process.exit(1);
  }
  try {
    const result = await geocode(query);
    if (!result) {
      console.error(`No results for "${query}".`);
      process.exit(1);
    }
    console.log(JSON.stringify(result, null, 2));
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}
