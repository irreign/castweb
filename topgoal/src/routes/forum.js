'use strict';

const express = require('express');
const { transaction } = require('../db');
const { requireUser, requireRole, hasRole, rateLimiter } = require('../auth');
const { html, csrfField, userLink, dateTime, markup, BLUE_TICK } = require('../render');
const { notFound, forbidden, intParam, text, paging } = require('./util');

const THREADS_PER_PAGE = 30;
const POSTS_PER_PAGE = 25;
const MAX_BODY = 20000;

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
  return html`<nav class="pager" aria-label="Pages">${links}</nav>`;
}

function editorHelp() {
  return html`<p class="muted small">Formatting: **bold**, *italic*, \`code\`, - lists, &gt; quotes, links, and [[Wiki Page]] links.</p>`;
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
      throw Object.assign(new Error('You are posting too fast. Wait a few minutes and try again.'), { status: 429 });
    }
  };

  const loadCategory = (slug) => {
    const category = db.prepare('SELECT * FROM forum_categories WHERE slug = ?').get(String(slug));
    if (!category) throw notFound('Forum not found.');
    return category;
  };

  const loadThread = (idParam) => {
    const id = intParam(idParam);
    const thread =
      id &&
      db
        .prepare(
          `SELECT t.*, c.slug AS category_slug, c.name AS category_name, c.verified_only
             FROM threads t JOIN forum_categories c ON c.id = t.category_id WHERE t.id = ?`
        )
        .get(id);
    if (!thread) throw notFound('Thread not found.');
    return thread;
  };

  // ─── Index ───────────────────────────────────────────────────────────────

  router.get('/forum', (req, res) => {
    const categories = db
      .prepare(
        `SELECT c.*,
                (SELECT COUNT(*) FROM threads t WHERE t.category_id = c.id) AS thread_count,
                (SELECT COALESCE(SUM(post_count), 0) FROM threads t WHERE t.category_id = c.id) AS post_count,
                (SELECT t.id FROM threads t WHERE t.category_id = c.id ORDER BY t.last_post_at DESC LIMIT 1) AS last_thread_id,
                (SELECT t.title FROM threads t WHERE t.category_id = c.id ORDER BY t.last_post_at DESC LIMIT 1) AS last_thread_title,
                (SELECT t.last_post_at FROM threads t WHERE t.category_id = c.id ORDER BY t.last_post_at DESC LIMIT 1) AS last_post_at
           FROM forum_categories c ORDER BY c.position, c.name`
      )
      .all();

    res.page({
      title: 'Forums',
      active: '/forum',
      body: html`
        <div class="page-head"><h1>Forums</h1></div>
        <p class="lead">Cross-FA chat for every TopGoal manager. Recruit, trade tips, compare pack pulls and argue about formations.</p>
        <div class="forum-list">
          ${categories.map(
            (c) => html`<a class="forum-row" href="/forum/${c.slug}">
              <div>
                <h2>${c.name}${c.verified_only ? html` <span class="pill pill-blue">${BLUE_TICK} Verified only</span>` : ''}</h2>
                <p class="muted">${c.description}</p>
              </div>
              <div class="forum-stats"><strong>${c.thread_count}</strong> threads<br><strong>${c.post_count}</strong> posts</div>
              <div class="forum-last small">${c.last_thread_id ? html`<span>${c.last_thread_title}</span><span class="muted">${dateTime(c.last_post_at)}</span>` : html`<span class="muted">No threads yet</span>`}</div>
            </a>`
          )}
        </div>`,
    });
  });

  // ─── Category ────────────────────────────────────────────────────────────

  router.get('/forum/:slug', (req, res) => {
    const category = loadCategory(req.params.slug);
    const { page, perPage, offset } = paging(req, THREADS_PER_PAGE);
    const { n: total } = db.prepare('SELECT COUNT(*) AS n FROM threads WHERE category_id = ?').get(category.id);
    const threads = db
      .prepare(
        `SELECT t.*, u.username, u.role, u.verified FROM threads t JOIN users u ON u.id = t.user_id
          WHERE t.category_id = ? ORDER BY t.pinned DESC, t.last_post_at DESC LIMIT ? OFFSET ?`
      )
      .all(category.id, perPage, offset);

    res.page({
      title: category.name,
      active: '/forum',
      body: html`
        <p class="crumbs"><a href="/forum">Forums</a> ›</p>
        <div class="page-head">
          <h1>${category.name}</h1>
          ${canStartThread(req.user, category)
            ? html`<a class="btn" href="/forum/${category.slug}/new">New thread</a>`
            : req.user && category.slug === 'announcements'
              ? ''
              : req.user
              ? html`<a class="btn btn-ghost" href="/verify">Get verified to post here</a>`
              : html`<a class="btn" href="/login?next=/forum/${category.slug}/new">Log in to post</a>`}
        </div>
        <p class="muted">${category.description}</p>
        ${threads.length
          ? html`<ul class="thread-list">${threads.map(
              (t) => html`<li class="${t.pinned ? 'pinned' : ''}">
                <div>
                  ${t.pinned ? html`<span class="pill">Pinned</span> ` : ''}${t.locked ? html`<span class="pill pill-grey">Locked</span> ` : ''}
                  <a class="list-title" href="/t/${t.id}">${t.title}</a>
                  <span class="meta">by ${userLink(t)} · ${dateTime(t.created_at)}</span>
                </div>
                <div class="thread-stats"><strong>${Math.max(0, t.post_count - 1)}</strong> replies<br><span class="muted small">${dateTime(t.last_post_at)}</span></div>
              </li>`
            )}</ul>
            ${pager(`/forum/${category.slug}`, page, total, perPage)}`
          : html`<p class="empty">No threads yet. Be the first to post.</p>`}`,
    });
  });

  // ─── New thread ──────────────────────────────────────────────────────────

  const newThreadPage = (req, res, category, { title = '', body = '', error = '' } = {}) =>
    res.page({
      title: `New thread in ${category.name}`,
      active: '/forum',
      body: html`
        <p class="crumbs"><a href="/forum">Forums</a> › <a href="/forum/${category.slug}">${category.name}</a> ›</p>
        <h1>New thread</h1>
        ${error ? html`<p class="form-error" role="alert">${error}</p>` : ''}
        <form method="post" action="/forum/${category.slug}/new" class="stack">
          ${csrfField(res)}
          <label>Title <input name="title" value="${title}" required maxlength="120"></label>
          <label>Message <textarea name="body" rows="10" required maxlength="${MAX_BODY}">${body}</textarea></label>
          ${editorHelp()}
          <button class="btn">Post thread</button>
        </form>`,
    });

  router.get('/forum/:slug/new', requireUser, (req, res) => {
    const category = loadCategory(req.params.slug);
    if (!canStartThread(req.user, category)) throw forbidden('You cannot start threads in this forum.');
    newThreadPage(req, res, category);
  });

  router.post('/forum/:slug/new', requireUser, (req, res) => {
    const category = loadCategory(req.params.slug);
    if (!canStartThread(req.user, category)) throw forbidden('You cannot start threads in this forum.');
    const title = text(req.body.title, 120);
    const body = text(req.body.body, MAX_BODY);
    if (!title || !body) {
      res.status(400);
      return newThreadPage(req, res, category, { title, body, error: 'A title and a message are both required.' });
    }
    checkPostRate(req);
    const threadId = transaction(db, () => {
      const now = Date.now();
      const id = db
        .prepare(
          'INSERT INTO threads (category_id, user_id, title, post_count, created_at, last_post_at) VALUES (?, ?, ?, 1, ?, ?)'
        )
        .run(category.id, req.user.id, title, now, now).lastInsertRowid;
      db.prepare('INSERT INTO posts (thread_id, user_id, body, created_at) VALUES (?, ?, ?, ?)').run(id, req.user.id, body, now);
      return id;
    });
    res.redirect(`/t/${threadId}`);
  });

  // ─── Thread ──────────────────────────────────────────────────────────────

  const wikiExists = (() => {
    const stmt = db.prepare('SELECT 1 FROM wiki_pages WHERE slug = ?');
    return (slug) => Boolean(stmt.get(slug));
  })();

  router.get('/t/:id', (req, res) => {
    const thread = loadThread(req.params.id);
    const { page, perPage, offset } = paging(req, POSTS_PER_PAGE);
    const posts = db
      .prepare(
        `SELECT p.*, u.username, u.role, u.verified, u.ign, f.name AS fa_name, f.id AS fa_id
           FROM posts p JOIN users u ON u.id = p.user_id LEFT JOIN fas f ON f.id = u.fa_id
          WHERE p.thread_id = ? ORDER BY p.id LIMIT ? OFFSET ?`
      )
      .all(thread.id, perPage, offset);
    const { n: total } = db.prepare('SELECT COUNT(*) AS n FROM posts WHERE thread_id = ?').get(thread.id);
    const isMod = hasRole(req.user, 'mod');
    const canReply = canPostIn(req.user, thread) && (!thread.locked || isMod);

    res.page({
      title: thread.title,
      active: '/forum',
      body: html`
        <p class="crumbs"><a href="/forum">Forums</a> › <a href="/forum/${thread.category_slug}">${thread.category_name}</a> ›</p>
        <div class="page-head">
          <h1>${thread.title}</h1>
          ${isMod
            ? html`<form method="post" action="/t/${thread.id}/moderate" class="mod-tools">
                ${csrfField(res)}
                <button name="action" value="${thread.pinned ? 'unpin' : 'pin'}" class="btn btn-ghost btn-small">${thread.pinned ? 'Unpin' : 'Pin'}</button>
                <button name="action" value="${thread.locked ? 'unlock' : 'lock'}" class="btn btn-ghost btn-small">${thread.locked ? 'Unlock' : 'Lock'}</button>
                <button name="action" value="delete" class="btn btn-danger btn-small" data-confirm="Delete this whole thread?">Delete</button>
              </form>`
            : ''}
        </div>
        ${thread.locked ? html`<p class="flash flash-info">This thread is locked. No new replies.</p>` : ''}
        <div class="posts">
          ${posts.map(
            (p) => html`<article class="post" id="p${p.id}">
              <aside class="post-author">
                <div class="avatar" aria-hidden="true">${p.username.slice(0, 1).toUpperCase()}</div>
                ${userLink(p, { showRole: true })}
                ${p.ign ? html`<span class="small muted">IGN: ${p.ign}</span>` : ''}
                ${p.fa_name ? html`<a class="small" href="/fas/${p.fa_id}">${p.fa_name}</a>` : ''}
              </aside>
              <div class="post-body">
                <div class="post-meta"><a href="/t/${thread.id}?page=${page}#p${p.id}">${dateTime(p.created_at)}</a>${p.edited_at ? html` · <span class="muted">edited ${dateTime(p.edited_at)}</span>` : ''}</div>
                ${p.deleted ? html`<p class="muted"><em>This post was removed.</em></p>` : html`<div class="prose">${markup(p.body, { wikiExists })}</div>`}
                ${!p.deleted && req.user && (isMod || p.user_id === req.user.id)
                  ? html`<div class="post-actions">
                      <a href="/p/${p.id}/edit">Edit</a>
                      <form method="post" action="/p/${p.id}/delete" class="inline" data-confirm="Remove this post?">${csrfField(res)}<button class="btn-link danger">Remove</button></form>
                    </div>`
                  : ''}
              </div>
            </article>`
          )}
        </div>
        ${pager(`/t/${thread.id}`, page, total, perPage)}
        ${canReply
          ? html`<section class="reply-box" id="reply">
              <h2>Reply</h2>
              <form method="post" action="/t/${thread.id}/reply" class="stack">
                ${csrfField(res)}
                <textarea name="body" rows="6" required maxlength="${MAX_BODY}" aria-label="Your reply"></textarea>
                ${editorHelp()}
                <button class="btn">Post reply</button>
              </form>
            </section>`
          : !req.user
            ? html`<p class="reply-box"><a href="/login?next=/t/${thread.id}">Log in</a> or <a href="/register">join</a> to reply.</p>`
            : !thread.locked
              ? html`<p class="reply-box">Only <a href="/verify">verified managers</a> can reply in this forum.</p>`
              : ''}`,
    });
  });

  router.post('/t/:id/reply', requireUser, (req, res) => {
    const thread = loadThread(req.params.id);
    if (!canPostIn(req.user, thread)) throw forbidden('Only verified managers can post in this forum.');
    if (thread.locked && !hasRole(req.user, 'mod')) throw forbidden('This thread is locked.');
    const body = text(req.body.body, MAX_BODY);
    if (!body) {
      res.flash('error', 'Your reply was empty.');
      return res.redirect(`/t/${thread.id}#reply`);
    }
    checkPostRate(req);
    const postId = transaction(db, () => {
      const now = Date.now();
      const id = db
        .prepare('INSERT INTO posts (thread_id, user_id, body, created_at) VALUES (?, ?, ?, ?)')
        .run(thread.id, req.user.id, body, now).lastInsertRowid;
      db.prepare('UPDATE threads SET post_count = post_count + 1, last_post_at = ? WHERE id = ?').run(now, thread.id);
      return id;
    });
    const lastPage = Math.ceil((thread.post_count + 1) / POSTS_PER_PAGE);
    res.redirect(`/t/${thread.id}?page=${lastPage}#p${postId}`);
  });

  router.post('/t/:id/moderate', requireRole('mod'), (req, res) => {
    const thread = loadThread(req.params.id);
    const actions = {
      pin: 'UPDATE threads SET pinned = 1 WHERE id = ?',
      unpin: 'UPDATE threads SET pinned = 0 WHERE id = ?',
      lock: 'UPDATE threads SET locked = 1 WHERE id = ?',
      unlock: 'UPDATE threads SET locked = 0 WHERE id = ?',
      delete: 'DELETE FROM threads WHERE id = ?',
    };
    const sql = actions[req.body.action];
    if (!sql) throw Object.assign(new Error('Unknown action.'), { status: 400 });
    db.prepare(sql).run(thread.id);
    if (req.body.action === 'delete') {
      res.flash('success', 'Thread deleted.');
      return res.redirect(`/forum/${thread.category_slug}`);
    }
    res.redirect(`/t/${thread.id}`);
  });

  // ─── Posts ───────────────────────────────────────────────────────────────

  const loadOwnPost = (req) => {
    const id = intParam(req.params.id);
    const post = id && db.prepare('SELECT * FROM posts WHERE id = ? AND deleted = 0').get(id);
    if (!post) throw notFound('Post not found.');
    if (post.user_id !== req.user.id && !hasRole(req.user, 'mod')) throw forbidden('You can only change your own posts.');
    return post;
  };

  router.get('/p/:id/edit', requireUser, (req, res) => {
    const post = loadOwnPost(req);
    const thread = loadThread(String(post.thread_id));
    res.page({
      title: 'Edit post',
      active: '/forum',
      body: html`
        <p class="crumbs"><a href="/forum">Forums</a> › <a href="/t/${thread.id}">${thread.title}</a> ›</p>
        <h1>Edit post</h1>
        <form method="post" action="/p/${post.id}/edit" class="stack">
          ${csrfField(res)}
          <textarea name="body" rows="10" required maxlength="${MAX_BODY}" aria-label="Post">${post.body}</textarea>
          ${editorHelp()}
          <button class="btn">Save changes</button>
        </form>`,
    });
  });

  router.post('/p/:id/edit', requireUser, (req, res) => {
    const post = loadOwnPost(req);
    const body = text(req.body.body, MAX_BODY);
    if (!body) throw Object.assign(new Error('A post cannot be empty.'), { status: 400 });
    db.prepare('UPDATE posts SET body = ?, edited_at = ? WHERE id = ?').run(body, Date.now(), post.id);
    res.redirect(`/t/${post.thread_id}#p${post.id}`);
  });

  router.post('/p/:id/delete', requireUser, (req, res) => {
    const post = loadOwnPost(req);
    db.prepare('UPDATE posts SET deleted = 1 WHERE id = ?').run(post.id);
    res.flash('success', 'Post removed.');
    res.redirect(`/t/${post.thread_id}`);
  });

  return router;
};
