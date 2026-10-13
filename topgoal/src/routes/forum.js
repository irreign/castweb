'use strict';

const express = require('express');
const { requireUser, requireRole, hasRole, rateLimiter } = require('../auth');
const { html, th, csrfField, userLink, dateTime, markup, blueTick, categoryName, categoryDescription } = require('../render');
const { t, tn } = require('../i18n');
const { notFound, forbidden, badRequest, intParam, text, paging, wikiLinkChecker } = require('./util');

const THREADS_PER_PAGE = 30;
const POSTS_PER_PAGE = 25;
const MAX_BODY = 20000;

// Announcements live in the News tab; every other category is part of Chat.
const tabFor = (slug) => (slug === 'announcements' ? '/news' : '/forum');
const crumbFor = (slug) => (slug === 'announcements' ? html`<a href="/news">${t('nav.news')}</a>` : html`<a href="/forum">${t('nav.chat')}</a>`);

function pager(base, page, total, perPage) {
  const pages = Math.max(1, Math.ceil(total / perPage));
  if (pages <= 1) return '';
  const links = [];
  for (let i = 1; i <= pages; i++) {
    links.push(
      i === page
        ? html`<span aria-current="page">${i}</span>`
        : html`<a href="${base}${base.includes('?') ? '&' : '?'}page=${i}">${i}</a>`
    );
  }
  return html`<nav class="pager" aria-label="${t('common.pages')}">${links}</nav>`;
}

function editorHelp() {
  return html`<p class="muted small">${t('forum.formatting')}</p>`;
}

module.exports = ({ db }) => {
  const router = express.Router();
  const postLimiter = rateLimiter({ windowMs: 10 * 60 * 1000, max: 20 });

  const canPostIn = (user, category) =>
    Boolean(user) && (!category.verified_only || user.verified || hasRole(user, 'mod'));

  // Only moderators start threads in Announcements; everyone can still reply.
  const canStartThread = (user, category) =>
    canPostIn(user, category) && (category.slug !== 'announcements' || hasRole(user, 'mod'));

  const checkPostRate = (req) => {
    if (!hasRole(req.user, 'mod') && postLimiter.hit(`post:${req.user.id}`)) {
      throw Object.assign(new Error(t('forum.tooFast')), { status: 429 });
    }
  };

  const loadCategory = async (slug) => {
    const category = await db.get('SELECT * FROM forum_categories WHERE slug = ?', String(slug));
    if (!category) throw notFound(t('forum.notFound'));
    return category;
  };

  const loadThread = async (idParam) => {
    const id = intParam(idParam);
    const thread =
      id &&
      (await db.get(
        `SELECT t.*, c.slug AS category_slug, c.name AS category_name, c.verified_only
           FROM threads t JOIN forum_categories c ON c.id = t.category_id WHERE t.id = ?`,
        id
      ));
    if (!thread) throw notFound(t('forum.threadNotFound'));
    // categoryName() needs the category's slug and name together.
    return { ...thread, category: { slug: thread.category_slug, name: thread.category_name } };
  };

  // ─── Index (Chat tab) ────────────────────────────────────────────────────

  router.get('/forum', async (req, res) => {
    const categories = await db.all(`SELECT c.*,
                (SELECT COUNT(*) FROM threads t WHERE t.category_id = c.id) AS thread_count,
                (SELECT COALESCE(SUM(post_count), 0) FROM threads t WHERE t.category_id = c.id) AS post_count,
                (SELECT t.id FROM threads t WHERE t.category_id = c.id ORDER BY t.last_post_at DESC LIMIT 1) AS last_thread_id,
                (SELECT t.title FROM threads t WHERE t.category_id = c.id ORDER BY t.last_post_at DESC LIMIT 1) AS last_thread_title,
                (SELECT t.last_post_at FROM threads t WHERE t.category_id = c.id ORDER BY t.last_post_at DESC LIMIT 1) AS last_post_at
           FROM forum_categories c WHERE c.slug != 'announcements' ORDER BY c.position, c.name`);
    const recent = await db.all(`SELECT t.id, t.title, t.post_count, t.last_post_at, c.slug, c.name,
                u.username, u.role, u.verified
           FROM threads t JOIN forum_categories c ON c.id = t.category_id JOIN users u ON u.id = t.user_id
          WHERE c.slug != 'announcements' ORDER BY t.last_post_at DESC LIMIT 6`);

    res.page({
      title: t('nav.chat'),
      active: '/forum',
      body: html`
        <div class="page-head"><h1>${t('nav.chat')}</h1></div>
        <p class="lead">${t('forum.lead')}</p>
        <div class="forum-list">
          ${categories.map(
            (c) => html`<a class="forum-row" href="/forum/${c.slug}">
              <div>
                <h2>${categoryName(c)}${c.verified_only ? html` <span class="pill pill-blue">${blueTick()} ${t('forum.verifiedOnly')}</span>` : ''}</h2>
                <p class="muted">${categoryDescription(c)}</p>
              </div>
              <div class="forum-stats">${tn('forum.threads', c.thread_count)}<br>${tn('forum.posts', c.post_count)}</div>
              <div class="forum-last small">${c.last_thread_id ? html`<span>${c.last_thread_title}</span><span class="muted">${dateTime(c.last_post_at)}</span>` : html`<span class="muted">${t('forum.noThreads')}</span>`}</div>
            </a>`
          )}
        </div>
        ${recent.length
          ? html`<section class="panel recent-panel">
              <h2>${t('forum.recent')}</h2>
              <ul class="list">${recent.map(
                (r) => html`<li><a class="list-title" href="/t/${r.id}">${r.title}</a>
                  <span class="meta">${categoryName(r)} · ${userLink(r)} · ${tn('forum.posts', r.post_count)} · ${dateTime(r.last_post_at)}</span></li>`
              )}</ul>
            </section>`
          : ''}`,
    });
  });

  // ─── Category ────────────────────────────────────────────────────────────

  router.get('/forum/:slug', async (req, res) => {
    const category = await loadCategory(req.params.slug);
    if (category.slug === 'announcements' && !req.query.page) return res.redirect('/news');
    const { page, perPage, offset } = paging(req, THREADS_PER_PAGE);
    const { n: total } = await db.get('SELECT COUNT(*) AS n FROM threads WHERE category_id = ?', category.id);
    const threads = await db.all(
      `SELECT t.*, u.username, u.role, u.verified FROM threads t JOIN users u ON u.id = t.user_id
        WHERE t.category_id = ? ORDER BY t.pinned DESC, t.last_post_at DESC LIMIT ? OFFSET ?`,
      category.id, perPage, offset
    );

    res.page({
      title: categoryName(category),
      active: tabFor(category.slug),
      body: html`
        <p class="crumbs">${crumbFor(category.slug)} ›</p>
        <div class="page-head">
          <h1>${categoryName(category)}</h1>
          ${canStartThread(req.user, category)
            ? html`<a class="btn" href="/forum/${category.slug}/new">${t('forum.newThread')}</a>`
            : req.user && category.slug === 'announcements'
              ? ''
              : req.user
                ? html`<a class="btn btn-ghost" href="/verify">${t('forum.verifyToPost')}</a>`
                : html`<a class="btn" href="/login?next=/forum/${category.slug}/new">${t('forum.loginToPost')}</a>`}
        </div>
        <p class="muted">${categoryDescription(category)}</p>
        ${threads.length
          ? html`<ul class="thread-list">${threads.map(
              (row) => html`<li class="${row.pinned ? 'pinned' : ''}">
                <div>
                  ${row.pinned ? html`<span class="pill">📌 ${t('forum.pinned')}</span> ` : ''}${row.locked ? html`<span class="pill pill-grey">🔒 ${t('forum.locked')}</span> ` : ''}
                  <a class="list-title" href="/t/${row.id}">${row.title}</a>
                  <span class="meta">${userLink(row)} · ${dateTime(row.created_at)}</span>
                </div>
                <div class="thread-stats">${tn('forum.replies', Math.max(0, row.post_count - 1))}<br><span class="muted small">${dateTime(row.last_post_at)}</span></div>
              </li>`
            )}</ul>
            ${pager(`/forum/${category.slug}`, page, total, perPage)}`
          : html`<p class="empty">${t('forum.beFirst')}</p>`}`,
    });
  });

  // ─── New thread ──────────────────────────────────────────────────────────

  const newThreadPage = (req, res, category, { title = '', body = '', error = '' } = {}) =>
    res.page({
      title: t('forum.newThread'),
      active: tabFor(category.slug),
      body: html`
        <p class="crumbs">${crumbFor(category.slug)} › <a href="/forum/${category.slug}">${categoryName(category)}</a> ›</p>
        <h1>${category.slug === 'announcements' ? t('news.post') : t('forum.newThread')}</h1>
        ${error ? html`<p class="form-error" role="alert">${error}</p>` : ''}
        <form method="post" action="/forum/${category.slug}/new" class="stack">
          ${csrfField(res)}
          <label>${t('forum.title')} <input name="title" value="${title}" required maxlength="120"></label>
          <label>${t('forum.message')} <textarea name="body" rows="10" required maxlength="${MAX_BODY}">${body}</textarea></label>
          ${editorHelp()}
          <button class="btn">${t('forum.postThread')}</button>
        </form>`,
    });

  router.get('/forum/:slug/new', requireUser, async (req, res) => {
    const category = await loadCategory(req.params.slug);
    if (!canStartThread(req.user, category)) throw forbidden(t('forum.cannotStart'));
    newThreadPage(req, res, category);
  });

  router.post('/forum/:slug/new', requireUser, async (req, res) => {
    const category = await loadCategory(req.params.slug);
    if (!canStartThread(req.user, category)) throw forbidden(t('forum.cannotStart'));
    const title = text(req.body.title, 120);
    const body = text(req.body.body, MAX_BODY);
    if (!title || !body) {
      res.status(400);
      return newThreadPage(req, res, category, { title, body, error: t('forum.needTitleAndBody') });
    }
    checkPostRate(req);
    const now = Date.now();
    const [{ lastInsertRowid: threadId }] = await db.batch([
      ['INSERT INTO threads (category_id, user_id, title, post_count, created_at, last_post_at) VALUES (?, ?, ?, 1, ?, ?)', category.id, req.user.id, title, now, now],
      ['INSERT INTO posts (thread_id, user_id, body, created_at) VALUES (last_insert_rowid(), ?, ?, ?)', req.user.id, body, now],
    ]);
    res.redirect(`/t/${threadId}`);
  });

  // ─── Thread ──────────────────────────────────────────────────────────────

  router.get('/t/:id', async (req, res) => {
    const thread = await loadThread(req.params.id);
    const { page, perPage, offset } = paging(req, POSTS_PER_PAGE);
    const posts = await db.all(
      `SELECT p.*, u.username, u.role, u.verified, u.ign, f.name AS fa_name, f.id AS fa_id
         FROM posts p JOIN users u ON u.id = p.user_id LEFT JOIN fas f ON f.id = u.fa_id
        WHERE p.thread_id = ? ORDER BY p.id LIMIT ? OFFSET ?`,
      thread.id, perPage, offset
    );
    const { n: total } = await db.get('SELECT COUNT(*) AS n FROM posts WHERE thread_id = ?', thread.id);
    const wikiExists = await wikiLinkChecker(db, posts.filter((p) => !p.deleted).map((p) => p.body));
    const isMod = hasRole(req.user, 'mod');
    const canReply = canPostIn(req.user, thread) && (!thread.locked || isMod);

    res.page({
      title: thread.title,
      active: tabFor(thread.category_slug),
      body: html`
        <p class="crumbs">${crumbFor(thread.category_slug)} › <a href="/forum/${thread.category_slug}">${categoryName(thread.category)}</a> ›</p>
        <div class="page-head">
          <h1>${thread.title}</h1>
          ${isMod
            ? html`<form method="post" action="/t/${thread.id}/moderate" class="mod-tools">
                ${csrfField(res)}
                <button name="action" value="${thread.pinned ? 'unpin' : 'pin'}" class="btn btn-ghost btn-small">${thread.pinned ? t('forum.unpin') : t('forum.pin')}</button>
                <button name="action" value="${thread.locked ? 'unlock' : 'lock'}" class="btn btn-ghost btn-small">${thread.locked ? t('forum.unlock') : t('forum.lock')}</button>
                <button name="action" value="delete" class="btn btn-danger btn-small" data-confirm="${t('forum.deleteThreadConfirm')}">${t('common.delete')}</button>
              </form>`
            : ''}
        </div>
        ${thread.locked ? html`<p class="flash flash-info">🔒 ${t('forum.lockedNotice')}</p>` : ''}
        <div class="posts">
          ${posts.map(
            (p) => html`<article class="post" id="p${p.id}">
              <aside class="post-author">
                <div class="avatar" aria-hidden="true">${p.username.slice(0, 1).toUpperCase()}</div>
                ${userLink(p, { showRole: true })}
                ${p.ign ? html`<span class="small muted">${t('friends.ign', { ign: p.ign })}</span>` : ''}
                ${p.fa_name ? html`<a class="small" href="/fas/${p.fa_id}">${p.fa_name}</a>` : ''}
              </aside>
              <div class="post-body">
                <div class="post-meta"><a href="/t/${thread.id}?page=${page}#p${p.id}">${dateTime(p.created_at)}</a>${p.edited_at ? html` · <span class="muted">${t('forum.edited')} ${dateTime(p.edited_at)}</span>` : ''}</div>
                ${p.deleted ? html`<p class="muted"><em>${t('forum.postRemoved')}</em></p>` : html`<div class="prose">${markup(p.body, { wikiExists })}</div>`}
                ${!p.deleted && req.user && (isMod || p.user_id === req.user.id)
                  ? html`<div class="post-actions">
                      <a href="/p/${p.id}/edit">${t('common.edit')}</a>
                      <form method="post" action="/p/${p.id}/delete" class="inline" data-confirm="${t('forum.removePostConfirm')}">${csrfField(res)}<button class="btn-link danger">${t('common.remove')}</button></form>
                    </div>`
                  : ''}
              </div>
            </article>`
          )}
        </div>
        ${pager(`/t/${thread.id}`, page, total, perPage)}
        ${canReply
          ? html`<section class="reply-box" id="reply">
              <h2>${t('forum.reply')}</h2>
              <form method="post" action="/t/${thread.id}/reply" class="stack">
                ${csrfField(res)}
                <textarea name="body" rows="6" required maxlength="${MAX_BODY}" aria-label="${t('forum.yourReply')}"></textarea>
                ${editorHelp()}
                <button class="btn">${t('forum.postReply')}</button>
              </form>
            </section>`
          : !req.user
            ? html`<p class="reply-box">${th('forum.loginToReply', { login: html`<a href="/login?next=/t/${thread.id}">${t('nav.login')}</a>`, join: html`<a href="/register">${t('nav.join')}</a>` })}</p>`
            : !thread.locked
              ? html`<p class="reply-box">${th('forum.verifiedOnlyReply', { link: html`<a href="/verify">${t('nav.verify')}</a>` })}</p>`
              : ''}`,
    });
  });

  router.post('/t/:id/reply', requireUser, async (req, res) => {
    const thread = await loadThread(req.params.id);
    if (!canPostIn(req.user, thread)) throw forbidden(t('forum.cannotPost'));
    if (thread.locked && !hasRole(req.user, 'mod')) throw forbidden(t('forum.lockedNotice'));
    const body = text(req.body.body, MAX_BODY);
    if (!body) {
      res.flash('error', t('forum.emptyReply'));
      return res.redirect(`/t/${thread.id}#reply`);
    }
    checkPostRate(req);
    const now = Date.now();
    const [{ lastInsertRowid: postId }] = await db.batch([
      ['INSERT INTO posts (thread_id, user_id, body, created_at) VALUES (?, ?, ?, ?)', thread.id, req.user.id, body, now],
      ['UPDATE threads SET post_count = post_count + 1, last_post_at = ? WHERE id = ?', now, thread.id],
    ]);
    const lastPage = Math.ceil((thread.post_count + 1) / POSTS_PER_PAGE);
    res.redirect(`/t/${thread.id}?page=${lastPage}#p${postId}`);
  });

  router.post('/t/:id/moderate', requireRole('mod'), async (req, res) => {
    const thread = await loadThread(req.params.id);
    const actions = {
      pin: 'UPDATE threads SET pinned = 1 WHERE id = ?',
      unpin: 'UPDATE threads SET pinned = 0 WHERE id = ?',
      lock: 'UPDATE threads SET locked = 1 WHERE id = ?',
      unlock: 'UPDATE threads SET locked = 0 WHERE id = ?',
      delete: 'DELETE FROM threads WHERE id = ?',
    };
    const sql = actions[req.body.action];
    if (!sql) throw badRequest(t('errors.badRequest'));
    await db.run(sql, thread.id);
    if (req.body.action === 'delete') {
      res.flash('success', t('forum.threadDeleted'));
      return res.redirect(thread.category_slug === 'announcements' ? '/news' : `/forum/${thread.category_slug}`);
    }
    res.redirect(`/t/${thread.id}`);
  });

  // ─── Posts ───────────────────────────────────────────────────────────────

  const loadOwnPost = async (req) => {
    const id = intParam(req.params.id);
    const post = id && (await db.get('SELECT * FROM posts WHERE id = ? AND deleted = 0', id));
    if (!post) throw notFound(t('forum.postNotFound'));
    if (post.user_id !== req.user.id && !hasRole(req.user, 'mod')) throw forbidden(t('forum.ownPostsOnly'));
    return post;
  };

  router.get('/p/:id/edit', requireUser, async (req, res) => {
    const post = await loadOwnPost(req);
    const thread = await loadThread(String(post.thread_id));
    res.page({
      title: t('forum.editPost'),
      active: tabFor(thread.category_slug),
      body: html`
        <p class="crumbs">${crumbFor(thread.category_slug)} › <a href="/t/${thread.id}">${thread.title}</a> ›</p>
        <h1>${t('forum.editPost')}</h1>
        <form method="post" action="/p/${post.id}/edit" class="stack">
          ${csrfField(res)}
          <textarea name="body" rows="10" required maxlength="${MAX_BODY}" aria-label="${t('forum.message')}">${post.body}</textarea>
          ${editorHelp()}
          <button class="btn">${t('common.saveChanges')}</button>
        </form>`,
    });
  });

  router.post('/p/:id/edit', requireUser, async (req, res) => {
    const post = await loadOwnPost(req);
    const body = text(req.body.body, MAX_BODY);
    if (!body) throw badRequest(t('forum.emptyReply'));
    await db.run('UPDATE posts SET body = ?, edited_at = ? WHERE id = ?', body, Date.now(), post.id);
    res.redirect(`/t/${post.thread_id}#p${post.id}`);
  });

  router.post('/p/:id/delete', requireUser, async (req, res) => {
    const post = await loadOwnPost(req);
    await db.run('UPDATE posts SET deleted = 1 WHERE id = ?', post.id);
    res.flash('success', t('forum.postRemovedFlash'));
    res.redirect(`/t/${post.thread_id}`);
  });

  return router;
};

