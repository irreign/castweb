import { z } from 'zod';
import type { Env } from '../env';
import { all, first, newId, nowIso, run, type DB } from '../db';
import { badRequest, notFound, unprocessable } from '../http';
import { audit, recordUsage, type Actor } from './audit';
import { chunkText, terms } from './retrieval';

export const SOURCE_TYPES = ['faq', 'service', 'fees', 'policy', 'procedure', 'hours', 'document', 'website', 'other'] as const;
export const MAX_UPLOAD_BYTES = 1_000_000;
export const MAX_TEXT_CHARS = 200_000;
const ALLOWED_EXT = ['txt', 'md', 'csv', 'html', 'htm'];

export const textSourceSchema = z.object({
  type: z.enum(SOURCE_TYPES).default('other'),
  title: z.string().trim().min(2).max(160),
  content: z.string().trim().min(10).max(MAX_TEXT_CHARS),
});
export const faqSchema = z.object({
  question: z.string().trim().min(5).max(300),
  answer: z.string().trim().min(5).max(3000),
});
export const urlSchema = z.object({ url: z.string().url().max(500), title: z.string().trim().min(2).max(160).optional() });

async function writeChunks(db: DB, tenantId: string, sourceId: string, version: number, texts: string[]) {
  const t = nowIso();
  await db.batch([
    db.prepare('DELETE FROM knowledge_chunks WHERE tenant_id = ? AND source_id = ?').bind(tenantId, sourceId),
    ...texts.map((x, i) => db.prepare('INSERT INTO knowledge_chunks (id, tenant_id, source_id, source_version, idx, text, terms, created_at) VALUES (?,?,?,?,?,?,?,?)')
      .bind(newId('chk'), tenantId, sourceId, version, i, x, terms(x).join(' '), t)),
  ]);
}

/** Processing is only reported as ready after chunks are persisted; any failure leaves the source in `failed` with a human-readable error. */
async function process(db: DB, tenantId: string, sourceId: string, version: number, texts: string[], recordFail = true) {
  try {
    if (!texts.length) throw new Error('No readable text was found in this source');
    await writeChunks(db, tenantId, sourceId, version, texts);
    await run(db, `UPDATE knowledge_sources SET status = 'ready', error = NULL, updated_at = ? WHERE id = ? AND tenant_id = ?`, nowIso(), sourceId, tenantId);
    await recordUsage(db, tenantId, 'doc_processed', 1);
  } catch (e) {
    if (!recordFail) throw e;
    await run(db, `UPDATE knowledge_sources SET status = 'failed', error = ?, updated_at = ? WHERE id = ? AND tenant_id = ?`, String((e as Error).message).slice(0, 300), nowIso(), sourceId, tenantId);
  }
}

async function insertSource(db: DB, tenantId: string, actor: Actor, s: { type: string; title: string; content: string; question?: string; originalName?: string; mime?: string; size?: number; url?: string; r2Key?: string }) {
  const id = newId('src'); const t = nowIso();
  await run(db, `INSERT INTO knowledge_sources (id, tenant_id, title, type, version, status, published, content_text, question, original_name, mime_type, byte_size, source_url, r2_key, created_by, created_at, updated_at)
                 VALUES (?,?,?,?,1,'processing',0,?,?,?,?,?,?,?,?,?,?)`,
    id, tenantId, s.title, s.type, s.content, s.question ?? null, s.originalName ?? null, s.mime ?? null, s.size ?? null, s.url ?? null, s.r2Key ?? null, actor.id ?? null, t, t);
  await audit(db, tenantId, actor, 'knowledge.created', 'knowledge_source', id, { type: s.type });
  return id;
}

const faqText = (q: string, a: string) => `Q: ${q}\nA: ${a}`;

export async function createFaq(db: DB, tenantId: string, actor: Actor, input: z.infer<typeof faqSchema>) {
  const id = await insertSource(db, tenantId, actor, { type: 'faq', title: input.question, question: input.question, content: input.answer });
  await process(db, tenantId, id, 1, [faqText(input.question, input.answer)]);
  return getSource(db, tenantId, id);
}

export async function createTextSource(db: DB, tenantId: string, actor: Actor, input: z.infer<typeof textSourceSchema>) {
  const id = await insertSource(db, tenantId, actor, input);
  await process(db, tenantId, id, 1, chunkText(input.content).map((c) => `${input.title}\n${c}`));
  return getSource(db, tenantId, id);
}

export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style|noscript|svg|nav|footer|header)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<\/(p|div|section|article|li|h[1-6]|tr|br)>|<br\s*\/?>/gi, '\n\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, ' ').replace(/\n\s*\n\s*/g, '\n\n').trim();
}

export function extractUploadText(name: string, bytes: Uint8Array): string {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  if (!ALLOWED_EXT.includes(ext)) {
    throw unprocessable(`.${ext || 'unknown'} files are not supported yet. Upload a .txt, .md, .csv or .html file, or paste the text.`);
  }
  if (bytes.byteLength > MAX_UPLOAD_BYTES) throw unprocessable('That file is larger than 1 MB. Please split it or paste the key sections.');
  if (bytes.includes(0)) throw unprocessable('That file looks like a binary file, not text.');
  const text = new TextDecoder().decode(bytes);
  return (ext === 'html' || ext === 'htm' ? htmlToText(text) : text).trim().slice(0, MAX_TEXT_CHARS);
}

export async function createUploadSource(env: Env, tenantId: string, actor: Actor, file: { name: string; type: string; bytes: Uint8Array }, meta: { title?: string; type: (typeof SOURCE_TYPES)[number] }) {
  const content = extractUploadText(file.name, file.bytes); // validates type + size before anything is stored
  const title = meta.title?.trim() || file.name.replace(/\.[^.]+$/, '');
  const id = await insertSource(env.DB, tenantId, actor, { type: meta.type, title, content, originalName: file.name.slice(0, 200), mime: file.type.slice(0, 100), size: file.bytes.byteLength });
  if (env.FILES) {
    const key = `${tenantId}/${id}/v1/${file.name.replace(/[^\w.-]/g, '_')}`;
    try { await env.FILES.put(key, file.bytes, { httpMetadata: { contentType: file.type } }); await run(env.DB, 'UPDATE knowledge_sources SET r2_key = ? WHERE id = ?', key, id); } catch { /* original-file archive is best effort; extracted text is what the assistant uses */ }
  }
  await process(env.DB, tenantId, id, 1, content.length ? chunkText(content).map((c) => `${title}\n${c}`) : []);
  return getSource(env.DB, tenantId, id);
}

/** Server-side fetch of a single public web page. Guarded against local/private targets. */
export function assertPublicHttpsUrl(raw: string): URL {
  let u: URL;
  try { u = new URL(raw); } catch { throw badRequest('That is not a valid URL'); }
  const h = u.hostname.toLowerCase();
  if (u.protocol !== 'https:') throw badRequest('Only https:// pages can be imported');
  if (u.username || u.password) throw badRequest('URLs with credentials are not allowed');
  if (u.port && u.port !== '443') throw badRequest('Custom ports are not allowed');
  if (h === 'localhost' || h.endsWith('.local') || h.endsWith('.internal') || !h.includes('.') || /^\d+\.\d+\.\d+\.\d+$/.test(h) || h.includes(':') || h.startsWith('[')) throw badRequest('That address cannot be imported');
  return u;
}

export async function createWebsiteSource(env: Env, tenantId: string, actor: Actor, input: z.infer<typeof urlSchema>, fetcher: typeof fetch = fetch) {
  const url = assertPublicHttpsUrl(input.url);
  const id = await insertSource(env.DB, tenantId, actor, { type: 'website', title: input.title ?? url.hostname + url.pathname, content: '', url: url.toString() });
  await fetchWebsiteInto(env.DB, tenantId, id, 1, url, fetcher);
  return getSource(env.DB, tenantId, id);
}

async function fetchWebsiteInto(db: DB, tenantId: string, id: string, version: number, url: URL, fetcher: typeof fetch) {
  try {
    const res = await fetcher(url.toString(), { redirect: 'error', headers: { 'user-agent': 'NexusLogicBot/1.0 (+knowledge import)' }, signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(`The page returned HTTP ${res.status}`);
    const ct = res.headers.get('content-type') ?? '';
    if (!/text\/(html|plain)/.test(ct)) throw new Error('That URL is not an HTML or text page');
    const buf = new Uint8Array(await res.arrayBuffer());
    if (buf.byteLength > MAX_UPLOAD_BYTES) throw new Error('The page is larger than 1 MB');
    const raw = new TextDecoder().decode(buf);
    const text = (ct.includes('html') ? htmlToText(raw) : raw).slice(0, MAX_TEXT_CHARS);
    const title = (await first<{ title: string }>(db, 'SELECT title FROM knowledge_sources WHERE id = ? AND tenant_id = ?', id, tenantId))?.title ?? '';
    await run(db, 'UPDATE knowledge_sources SET content_text = ? WHERE id = ? AND tenant_id = ?', text, id, tenantId);
    await process(db, tenantId, id, version, text.length ? chunkText(text).map((c) => `${title}\n${c}`) : []);
  } catch (e) {
    await run(db, `UPDATE knowledge_sources SET status = 'failed', error = ?, updated_at = ? WHERE id = ? AND tenant_id = ?`, `Import failed: ${String((e as Error).message).slice(0, 200)}`, nowIso(), id, tenantId);
  }
}

export async function listSources(db: DB, tenantId: string) {
  return all(db, `SELECT s.id, s.title, s.type, s.version, s.status, s.published, s.error, s.original_name, s.byte_size, s.source_url, s.updated_at, s.created_at,
                         (SELECT COUNT(*) FROM knowledge_chunks k WHERE k.source_id = s.id AND k.source_version = s.version) AS chunk_count
                    FROM knowledge_sources s WHERE s.tenant_id = ? AND s.deleted_at IS NULL ORDER BY s.updated_at DESC`, tenantId);
}

export async function getSource(db: DB, tenantId: string, id: string) {
  const s = await first<Record<string, any>>(db, `SELECT id, title, type, version, status, published, error, content_text, question, original_name, byte_size, source_url, updated_at, created_at FROM knowledge_sources WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL`, id, tenantId);
  if (!s) throw notFound('Knowledge source not found');
  return s;
}

export const sourcePatchSchema = z.object({
  title: z.string().trim().min(2).max(160).optional(),
  type: z.enum(SOURCE_TYPES).optional(),
  content: z.string().trim().min(5).max(MAX_TEXT_CHARS).optional(),
  question: z.string().trim().min(5).max(300).optional(),
  published: z.boolean().optional(),
}).strict();

/** Editing content bumps the version, re-processes, and un-publishes until an admin re-publishes (so edits are reviewed before going live). */
export async function updateSource(db: DB, tenantId: string, actor: Actor, id: string, patch: z.infer<typeof sourcePatchSchema>) {
  const s = await getSource(db, tenantId, id);
  const contentChanged = (patch.content !== undefined && patch.content !== s.content_text) || (patch.question !== undefined && patch.question !== s.question) || (patch.title !== undefined && patch.title !== s.title);
  if (patch.published === true && s.status !== 'ready' && !contentChanged) throw unprocessable('This source is not ready, so it cannot be published. Fix the processing error first.');
  const title = patch.title ?? s.title, content = patch.content ?? s.content_text ?? '', question = patch.question ?? s.question;
  if (contentChanged) {
    const version = s.version + 1;
    await run(db, `UPDATE knowledge_sources SET title = ?, type = COALESCE(?, type), content_text = ?, question = ?, version = ?, status = 'processing', published = 0, error = NULL, updated_at = ? WHERE id = ? AND tenant_id = ?`,
      title, patch.type ?? null, content, question ?? null, version, nowIso(), id, tenantId);
    const texts = s.type === 'faq' ? [faqText(question ?? title, content)] : chunkText(content).map((c) => `${title}\n${c}`);
    await process(db, tenantId, id, version, texts);
  } else if (patch.type) {
    await run(db, 'UPDATE knowledge_sources SET type = ?, updated_at = ? WHERE id = ? AND tenant_id = ?', patch.type, nowIso(), id, tenantId);
  }
  if (patch.published !== undefined && !contentChanged) {
    await run(db, 'UPDATE knowledge_sources SET published = ?, updated_at = ? WHERE id = ? AND tenant_id = ?', patch.published ? 1 : 0, nowIso(), id, tenantId);
  }
  await audit(db, tenantId, actor, patch.published !== undefined && !contentChanged ? (patch.published ? 'knowledge.published' : 'knowledge.unpublished') : 'knowledge.updated', 'knowledge_source', id, { version: contentChanged ? s.version + 1 : s.version });
  return getSource(db, tenantId, id);
}

export async function reprocessSource(env: Env, tenantId: string, actor: Actor, id: string, fetcher: typeof fetch = fetch) {
  const s = await getSource(env.DB, tenantId, id);
  if (s.type === 'website' && s.source_url) await fetchWebsiteInto(env.DB, tenantId, id, s.version, assertPublicHttpsUrl(s.source_url), fetcher);
  else await process(env.DB, tenantId, id, s.version, s.type === 'faq' ? [faqText(s.question ?? s.title, s.content_text ?? '')] : chunkText(s.content_text ?? '').map((c: string) => `${s.title}\n${c}`));
  await audit(env.DB, tenantId, actor, 'knowledge.reprocessed', 'knowledge_source', id);
  return getSource(env.DB, tenantId, id);
}

export async function deleteSource(env: Env, tenantId: string, actor: Actor, id: string) {
  const s = await first<{ r2_key: string | null }>(env.DB, 'SELECT r2_key FROM knowledge_sources WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL', id, tenantId);
  if (!s) throw notFound('Knowledge source not found');
  await env.DB.batch([
    env.DB.prepare('DELETE FROM knowledge_chunks WHERE tenant_id = ? AND source_id = ?').bind(tenantId, id),
    env.DB.prepare(`UPDATE knowledge_sources SET deleted_at = ?, published = 0, content_text = NULL, question = NULL WHERE id = ? AND tenant_id = ?`).bind(nowIso(), id, tenantId),
  ]);
  if (s.r2_key && env.FILES) { try { await env.FILES.delete(s.r2_key); } catch { /* retention job retries orphans */ } }
  await audit(env.DB, tenantId, actor, 'knowledge.deleted', 'knowledge_source', id);
}
