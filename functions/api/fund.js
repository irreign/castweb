// Cloudflare Pages Function for /monopoly. Cached at the edge for 1 hour.
//   GET /api/fund?ms=F00000WKP7[&isin=IE00...]  Morningstar SecId (the id in Great Eastern's
//                                               ILP fund centre links, e.g. #/detail?id=F00000WKP7_F223)
//   GET /api/fund?symbol=XXX | ?q=fund+name     Yahoo Finance symbol or name search
// Morningstar gives the NAV series; dividends come from Morningstar when available,
// otherwise from Yahoo (looked up by ISIN, or by ?q= name).

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';
const TTL = 3600;

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': status === 200 ? `public, max-age=${TTL}` : 'no-store',
      'access-control-allow-origin': '*',
    },
  });
}

const MS_BASES = [
  'https://tools.morningstar.co.uk/api/rest.svc/timeseries_%s/t92wz0sj7c',
  'https://lt.morningstar.com/api/rest.svc/timeseries_%s/9vehuxllxs',
];
const MS_UNIVERSES = ['FOALL$$ALL', 'FOSGP$$ALL', 'FOGBR$$ALL'];

// Accepts Morningstar's JSON ({TimeSeries:{Security:[{HistoryDetail:[{EndDate,Value}]}]}})
// or COMPACTJSON ([[ms, value], ...]) and returns [[ms, value], ...] ascending.
export function msSeries(j) {
  if (Array.isArray(j)) {
    return j.filter(r => Array.isArray(r) && r[1] != null).map(r => [+r[0], +r[1]]).sort((a, b) => a[0] - b[0]);
  }
  const sec = j && j.TimeSeries && j.TimeSeries.Security && j.TimeSeries.Security[0];
  if (!sec) return [];
  const rows = sec.HistoryDetail || sec.DividendDetail || sec.History || [];
  return rows.map(r => {
    const d = r.EndDate || r.ExDate || r.Date;
    const v = r.Value != null ? r.Value : r.Amount;
    return [Date.parse(d), +v];
  }).filter(r => !isNaN(r[0]) && !isNaN(r[1])).sort((a, b) => a[0] - b[0]);
}

async function morningstar(kind, secId, startDate) {
  let lastErr;
  for (const base of MS_BASES) {
    for (const uni of MS_UNIVERSES) {
      const url = base.replace('%s', kind) +
        `?currencyId=SGD&idtype=Morningstar&frequency=daily&outputType=COMPACTJSON&startDate=${startDate}` +
        `&id=${encodeURIComponent(secId + ']2]0]' + uni)}`;
      try {
        const res = await fetch(url, { headers: { 'user-agent': UA, accept: 'application/json' } });
        if (!res.ok) { lastErr = new Error(`Morningstar ${res.status}`); continue; }
        const text = await res.text();
        let series = [];
        try { series = msSeries(JSON.parse(text)); } catch { lastErr = new Error('Morningstar returned non-JSON'); }
        if (series.length) return series;
      } catch (e) { lastErr = e; }
    }
  }
  throw lastErr || new Error('Morningstar returned no ' + kind + ' data for ' + secId);
}

async function fromMorningstar(secId, isin, q) {
  const start = new Date(Date.now() - 2 * 365 * 864e5).toISOString().slice(0, 10);
  const history = await morningstar('price', secId, start);
  let dividends = [], divSource = null;
  try {
    dividends = (await morningstar('dividend', secId, start)).map(([date, amount]) => ({ date, amount }));
    if (dividends.length) divSource = 'Morningstar';
  } catch {}
  if (!dividends.length && (isin || q)) {
    try {
      const s = await yahoo(`https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(isin || q)}&quotesCount=15&newsCount=0`);
      const sym = isin ? s.quotes && s.quotes[0] && s.quotes[0].symbol : pickSymbol(s.quotes, q);
      if (sym) {
        dividends = shape(sym, await yahoo(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?range=2y&interval=1d&events=div`)).dividends;
        if (dividends.length) divSource = 'Yahoo Finance (' + sym + ')';
      }
    } catch {}
  }
  dividends.sort((a, b) => b.date - a.date);
  const last = history[history.length - 1];
  return {
    symbol: secId, source: 'Morningstar', divSource, currency: 'SGD',
    price: last[1], priceDate: last[0], history, dividends, fetchedAt: Date.now(),
  };
}

async function yahoo(url) {
  const res = await fetch(url, { headers: { 'user-agent': UA, accept: 'application/json' } });
  if (!res.ok) throw new Error(`Yahoo ${res.status} for ${new URL(url).pathname}`);
  return res.json();
}

// Pick the best mutual-fund match for a free-text name; SGD (.SI) and
// distributing share classes win ties.
export function pickSymbol(quotes, q) {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  let best = null;
  for (const it of quotes || []) {
    if (!it.symbol) continue;
    const name = `${it.longname || ''} ${it.shortname || ''}`.toLowerCase();
    let score = 0;
    for (const w of words) if (name.includes(w)) score += 2;
    if (it.quoteType === 'MUTUALFUND') score += 3;
    if (it.symbol.endsWith('.SI')) score += 2;
    if (/\bdis|inc\b|distrib/.test(name)) score += 1;
    if (!best || score > best.score) best = { symbol: it.symbol, score };
  }
  return best && best.symbol;
}

export function shape(symbol, chart) {
  const r = chart && chart.chart && chart.chart.result && chart.chart.result[0];
  if (!r) throw new Error('No chart data for ' + symbol);
  const m = r.meta || {};
  const ts = r.timestamp || [];
  const close = (r.indicators && r.indicators.quote && r.indicators.quote[0] && r.indicators.quote[0].close) || [];
  const history = [];
  for (let i = 0; i < ts.length; i++) {
    if (close[i] != null) history.push([ts[i] * 1000, +close[i].toFixed(6)]);
  }
  const divs = Object.values((r.events && r.events.dividends) || {})
    .map(d => ({ date: d.date * 1000, amount: +d.amount }))
    .sort((a, b) => b.date - a.date);
  const last = history[history.length - 1];
  return {
    symbol,
    source: 'Yahoo Finance',
    divSource: divs.length ? 'Yahoo Finance' : null,
    name: m.longName || m.shortName || symbol,
    currency: m.currency || null,
    price: m.regularMarketPrice != null ? m.regularMarketPrice : last ? last[1] : null,
    priceDate: m.regularMarketTime ? m.regularMarketTime * 1000 : last ? last[0] : null,
    history,
    dividends: divs,
    fetchedAt: Date.now(),
  };
}

export async function onRequestGet({ request, waitUntil }) {
  const url = new URL(request.url);
  let symbol = (url.searchParams.get('symbol') || '').trim();
  const q = (url.searchParams.get('q') || '').trim();
  const ms = (url.searchParams.get('ms') || '').trim().toUpperCase();
  const isin = (url.searchParams.get('isin') || '').trim().toUpperCase();
  if (ms && !/^[A-Z0-9]{10}$/.test(ms)) return json({ error: 'Bad Morningstar id' }, 400);
  if (!symbol && !q && !ms) return json({ error: 'Pass ?ms=, ?symbol= or ?q=' }, 400);

  const cache = caches.default;
  const key = new Request(url.toString(), { method: 'GET' });
  const hit = await cache.match(key);
  if (hit) return hit;

  try {
    if (ms) {
      const res = json(await fromMorningstar(ms, isin, q));
      waitUntil(cache.put(key, res.clone()));
      return res;
    }
    if (!symbol) {
      const s = await yahoo(`https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=15&newsCount=0`);
      symbol = pickSymbol(s.quotes, q);
      if (!symbol) return json({ error: `No match for "${q}"` }, 404);
    }
    const chart = await yahoo(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=2y&interval=1d&events=div`);
    const res = json(shape(symbol, chart));
    waitUntil(cache.put(key, res.clone()));
    return res;
  } catch (e) {
    return json({ error: String(e.message || e), symbol: symbol || null }, 502);
  }
}
