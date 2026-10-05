'use strict';

const { wikiLinkSlugs } = require('../render');

function notFound(message = 'Not found.') {
  return Object.assign(new Error(message), { status: 404 });
}

function forbidden(message = 'You do not have permission to do that.') {
  return Object.assign(new Error(message), { status: 403 });
}

// Positive integer from a route param or form field, otherwise null.
function intParam(value) {
  if (typeof value !== 'string' || !/^\d{1,9}$/.test(value)) return null;
  const n = Number(value);
  return n > 0 ? n : null;
}

// Trimmed single string from a form field, capped at `max` characters.
function text(value, max) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

// Page number from ?page=, and the matching SQL offset.
function paging(req, perPage) {
  const page = intParam(req.query.page) || 1;
  return { page, perPage, offset: (page - 1) * perPage };
}

// Returns a wikiExists(slug) callback for markup(), after looking up every
// [[Wiki Link]] in `sources` with one query (D1 allows at most 100 bound values).
async function wikiLinkChecker(db, sources) {
  const slugs = new Set();
  for (const source of sources) for (const slug of wikiLinkSlugs(source)) slugs.add(slug);
  if (!slugs.size) return () => false;
  const list = [...slugs].slice(0, 90);
  const rows = await db.all(
    `SELECT slug FROM wiki_pages WHERE slug IN (${list.map(() => '?').join(', ')})`,
    ...list
  );
  const existing = new Set(rows.map((r) => r.slug));
  return (slug) => existing.has(slug);
}

module.exports = { notFound, forbidden, intParam, text, paging, wikiLinkChecker };
