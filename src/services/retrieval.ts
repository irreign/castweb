import { all, type DB } from '../db';

const STOP = new Set(('a an the and or but if is are was were be been being am do does did done have has had having i you he she it we they me my your our their this that these those there here ' +
  'of to in on at by for with about from as into over than then so too very can could would should will shall may might must not no yes what which who whom whose when where why how ' +
  'please hi hello hey thanks thank ok okay just also any some more most other such only own same s t get got want need like know tell').split(' '));

const SYNONYMS: Record<string, string> = {
  cost: 'fee', price: 'fee', pricing: 'fee', charge: 'fee', rate: 'fee', payment: 'fee', expensive: 'fee',
  maid: 'helper', fdw: 'helper', domestic: 'helper', worker: 'helper', helpers: 'helper',
  appointment: 'consultation', meeting: 'consultation', visit: 'consultation', meet: 'consultation', consult: 'consultation',
  open: 'hour', opening: 'hour', hours: 'hour', schedule: 'hour', timing: 'hour',
  contact: 'contact', phone: 'contact', call: 'contact', email: 'contact', address: 'location', where: 'location', office: 'location',
};

export function stem(w: string): string {
  let t = w;
  if (t.length > 4 && t.endsWith('ies')) t = t.slice(0, -3) + 'y';
  else if (t.length > 3 && t.endsWith('s') && !/(ss|us|is)$/.test(t)) t = t.slice(0, -1);
  if (t.length > 5 && t.endsWith('ing')) t = t.slice(0, -3);
  else if (t.length > 4 && t.endsWith('ed')) t = t.slice(0, -2);
  return SYNONYMS[t] ?? t;
}

export function terms(text: string): string[] {
  return (text.toLowerCase().match(/[a-z0-9$%]+/g) ?? []).filter((w) => !STOP.has(w) && w.length > 1).map(stem).filter((w) => !STOP.has(w));
}

export function chunkText(text: string, maxLen = 700): string[] {
  const paras = text.replace(/\r/g, '').split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const chunks: string[] = []; let cur = '';
  const push = () => { if (cur.trim()) chunks.push(cur.trim()); cur = ''; };
  for (const p of paras) {
    if (p.length > maxLen) {
      push();
      const sentences = p.match(/[^.!?\n]+[.!?]*\s*/g) ?? [p];
      for (const s of sentences) { if ((cur + s).length > maxLen) push(); cur += s; }
      push();
    } else {
      if ((cur + '\n\n' + p).length > maxLen) push();
      cur += (cur ? '\n\n' : '') + p;
    }
  }
  push();
  return chunks;
}

export interface Hit { chunkId: string; sourceId: string; title: string; type: string; text: string; score: number; coverage: number }

const MIN_COVERAGE = 0.5;

/**
 * Tenant-scoped retrieval (BM25 over the tenant's own chunks). The `tenant_id = ?` predicate is the isolation boundary.
 * Returns [] when nothing is a reliable match, which callers must treat as "I don't know".
 */
export async function retrieve(db: DB, tenantId: string, query: string, opts: { includeUnpublished?: boolean; k?: number } = {}): Promise<Hit[]> {
  const q = [...new Set(terms(query))];
  if (!q.length) return [];
  const rows = await all<{ id: string; source_id: string; text: string; terms: string; title: string; type: string }>(db,
    `SELECT k.id, k.source_id, k.text, k.terms, s.title, s.type
       FROM knowledge_chunks k JOIN knowledge_sources s ON s.id = k.source_id AND s.tenant_id = k.tenant_id AND s.version = k.source_version
      WHERE k.tenant_id = ? AND s.deleted_at IS NULL AND s.status = 'ready' AND (s.published = 1 OR ? = 1)`, tenantId, opts.includeUnpublished ? 1 : 0);
  if (!rows.length) return [];
  const docs = rows.map((r) => ({ r, t: r.terms.split(' ').filter(Boolean) }));
  const avg = docs.reduce((a, d) => a + d.t.length, 0) / docs.length || 1;
  const df = new Map<string, number>();
  for (const term of q) df.set(term, docs.filter((d) => d.t.includes(term)).length);
  const hits: Hit[] = [];
  for (const { r, t } of docs) {
    let score = 0, matched = 0;
    for (const term of q) {
      const tf = t.filter((x) => x === term).length;
      if (!tf) continue;
      matched++;
      const idf = Math.log(1 + (docs.length - df.get(term)! + 0.5) / (df.get(term)! + 0.5));
      score += idf * ((tf * 2.2) / (tf + 1.2 * (0.25 + 0.75 * (t.length / avg))));
    }
    const coverage = matched / q.length;
    if (matched && coverage >= MIN_COVERAGE) hits.push({ chunkId: r.id, sourceId: r.source_id, title: r.title, type: r.type, text: r.text, score, coverage });
  }
  return hits.sort((a, b) => b.coverage - a.coverage || b.score - a.score).slice(0, opts.k ?? 3);
}
