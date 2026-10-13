'use strict';

// News tab: threads in the Announcements forum, newest first, with a short excerpt.

const express = require('express');
const { hasRole } = require('../auth');
const { html, userLink, dateTime } = require('../render');
const { t, tn } = require('../i18n');
const { paging } = require('./util');

const PER_PAGE = 10;

function excerpt(body, max = 260) {
  const plain = String(body)
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/\[\[([^\]]+)\]\]/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[#*>`_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return plain.length > max ? `${plain.slice(0, max).replace(/\s+\S*$/, '')}…` : plain;
}

module.exports = ({ db }) => {
  const router = express.Router();

  router.get('/news', async (req, res) => {
    const { page, perPage, offset } = paging(req, PER_PAGE);
    const items = await db.all(
      `SELECT t.id, t.title, t.created_at, t.post_count, t.pinned, u.username, u.role, u.verified,
              (SELECT body FROM posts p WHERE p.thread_id = t.id ORDER BY p.id LIMIT 1) AS body
         FROM threads t
         JOIN forum_categories c ON c.id = t.category_id
         JOIN users u ON u.id = t.user_id
        WHERE c.slug = 'announcements'
        ORDER BY t.pinned DESC, t.created_at DESC LIMIT ? OFFSET ?`,
      perPage + 1,
      offset
    );
    const more = items.length > perPage;

    res.page({
      title: t('nav.news'),
      active: '/news',
      body: html`
        <div class="page-head">
          <h1>${t('nav.news')}</h1>
          ${hasRole(req.user, 'mod') ? html`<a class="btn" href="/forum/announcements/new">${t('news.post')}</a>` : ''}
        </div>
        <p class="lead">${t('news.lead')}</p>
        ${items.length
          ? html`<div class="news-list">${items.slice(0, perPage).map(
              (n) => html`<article class="news-card${n.pinned ? ' pinned' : ''}">
                <p class="meta">${n.pinned ? html`<span class="pill">📌 ${t('forum.pinned')}</span> ` : ''}${dateTime(n.created_at)} · ${userLink(n)}</p>
                <h2><a href="/t/${n.id}">${n.title}</a></h2>
                <p>${excerpt(n.body || '')}</p>
                <a class="small" href="/t/${n.id}">${t('news.readMore')} · ${tn('news.comments', Math.max(0, n.post_count - 1))}</a>
              </article>`
            )}</div>
            <nav class="pager" aria-label="${t('common.pages')}">
              ${page > 1 ? html`<a href="/news?page=${page - 1}">← ${t('common.newer')}</a>` : ''}
              ${more ? html`<a href="/news?page=${page + 1}">${t('common.older')} →</a>` : ''}
            </nav>`
          : html`<p class="empty">${t('news.empty')}</p>`}`,
    });
  });

  return router;
};
