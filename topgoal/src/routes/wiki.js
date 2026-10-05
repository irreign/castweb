'use strict';

const express = require('express');
const { transaction } = require('../db');
const { requireUser, requireRole, hasRole, rateLimiter } = require('../auth');
const { html, csrfField, userLink, dateTime, markup, slugify } = require('../render');
const { notFound, forbidden, intParam, text } = require('./util');

const MAX_BODY = 100000;

function titleFromSlug(slug) {
  return slug
    .split('-')
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(' ');
}

module.exports = ({ db }) => {
  const router = express.Router();
  const editLimiter = rateLimiter({ windowMs: 10 * 60 * 1000, max: 30 });

  const getPage = db.prepare('SELECT * FROM wiki_pages WHERE slug = ?');
  const latestRevision = db.prepare('SELECT id FROM wiki_revisions WHERE page_id = ? ORDER BY id DESC LIMIT 1');
  const wikiExists = (slug) => Boolean(getPage.get(slug));

  const loadPage = (slug) => {
    const page = getPage.get(String(slug));
    if (!page) throw notFound('Wiki page not found.');
    return page;
  };

  const canEdit = (user, page) => Boolean(user) && (!page || !page.locked || hasRole(user, 'mod'));

  // ─── Index & search ──────────────────────────────────────────────────────

  router.get('/wiki', (req, res) => {
    const q = text(req.query.q, 80);
    const pages = q
      ? db
          .prepare(
            `SELECT slug, title, updated_at FROM wiki_pages
              WHERE title LIKE ? ESCAPE '\\' OR body LIKE ? ESCAPE '\\'
              ORDER BY (title LIKE ? ESCAPE '\\') DESC, updated_at DESC LIMIT 100`
          )
          .all(...Array(3).fill(`%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`))
      : db.prepare('SELECT slug, title, updated_at FROM wiki_pages ORDER BY title COLLATE NOCASE').all();
    const recent = db
      .prepare(
        `SELECT r.id, r.summary, r.created_at, p.slug, p.title, u.username, u.role, u.verified
           FROM wiki_revisions r JOIN wiki_pages p ON p.id = r.page_id JOIN users u ON u.id = r.user_id
          ORDER BY r.id DESC LIMIT 10`
      )
      .all();

    res.page({
      title: 'Wiki',
      active: '/wiki',
      body: html`
        <div class="page-head"><h1>TopGoal Wiki</h1></div>
        <p class="lead">Guides, player info and game knowledge, written by the community. Anyone with an account can edit.</p>
        <div class="grid-2 wiki-index">
          <section class="panel">
            <form method="get" action="/wiki" class="search-row" role="search">
              <input type="search" name="q" value="${q}" placeholder="Search the wiki" aria-label="Search the wiki">
              <button class="btn btn-small">Search</button>
            </form>
            <h2>${q ? `Results for “${q}”` : 'All pages'} <span class="muted">(${pages.length})</span></h2>
            ${pages.length
              ? html`<ul class="list columns">${pages.map(
                  (p) => html`<li><a class="list-title" href="/wiki/${p.slug}">${p.title}</a></li>`
                )}</ul>`
              : html`<p class="muted">No pages found.</p>`}
          </section>
          <aside class="stack-gap">
            <section class="panel">
              <h2>Create a page</h2>
              ${req.user
                ? html`<form method="post" action="/wiki/new" class="stack">
                    ${csrfField(res)}
                    <label>Page title <input name="title" required maxlength="80" value="${q && !wikiExists(slugify(q)) ? q : ''}" placeholder="e.g. Best Formations"></label>
                    <button class="btn btn-small">Start writing</button>
                  </form>`
                : html`<p class="muted"><a href="/login?next=/wiki">Log in</a> to create and edit pages.</p>`}
            </section>
            <section class="panel">
              <h2>Recent changes</h2>
              <ul class="list compact">${recent.map(
                (r) => html`<li><a href="/wiki/${r.slug}">${r.title}</a><span class="meta">${userLink(r)} · ${dateTime(r.created_at)}${r.summary ? html` · ${r.summary}` : ''}</span></li>`
              )}</ul>
            </section>
          </aside>
        </div>`,
    });
  });

  router.post('/wiki/new', requireUser, (req, res) => {
    const title = text(req.body.title, 80);
    const slug = slugify(title);
    if (!slug) {
      res.flash('error', 'Give the page a title with at least one letter or number.');
      return res.redirect('/wiki');
    }
    res.redirect(getPage.get(slug) ? `/wiki/${slug}` : `/wiki/${slug}/edit?title=${encodeURIComponent(title)}`);
  });

  // ─── View ────────────────────────────────────────────────────────────────

  router.get('/wiki/:slug', (req, res) => {
    const slug = String(req.params.slug);
    const page = getPage.get(slug);
    if (!page) {
      res.status(404);
      return res.page({
        title: titleFromSlug(slug) || 'Missing page',
        active: '/wiki',
        body: html`
          <p class="crumbs"><a href="/wiki">Wiki</a> ›</p>
          <section class="empty">
            <h1>${titleFromSlug(slug) || 'Missing page'}</h1>
            <p>This page doesn't exist yet.</p>
            ${req.user && slugify(slug) === slug
              ? html`<a class="btn" href="/wiki/${slug}/edit">Create this page</a>`
              : html`<p><a href="/login?next=/wiki/${encodeURIComponent(slug)}">Log in</a> to create it.</p>`}
          </section>`,
      });
    }
    const last = db
      .prepare(
        `SELECT r.created_at, u.username, u.role, u.verified FROM wiki_revisions r JOIN users u ON u.id = r.user_id
          WHERE r.page_id = ? ORDER BY r.id DESC LIMIT 1`
      )
      .get(page.id);
    const isMod = hasRole(req.user, 'mod');

    res.page({
      title: page.title,
      active: '/wiki',
      body: html`
        <p class="crumbs"><a href="/wiki">Wiki</a> ›</p>
        <div class="page-head">
          <h1>${page.title}${page.locked ? html` <span class="pill pill-grey">Locked</span>` : ''}</h1>
          <div class="actions">
            ${canEdit(req.user, page) ? html`<a class="btn btn-small" href="/wiki/${page.slug}/edit">Edit</a>` : ''}
            <a class="btn btn-ghost btn-small" href="/wiki/${page.slug}/history">History</a>
            ${isMod
              ? html`<form method="post" action="/wiki/${page.slug}/lock" class="inline">${csrfField(res)}<button class="btn btn-ghost btn-small">${page.locked ? 'Unlock' : 'Lock'}</button></form>`
              : ''}
          </div>
        </div>
        <article class="prose wiki-body">${markup(page.body, { wikiExists })}</article>
        <p class="muted small page-foot">Last edited ${dateTime(page.updated_at)}${last ? html` by ${userLink(last)}` : ''}.</p>`,
    });
  });

  // ─── Edit ────────────────────────────────────────────────────────────────

  const editPage = (req, res, { slug, page, title, body, summary = '', baseRevision, error = '' }) =>
    res.page({
      title: page ? `Editing ${page.title}` : `Creating ${title}`,
      active: '/wiki',
      body: html`
        <p class="crumbs"><a href="/wiki">Wiki</a> › ${page ? html`<a href="/wiki/${slug}">${page.title}</a> ›` : ''}</p>
        <h1>${page ? `Editing ${page.title}` : 'New wiki page'}</h1>
        ${error ? html`<p class="form-error" role="alert">${error}</p>` : ''}
        <form method="post" action="/wiki/${slug}/edit" class="stack">
          ${csrfField(res)}
          <input type="hidden" name="base_revision" value="${baseRevision || ''}">
          <label>Title <input name="title" value="${title}" required maxlength="80"></label>
          <label>Content <textarea name="body" rows="22" required maxlength="${MAX_BODY}" class="mono">${body}</textarea></label>
          <p class="muted small"># Heading, ## Subheading, **bold**, *italic*, - list, 1. numbered, &gt; quote, \`code\`, [link text](https://…), [[Other Page]].</p>
          <label>Edit summary <input name="summary" value="${summary}" maxlength="140" placeholder="What did you change?"></label>
          <div class="row-actions">
            <button class="btn">Save page</button>
            <a href="${page ? `/wiki/${slug}` : '/wiki'}" class="btn btn-ghost">Cancel</a>
          </div>
        </form>`,
    });

  router.get('/wiki/:slug/edit', requireUser, (req, res) => {
    const slug = String(req.params.slug);
    if (slugify(slug) !== slug) throw notFound('Wiki page not found.');
    const page = getPage.get(slug);
    if (!canEdit(req.user, page)) throw forbidden('This page is locked. Only moderators can edit it.');
    editPage(req, res, {
      slug,
      page,
      title: page ? page.title : text(req.query.title, 80) || titleFromSlug(slug),
      body: page ? page.body : '',
      baseRevision: page ? latestRevision.get(page.id)?.id : '',
    });
  });

  router.post('/wiki/:slug/edit', requireUser, (req, res) => {
    const slug = String(req.params.slug);
    if (slugify(slug) !== slug) throw notFound('Wiki page not found.');
    const page = getPage.get(slug);
    if (!canEdit(req.user, page)) throw forbidden('This page is locked. Only moderators can edit it.');

    const title = text(req.body.title, 80);
    const body = typeof req.body.body === 'string' ? req.body.body.slice(0, MAX_BODY) : '';
    const summary = text(req.body.summary, 140);
    const base = intParam(req.body.base_revision);
    const form = { slug, page, title, body, summary, baseRevision: base };

    if (!title || !body.trim()) {
      res.status(400);
      return editPage(req, res, { ...form, error: 'Title and content are both required.' });
    }
    if (page) {
      const latest = latestRevision.get(page.id)?.id;
      if (latest && base !== latest) {
        res.status(409);
        return editPage(req, res, {
          ...form,
          baseRevision: latest,
          error: 'Someone else saved this page while you were editing. Open the page in a new tab, merge your changes into its latest version, then save again.',
        });
      }
      if (page.title === title && page.body === body) {
        return res.redirect(`/wiki/${slug}`);
      }
    }
    if (!hasRole(req.user, 'mod') && editLimiter.hit(`wiki:${req.user.id}`)) {
      throw Object.assign(new Error('You are editing too fast. Wait a few minutes and try again.'), { status: 429 });
    }

    transaction(db, () => {
      const now = Date.now();
      let pageId = page && page.id;
      if (page) {
        db.prepare('UPDATE wiki_pages SET title = ?, body = ?, updated_at = ? WHERE id = ?').run(title, body, now, page.id);
      } else {
        pageId = db
          .prepare('INSERT INTO wiki_pages (slug, title, body, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
          .run(slug, title, body, now, now).lastInsertRowid;
      }
      db.prepare(
        'INSERT INTO wiki_revisions (page_id, user_id, title, body, summary, created_at) VALUES (?, ?, ?, ?, ?, ?)'
      ).run(pageId, req.user.id, title, body, summary || (page ? '' : 'Created page'), now);
    });
    res.flash('success', page ? 'Page saved.' : 'Page created. Thanks for contributing!');
    res.redirect(`/wiki/${slug}`);
  });

  // ─── History ─────────────────────────────────────────────────────────────

  router.get('/wiki/:slug/history', (req, res) => {
    const page = loadPage(req.params.slug);
    const revisions = db
      .prepare(
        `SELECT r.id, r.summary, r.created_at, length(r.body) AS size, u.username, u.role, u.verified
           FROM wiki_revisions r JOIN users u ON u.id = r.user_id WHERE r.page_id = ? ORDER BY r.id DESC LIMIT 200`
      )
      .all(page.id);
    res.page({
      title: `History of ${page.title}`,
      active: '/wiki',
      body: html`
        <p class="crumbs"><a href="/wiki">Wiki</a> › <a href="/wiki/${page.slug}">${page.title}</a> ›</p>
        <h1>History</h1>
        <div class="table-wrap"><table>
          <thead><tr><th>When</th><th>Editor</th><th>Summary</th><th class="num">Size</th><th></th></tr></thead>
          <tbody>${revisions.map(
            (r, i) => html`<tr>
              <td>${dateTime(r.created_at)}</td>
              <td>${userLink(r)}</td>
              <td>${r.summary || html`<span class="muted">–</span>`}${i === 0 ? html` <span class="pill">Current</span>` : ''}</td>
              <td class="num">${r.size}</td>
              <td><a href="/wiki/${page.slug}/rev/${r.id}">View</a></td>
            </tr>`
          )}</tbody>
        </table></div>`,
    });
  });

  router.get('/wiki/:slug/rev/:id', (req, res) => {
    const page = loadPage(req.params.slug);
    const rev = db
      .prepare(
        `SELECT r.*, u.username, u.role, u.verified FROM wiki_revisions r JOIN users u ON u.id = r.user_id
          WHERE r.id = ? AND r.page_id = ?`
      )
      .get(intParam(req.params.id) || 0, page.id);
    if (!rev) throw notFound('Revision not found.');
    res.page({
      title: `${page.title} (old version)`,
      active: '/wiki',
      body: html`
        <p class="crumbs"><a href="/wiki">Wiki</a> › <a href="/wiki/${page.slug}">${page.title}</a> › <a href="/wiki/${page.slug}/history">History</a> ›</p>
        <div class="flash flash-info">You are viewing the version saved by ${userLink(rev)} ${dateTime(rev.created_at)}.
          ${hasRole(req.user, 'mod')
            ? html`<form method="post" action="/wiki/${page.slug}/revert/${rev.id}" class="inline" data-confirm="Restore this version?">${csrfField(res)}<button class="btn btn-small">Restore this version</button></form>`
            : ''}
        </div>
        <h1>${rev.title}</h1>
        <article class="prose wiki-body">${markup(rev.body, { wikiExists })}</article>`,
    });
  });

  router.post('/wiki/:slug/revert/:id', requireRole('mod'), (req, res) => {
    const page = loadPage(req.params.slug);
    const rev = db
      .prepare('SELECT * FROM wiki_revisions WHERE id = ? AND page_id = ?')
      .get(intParam(req.params.id) || 0, page.id);
    if (!rev) throw notFound('Revision not found.');
    transaction(db, () => {
      const now = Date.now();
      db.prepare('UPDATE wiki_pages SET title = ?, body = ?, updated_at = ? WHERE id = ?').run(rev.title, rev.body, now, page.id);
      db.prepare(
        'INSERT INTO wiki_revisions (page_id, user_id, title, body, summary, created_at) VALUES (?, ?, ?, ?, ?, ?)'
      ).run(page.id, req.user.id, rev.title, rev.body, `Restored revision #${rev.id}`, now);
    });
    res.flash('success', 'Version restored.');
    res.redirect(`/wiki/${page.slug}`);
  });

  router.post('/wiki/:slug/lock', requireRole('mod'), (req, res) => {
    const page = loadPage(req.params.slug);
    db.prepare('UPDATE wiki_pages SET locked = ? WHERE id = ?').run(page.locked ? 0 : 1, page.id);
    res.flash('success', page.locked ? 'Page unlocked.' : 'Page locked. Only moderators can edit it now.');
    res.redirect(`/wiki/${page.slug}`);
  });

  return router;
};
