'use strict';

const express = require('express');
const { requireUser, requireRole, hasRole, rateLimiter } = require('../auth');
const { html, th, csrfField, userLink, dateTime, markup, slugify } = require('../render');
const { t } = require('../i18n');
const { notFound, forbidden, intParam, text, wikiLinkChecker } = require('./util');

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

  const getPage = (slug) => db.get('SELECT * FROM wiki_pages WHERE slug = ?', String(slug));
  const latestRevisionId = async (pageId) =>
    (await db.get('SELECT MAX(id) AS id FROM wiki_revisions WHERE page_id = ?', pageId))?.id ?? null;

  const loadPage = async (slug) => {
    const page = await getPage(slug);
    if (!page) throw notFound(t('wiki.notFound'));
    return page;
  };

  const canEdit = (user, page) => Boolean(user) && (!page || !page.locked || hasRole(user, 'mod'));

  // ─── Index & search ──────────────────────────────────────────────────────

  router.get('/wiki', async (req, res) => {
    const q = text(req.query.q, 80);
    const pages = q
      ? await db.all(`SELECT slug, title, updated_at FROM wiki_pages
              WHERE title LIKE ? ESCAPE '\\' OR body LIKE ? ESCAPE '\\'
              ORDER BY (title LIKE ? ESCAPE '\\') DESC, updated_at DESC LIMIT 100`, ...Array(3).fill(`%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`))
      : await db.all('SELECT slug, title, updated_at FROM wiki_pages ORDER BY title COLLATE NOCASE');
    const recent = await db.all(`SELECT r.id, r.summary, r.created_at, p.slug, p.title, u.username, u.role, u.verified
           FROM wiki_revisions r JOIN wiki_pages p ON p.id = r.page_id JOIN users u ON u.id = r.user_id
          ORDER BY r.id DESC LIMIT 10`);

    res.page({
      title: t('nav.wiki'),
      active: '/wiki',
      body: html`
        <div class="page-head"><h1>${t('wiki.title')}</h1></div>
        <p class="lead">${t('wiki.lead')}</p>
        <div class="grid-2 wiki-index">
          <section class="panel">
            <form method="get" action="/wiki" class="search-row" role="search">
              <input type="search" name="q" value="${q}" placeholder="${t('wiki.search')}" aria-label="${t('wiki.search')}">
              <button class="btn btn-small">${t('common.search')}</button>
            </form>
            <h2>${q ? t('wiki.resultsFor', { q }) : t('wiki.allPages')} <span class="muted">(${pages.length})</span></h2>
            ${pages.length
              ? html`<ul class="list columns">${pages.map(
                  (p) => html`<li><a class="list-title" href="/wiki/${p.slug}">${p.title}</a></li>`
                )}</ul>`
              : html`<p class="muted">${t('wiki.noPages')}</p>`}
          </section>
          <aside class="stack-gap">
            <section class="panel">
              <h2>${t('wiki.create')}</h2>
              ${req.user
                ? html`<form method="post" action="/wiki/new" class="stack">
                    ${csrfField(res)}
                    <label>${t('wiki.pageTitle')} <input name="title" required maxlength="80" value="${q && !(await getPage(slugify(q))) ? q : ''}" placeholder="${t('wiki.pageTitleHint')}"></label>
                    <button class="btn btn-small">${t('wiki.startWriting')}</button>
                  </form>`
                : html`<p class="muted">${th('wiki.loginToEdit', { link: html`<a href="/login?next=/wiki">${t('nav.login')}</a>` })}</p>`}
            </section>
            <section class="panel">
              <h2>${t('wiki.recentChanges')}</h2>
              <ul class="list compact">${recent.map(
                (r) => html`<li><a href="/wiki/${r.slug}">${r.title}</a><span class="meta">${userLink(r)} · ${dateTime(r.created_at)}${r.summary ? html` · ${r.summary}` : ''}</span></li>`
              )}</ul>
            </section>
          </aside>
        </div>`,
    });
  });

  router.post('/wiki/new', requireUser, async (req, res) => {
    const title = text(req.body.title, 80);
    const slug = slugify(title);
    if (!slug) {
      res.flash('error', t('wiki.badTitle'));
      return res.redirect('/wiki');
    }
    res.redirect((await getPage(slug)) ? `/wiki/${slug}` : `/wiki/${slug}/edit?title=${encodeURIComponent(title)}`);
  });

  // ─── View ────────────────────────────────────────────────────────────────

  router.get('/wiki/:slug', async (req, res) => {
    const slug = String(req.params.slug);
    const page = await getPage(slug);
    if (!page) {
      res.status(404);
      return res.page({
        title: titleFromSlug(slug) || t('wiki.missing'),
        active: '/wiki',
        body: html`
          <p class="crumbs"><a href="/wiki">${t('nav.wiki')}</a> ›</p>
          <section class="empty">
            <h1>${titleFromSlug(slug) || t('wiki.missing')}</h1>
            <p>${t('wiki.doesNotExist')}</p>
            ${req.user && slugify(slug) === slug
              ? html`<a class="btn" href="/wiki/${slug}/edit">${t('wiki.createThis')}</a>`
              : html`<p>${th('wiki.loginToCreate', { link: html`<a href="/login?next=/wiki/${encodeURIComponent(slug)}">${t('nav.login')}</a>` })}</p>`}
          </section>`,
      });
    }
    const last = await db.get(`SELECT r.created_at, u.username, u.role, u.verified FROM wiki_revisions r JOIN users u ON u.id = r.user_id
          WHERE r.page_id = ? ORDER BY r.id DESC LIMIT 1`, page.id);
    const isMod = hasRole(req.user, 'mod');

    res.page({
      title: page.title,
      active: '/wiki',
      body: html`
        <p class="crumbs"><a href="/wiki">${t('nav.wiki')}</a> ›</p>
        <div class="page-head">
          <h1>${page.title}${page.locked ? html` <span class="pill pill-grey">🔒 ${t('forum.locked')}</span>` : ''}</h1>
          <div class="actions">
            ${canEdit(req.user, page) ? html`<a class="btn btn-small" href="/wiki/${page.slug}/edit">${t('common.edit')}</a>` : ''}
            <a class="btn btn-ghost btn-small" href="/wiki/${page.slug}/history">${t('wiki.history')}</a>
            ${isMod
              ? html`<form method="post" action="/wiki/${page.slug}/lock" class="inline">${csrfField(res)}<button class="btn btn-ghost btn-small">${page.locked ? t('forum.unlock') : t('forum.lock')}</button></form>`
              : ''}
          </div>
        </div>
        <article class="prose wiki-body">${markup(page.body, { wikiExists: await wikiLinkChecker(db, [page.body]) })}</article>
        <p class="muted small page-foot">${t('wiki.lastEdited')} ${dateTime(page.updated_at)}${last ? html` · ${userLink(last)}` : ''}</p>`,
    });
  });

  // ─── Edit ────────────────────────────────────────────────────────────────

  const editPage = (req, res, { slug, page, title, body, summary = '', baseRevision, error = '' }) =>
    res.page({
      title: page ? t('wiki.editing', { title: page.title }) : t('wiki.newPage'),
      active: '/wiki',
      body: html`
        <p class="crumbs"><a href="/wiki">${t('nav.wiki')}</a> › ${page ? html`<a href="/wiki/${slug}">${page.title}</a> ›` : ''}</p>
        <h1>${page ? t('wiki.editing', { title: page.title }) : t('wiki.newPage')}</h1>
        ${error ? html`<p class="form-error" role="alert">${error}</p>` : ''}
        <form method="post" action="/wiki/${slug}/edit" class="stack">
          ${csrfField(res)}
          <input type="hidden" name="base_revision" value="${baseRevision || ''}">
          <label>${t('forum.title')} <input name="title" value="${title}" required maxlength="80"></label>
          <label>${t('wiki.content')} <textarea name="body" rows="22" required maxlength="${MAX_BODY}" class="mono">${body}</textarea></label>
          <p class="muted small">${t('wiki.formatting')}</p>
          <label>${t('wiki.summary')} <input name="summary" value="${summary}" maxlength="140" placeholder="${t('wiki.summaryHint')}"></label>
          <div class="row-actions">
            <button class="btn">${t('wiki.save')}</button>
            <a href="${page ? `/wiki/${slug}` : '/wiki'}" class="btn btn-ghost">${t('common.cancel')}</a>
          </div>
        </form>`,
    });

  router.get('/wiki/:slug/edit', requireUser, async (req, res) => {
    const slug = String(req.params.slug);
    if (slugify(slug) !== slug) throw notFound(t('wiki.notFound'));
    const page = await getPage(slug);
    if (!canEdit(req.user, page)) throw forbidden(t('wiki.lockedEdit'));
    editPage(req, res, {
      slug,
      page,
      title: page ? page.title : text(req.query.title, 80) || titleFromSlug(slug),
      body: page ? page.body : '',
      baseRevision: page ? await latestRevisionId(page.id) : '',
    });
  });

  router.post('/wiki/:slug/edit', requireUser, async (req, res) => {
    const slug = String(req.params.slug);
    if (slugify(slug) !== slug) throw notFound(t('wiki.notFound'));
    const page = await getPage(slug);
    if (!canEdit(req.user, page)) throw forbidden(t('wiki.lockedEdit'));

    const title = text(req.body.title, 80);
    const body = typeof req.body.body === 'string' ? req.body.body.slice(0, MAX_BODY) : '';
    const summary = text(req.body.summary, 140);
    const base = intParam(req.body.base_revision);
    const form = { slug, page, title, body, summary, baseRevision: base };

    if (!title || !body.trim()) {
      res.status(400);
      return editPage(req, res, { ...form, error: t('wiki.needTitleAndBody') });
    }
    if (page) {
      const latest = await latestRevisionId(page.id);
      if (latest && base !== latest) {
        res.status(409);
        return editPage(req, res, {
          ...form,
          baseRevision: latest,
          error: t('wiki.conflict'),
        });
      }
      if (page.title === title && page.body === body) {
        return res.redirect(`/wiki/${slug}`);
      }
    }
    if (!hasRole(req.user, 'mod') && editLimiter.hit(`wiki:${req.user.id}`)) {
      throw Object.assign(new Error(t('wiki.tooFast')), { status: 429 });
    }

    // The page row only changes if nobody saved since this edit started (for a new page:
    // if nobody created it meanwhile). The revision is written only when the page row was.
    const now = Date.now();
    const [saved] = await db.batch([
      page
        ? [
            `UPDATE wiki_pages SET title = ?, body = ?, updated_at = ?
              WHERE id = ? AND (SELECT MAX(id) FROM wiki_revisions WHERE page_id = ?) IS ?`,
            title, body, now, page.id, page.id, base,
          ]
        : ['INSERT OR IGNORE INTO wiki_pages (slug, title, body, created_at, updated_at) VALUES (?, ?, ?, ?, ?)', slug, title, body, now, now],
      [
        `INSERT INTO wiki_revisions (page_id, user_id, title, body, summary, created_at)
         SELECT id, ?, ?, ?, ?, ? FROM wiki_pages WHERE slug = ? AND changes() = 1`,
        req.user.id, title, body, summary || (page ? '' : t('wiki.createdSummary')), now, slug,
      ],
    ]);
    if (saved.changes !== 1) {
      res.status(409);
      return editPage(req, res, {
        ...form,
        page: page || (await getPage(slug)),
        baseRevision: base,
        error: t('wiki.conflict'),
      });
    }
    res.flash('success', page ? t('wiki.saved') : t('wiki.created'));
    res.redirect(`/wiki/${slug}`);
  });

  // ─── History ─────────────────────────────────────────────────────────────

  router.get('/wiki/:slug/history', async (req, res) => {
    const page = await loadPage(req.params.slug);
    const revisions = await db.all(`SELECT r.id, r.summary, r.created_at, length(r.body) AS size, u.username, u.role, u.verified
           FROM wiki_revisions r JOIN users u ON u.id = r.user_id WHERE r.page_id = ? ORDER BY r.id DESC LIMIT 200`, page.id);
    res.page({
      title: t('wiki.historyOf', { title: page.title }),
      active: '/wiki',
      body: html`
        <p class="crumbs"><a href="/wiki">${t('nav.wiki')}</a> › <a href="/wiki/${page.slug}">${page.title}</a> ›</p>
        <h1>${t('wiki.history')}</h1>
        <div class="table-wrap"><table>
          <thead><tr><th>${t('wiki.when')}</th><th>${t('wiki.editor')}</th><th>${t('wiki.summary')}</th><th class="num">${t('wiki.size')}</th><th></th></tr></thead>
          <tbody>${revisions.map(
            (r, i) => html`<tr>
              <td>${dateTime(r.created_at)}</td>
              <td>${userLink(r)}</td>
              <td>${r.summary || html`<span class="muted">–</span>`}${i === 0 ? html` <span class="pill">${t('wiki.current')}</span>` : ''}</td>
              <td class="num">${r.size}</td>
              <td><a href="/wiki/${page.slug}/rev/${r.id}">${t('common.view')}</a></td>
            </tr>`
          )}</tbody>
        </table></div>`,
    });
  });

  router.get('/wiki/:slug/rev/:id', async (req, res) => {
    const page = await loadPage(req.params.slug);
    const rev = await db.get(`SELECT r.*, u.username, u.role, u.verified FROM wiki_revisions r JOIN users u ON u.id = r.user_id
          WHERE r.id = ? AND r.page_id = ?`, intParam(req.params.id) || 0, page.id);
    if (!rev) throw notFound(t('wiki.revisionNotFound'));
    res.page({
      title: t('wiki.oldVersion', { title: page.title }),
      active: '/wiki',
      body: html`
        <p class="crumbs"><a href="/wiki">${t('nav.wiki')}</a> › <a href="/wiki/${page.slug}">${page.title}</a> › <a href="/wiki/${page.slug}/history">${t('wiki.history')}</a> ›</p>
        <div class="flash flash-info">${th('wiki.viewingOld', { user: userLink(rev), when: dateTime(rev.created_at) })}
          ${hasRole(req.user, 'mod')
            ? html`<form method="post" action="/wiki/${page.slug}/revert/${rev.id}" class="inline" data-confirm="${t('wiki.restoreConfirm')}">${csrfField(res)}<button class="btn btn-small">${t('wiki.restore')}</button></form>`
            : ''}
        </div>
        <h1>${rev.title}</h1>
        <article class="prose wiki-body">${markup(rev.body, { wikiExists: await wikiLinkChecker(db, [rev.body]) })}</article>`,
    });
  });

  router.post('/wiki/:slug/revert/:id', requireRole('mod'), async (req, res) => {
    const page = await loadPage(req.params.slug);
    const rev = await db.get('SELECT * FROM wiki_revisions WHERE id = ? AND page_id = ?', intParam(req.params.id) || 0, page.id);
    if (!rev) throw notFound(t('wiki.revisionNotFound'));
    const now = Date.now();
    await db.batch([
      ['UPDATE wiki_pages SET title = ?, body = ?, updated_at = ? WHERE id = ?', rev.title, rev.body, now, page.id],
      ['INSERT INTO wiki_revisions (page_id, user_id, title, body, summary, created_at) VALUES (?, ?, ?, ?, ?, ?)', page.id, req.user.id, rev.title, rev.body, t('wiki.restoredSummary', { id: rev.id }), now],
    ]);
    res.flash('success', t('wiki.restored'));
    res.redirect(`/wiki/${page.slug}`);
  });

  router.post('/wiki/:slug/lock', requireRole('mod'), async (req, res) => {
    const page = await loadPage(req.params.slug);
    await db.run('UPDATE wiki_pages SET locked = ? WHERE id = ?', page.locked ? 0 : 1, page.id);
    res.flash('success', page.locked ? t('wiki.unlocked') : t('wiki.lockedFlash'));
    res.redirect(`/wiki/${page.slug}`);
  });

  return router;
};
