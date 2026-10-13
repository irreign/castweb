'use strict';

const express = require('express');
const { html, th, userLink, daysLeft } = require('../render');
const { t, tn, formatNumber } = require('../i18n');
const { currentSeason, seasonCountdown } = require('./season');

function tile(href, icon, title, line, extra = '') {
  return html`<a class="tile" href="${href}">
    <span class="tile-icon" aria-hidden="true">${icon}</span>
    <span class="tile-body"><strong>${title}</strong><span class="tile-line">${line}</span>${extra}</span>
    <span class="tile-arrow" aria-hidden="true">›</span>
  </a>`;
}

module.exports = ({ db }) => {
  const router = express.Router();

  router.get('/', async (req, res) => {
    const season = await currentSeason(db);
    const stats = await db.get(
      `SELECT (SELECT COUNT(*) FROM users) AS users,
              (SELECT COUNT(*) FROM users WHERE verified = 1) AS verified,
              (SELECT COUNT(*) FROM posts p JOIN threads t ON t.id = p.thread_id
                 JOIN forum_categories c ON c.id = t.category_id
                WHERE p.deleted = 0 AND c.slug != 'announcements') AS posts,
              (SELECT COUNT(*) FROM wiki_pages) AS pages,
              (SELECT COUNT(*) FROM fas) AS fas,
              (SELECT title FROM threads t JOIN forum_categories c ON c.id = t.category_id
                WHERE c.slug = 'announcements' ORDER BY t.created_at DESC LIMIT 1) AS latest_news,
              (SELECT title FROM threads t JOIN forum_categories c ON c.id = t.category_id
                WHERE c.slug != 'announcements' ORDER BY t.last_post_at DESC LIMIT 1) AS latest_thread,
              (SELECT name FROM fas ORDER BY points DESC, name LIMIT 1) AS top_fa,
              (SELECT COUNT(*) FROM pack_players WHERE season_id = ?) AS pack_players`,
      season ? season.id : 0
    );
    const friends = req.user
      ? await db.get(
          `SELECT (SELECT COUNT(*) FROM friendships WHERE status = 'accepted' AND (requester_id = ? OR addressee_id = ?)) AS friends,
                  (SELECT COUNT(*) FROM friendships WHERE status = 'pending' AND addressee_id = ?) AS requests`,
          req.user.id, req.user.id, req.user.id
        )
      : null;

    res.page({
      active: '/',
      body: html`
        <section class="hero pitch">
          <div class="hero-text">
            <p class="eyebrow">${t('home.eyebrow')}</p>
            <h1>${t('home.title')}</h1>
            <p class="lead">${t('home.lead')}</p>
            <div class="hero-actions">
              ${req.user
                ? html`<a class="btn" href="/forum">${t('home.goChat')}</a> ${req.user.verified ? '' : html`<a class="btn btn-ghost" href="/verify">${t('home.getTick')}</a>`}`
                : html`<a class="btn" href="/register">${t('home.joinFree')}</a> <a class="btn btn-ghost" href="/forum">${t('home.browse')}</a>`}
            </div>
            <ul class="stats">
              <li>${th('home.statManagers', { n: html`<strong>${formatNumber(stats.users)}</strong>`, count: stats.users })}</li>
              <li>${th('home.statVerified', { n: html`<strong>${formatNumber(stats.verified)}</strong>`, count: stats.verified })}</li>
              <li>${th('home.statPosts', { n: html`<strong>${formatNumber(stats.posts)}</strong>`, count: stats.posts })}</li>
            </ul>
          </div>
          ${seasonCountdown(season)}
        </section>

        <h2 class="section-title">${t('home.explore')}</h2>
        <div class="tiles">
          ${tile('/news', '📰', t('nav.news'), stats.latest_news || t('home.noNews'))}
          ${tile('/forum', '💬', t('nav.chat'), stats.latest_thread ? t('home.latestThread', { title: stats.latest_thread }) : t('home.chatEmpty'), html`<span class="tile-meta">${tn('home.posts', stats.posts)}</span>`)}
          ${tile('/fas', '🛡️', t('nav.federations'), tn('home.federationsListed', stats.fas), stats.top_fa ? html`<span class="tile-meta">🥇 ${stats.top_fa}</span>` : '')}
          ${tile(
            '/friends',
            '🤝',
            t('nav.friends'),
            friends ? tn('home.friendsCount', friends.friends) : t('home.friendsLoggedOut'),
            friends && friends.requests ? html`<span class="tile-meta tile-alert">${tn('home.friendRequests', friends.requests)}</span>` : ''
          )}
          ${tile(
            '/season',
            '⏱️',
            t('nav.season'),
            season ? tn('home.daysLeft', daysLeft(season.ends_at), { season: season.name }) : t('home.noSeason'),
            season ? html`<span class="tile-meta">${tn('home.packPlayers', stats.pack_players)}</span>` : ''
          )}
          ${tile('/wiki', '📖', t('nav.wiki'), tn('home.wikiPages', stats.pages))}
          ${tile('/rankings', '🏆', t('nav.rankings'), stats.top_fa ? t('home.topFa', { name: stats.top_fa }) : t('home.rankingsEmpty'))}
          ${tile('/report', '🚩', t('nav.report'), t('home.reportLine'))}
        </div>`,
    });
  });

  router.get('/rankings', async (req, res) => {
    const fas = await db.all(`SELECT f.*, (SELECT COUNT(*) FROM users u WHERE u.fa_id = f.id) AS site_members
           FROM fas f ORDER BY f.points DESC, f.name LIMIT 100`);
    const contributors = (
      await db.all(`SELECT u.username, u.role, u.verified,
                (SELECT COUNT(*) FROM posts p WHERE p.user_id = u.id AND p.deleted = 0) AS posts,
                (SELECT COUNT(*) FROM wiki_revisions r WHERE r.user_id = u.id) AS edits
           FROM users u WHERE u.banned = 0
          ORDER BY posts + edits * 2 DESC, u.created_at
          LIMIT 20`)
    ).filter((u) => u.posts + u.edits > 0);

    res.page({
      title: t('nav.rankings'),
      active: '/rankings',
      body: html`
        <h1>${t('nav.rankings')}</h1>
        <section class="panel">
          <header class="panel-head"><h2>${t('rankings.topFas')}</h2><a href="/fas">${t('rankings.directory')} →</a></header>
          <p class="muted small">${t('rankings.pointsNote')}</p>
          ${fas.length
            ? html`<div class="table-wrap"><table>
                <thead><tr><th>#</th><th>${t('fa.federation')}</th><th>${t('fa.region')}</th><th class="num">${t('fa.members')}</th><th class="num">${t('fa.points')}</th><th></th></tr></thead>
                <tbody>${fas.map(
                  (f, i) => html`<tr class="${i < 3 ? `podium podium-${i + 1}` : ''}">
                    <td class="rank-cell"><span class="rank">${i + 1}</span></td>
                    <td><a href="/fas/${f.id}">${f.name}</a>${f.tag ? html` <span class="tag">${f.tag}</span>` : ''}</td>
                    <td>${f.region || '–'}</td>
                    <td class="num">${formatNumber(f.members_count || f.site_members)}</td>
                    <td class="num">${formatNumber(f.points)}</td>
                    <td>${f.recruiting ? html`<span class="pill pill-green">${t('fa.recruiting')}</span>` : ''}</td>
                  </tr>`
                )}</tbody></table></div>`
            : html`<p class="muted">${t('rankings.noFas')}</p>`}
        </section>
        <section class="panel">
          <header class="panel-head"><h2>${t('rankings.contributors')}</h2></header>
          <p class="muted small">${t('rankings.contributorsNote')}</p>
          ${contributors.length
            ? html`<div class="table-wrap"><table>
                <thead><tr><th>#</th><th>${t('rankings.manager')}</th><th class="num">${t('rankings.posts')}</th><th class="num">${t('rankings.edits')}</th></tr></thead>
                <tbody>${contributors.map(
                  (u, i) => html`<tr><td class="rank-cell"><span class="rank">${i + 1}</span></td><td>${userLink(u)}</td><td class="num">${formatNumber(u.posts)}</td><td class="num">${formatNumber(u.edits)}</td></tr>`
                )}</tbody></table></div>`
            : html`<p class="muted">${t('rankings.noContributors')}</p>`}
        </section>`,
    });
  });

  router.get('/rules', async (req, res) => {
    res.page({
      title: t('nav.rules'),
      body: html`
        <article class="prose">
          <h1>${t('nav.rules')}</h1>
          <ol>
            ${[1, 2, 3, 4, 5, 6].map(
              (i) => html`<li><strong>${t(`rules.r${i}.title`)}</strong> ${t(`rules.r${i}.text`)}</li>`
            )}
          </ol>
          <p>${t('rules.footer')}</p>
        </article>`,
    });
  });

  return router;
};
