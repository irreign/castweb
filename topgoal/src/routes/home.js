'use strict';

const express = require('express');
const { html, userLink, dateTime } = require('../render');
const { currentSeason, seasonCountdown } = require('./season');

module.exports = ({ db }) => {
  const router = express.Router();

  router.get('/', (req, res) => {
    const season = currentSeason(db);
    const packPlayers = season
      ? db
          .prepare(
            'SELECT * FROM pack_players WHERE season_id = ? ORDER BY rating IS NULL, rating DESC, player_name LIMIT 6'
          )
          .all(season.id)
      : [];
    const threads = db
      .prepare(
        `SELECT t.id, t.title, t.post_count, t.last_post_at, c.name AS category, c.slug AS category_slug,
                u.username, u.role, u.verified
           FROM threads t
           JOIN forum_categories c ON c.id = t.category_id
           JOIN users u ON u.id = t.user_id
          ORDER BY t.last_post_at DESC LIMIT 8`
      )
      .all();
    const wiki = db.prepare('SELECT slug, title, updated_at FROM wiki_pages ORDER BY updated_at DESC LIMIT 6').all();
    const topFas = db.prepare('SELECT id, name, tag, points, recruiting FROM fas ORDER BY points DESC, name LIMIT 5').all();
    const stats = db
      .prepare(
        `SELECT (SELECT COUNT(*) FROM users) AS users,
                (SELECT COUNT(*) FROM users WHERE verified = 1) AS verified,
                (SELECT COUNT(*) FROM posts WHERE deleted = 0) AS posts,
                (SELECT COUNT(*) FROM wiki_pages) AS pages`
      )
      .get();

    res.page({
      active: '/',
      body: html`
        <section class="hero">
          <div class="hero-text">
            <p class="eyebrow">Fan community for TopGoal on iPhone</p>
            <h1>Talk to every FA, not just your own.</h1>
            <p class="lead">In TopGoal you can only chat inside your own FA. TopGoal Hub is where managers from every FA meet: forums, a player-written wiki, season countdowns, pack players and FA rankings.</p>
            <div class="hero-actions">
              ${req.user
                ? html`<a class="btn" href="/forum">Go to the forums</a> ${req.user.verified ? '' : html`<a class="btn btn-ghost" href="/verify">Get your blue tick</a>`}`
                : html`<a class="btn" href="/register">Join free</a> <a class="btn btn-ghost" href="/forum">Browse the forums</a>`}
            </div>
            <ul class="stats">
              <li><strong>${stats.users}</strong> managers</li>
              <li><strong>${stats.verified}</strong> verified</li>
              <li><strong>${stats.posts}</strong> posts</li>
              <li><strong>${stats.pages}</strong> wiki pages</li>
            </ul>
          </div>
          ${seasonCountdown(season)}
        </section>

        <div class="grid-2">
          <section class="panel">
            <header class="panel-head"><h2>Latest discussions</h2><a href="/forum">All forums →</a></header>
            ${threads.length
              ? html`<ul class="list">${threads.map(
                  (t) => html`<li>
                    <a class="list-title" href="/t/${t.id}">${t.title}</a>
                    <span class="meta"><a href="/forum/${t.category_slug}">${t.category}</a> · ${userLink(t)} · ${t.post_count} ${t.post_count === 1 ? 'post' : 'posts'} · ${dateTime(t.last_post_at)}</span>
                  </li>`
                )}</ul>`
              : html`<p class="muted">No threads yet. <a href="/forum">Start the first one</a>.</p>`}
          </section>

          <section class="panel">
            <header class="panel-head"><h2>Top FAs</h2><a href="/rankings">Full rankings →</a></header>
            ${topFas.length
              ? html`<ol class="rank-list">${topFas.map(
                  (f, i) => html`<li><span class="rank">${i + 1}</span><a href="/fas/${f.id}">${f.name}</a>${f.tag ? html` <span class="tag">${f.tag}</span>` : ''}${f.recruiting ? html` <span class="pill pill-green">Recruiting</span>` : ''}<span class="points">${f.points.toLocaleString('en')} pts</span></li>`
                )}</ol>`
              : html`<p class="muted">No FAs listed yet. <a href="/fas/new">Add your FA</a>.</p>`}
          </section>

          <section class="panel">
            <header class="panel-head"><h2>Pack players this season</h2><a href="/season">Season page →</a></header>
            ${packPlayers.length
              ? html`<ul class="player-chips">${packPlayers.map(
                  (p) => html`<li class="player-chip rarity-${p.rarity.toLowerCase().replace(/[^a-z]/g, '')}">
                    <span class="rating">${p.rating ?? '–'}</span>
                    <span><strong>${p.player_name}</strong><small>${[p.position, p.pack_name].filter(Boolean).join(' · ')}</small></span>
                  </li>`
                )}</ul>`
              : html`<p class="muted">No pack players listed for this season yet.</p>`}
          </section>

          <section class="panel">
            <header class="panel-head"><h2>Recently updated wiki pages</h2><a href="/wiki">Wiki →</a></header>
            ${wiki.length
              ? html`<ul class="list">${wiki.map(
                  (w) => html`<li><a class="list-title" href="/wiki/${w.slug}">${w.title}</a><span class="meta">${dateTime(w.updated_at)}</span></li>`
                )}</ul>`
              : html`<p class="muted">The wiki is empty. Create an account to start it.</p>`}
          </section>
        </div>`,
    });
  });

  router.get('/rankings', (req, res) => {
    const fas = db
      .prepare(
        `SELECT f.*, (SELECT COUNT(*) FROM users u WHERE u.fa_id = f.id) AS site_members
           FROM fas f ORDER BY f.points DESC, f.name LIMIT 100`
      )
      .all();
    const contributors = db
      .prepare(
        `SELECT u.username, u.role, u.verified,
                (SELECT COUNT(*) FROM posts p WHERE p.user_id = u.id AND p.deleted = 0) AS posts,
                (SELECT COUNT(*) FROM wiki_revisions r WHERE r.user_id = u.id) AS edits
           FROM users u WHERE u.banned = 0
          ORDER BY posts + edits * 2 DESC, u.created_at
          LIMIT 20`
      )
      .all()
      .filter((u) => u.posts + u.edits > 0);

    res.page({
      title: 'Rankings',
      active: '/rankings',
      body: html`
        <h1>Rankings</h1>
        <section class="panel">
          <header class="panel-head"><h2>Top FAs</h2><a href="/fas">FA directory →</a></header>
          <p class="muted small">FA points are updated by moderators from in-game standings. Spot something out of date? Post in <a href="/forum/fa-recruitment">FA Recruitment</a>.</p>
          ${fas.length
            ? html`<div class="table-wrap"><table>
                <thead><tr><th>#</th><th>FA</th><th>Region</th><th class="num">Members</th><th class="num">Points</th><th></th></tr></thead>
                <tbody>${fas.map(
                  (f, i) => html`<tr>
                    <td class="rank-cell">${i + 1}</td>
                    <td><a href="/fas/${f.id}">${f.name}</a>${f.tag ? html` <span class="tag">${f.tag}</span>` : ''}</td>
                    <td>${f.region || '–'}</td>
                    <td class="num">${f.members_count || f.site_members}</td>
                    <td class="num">${f.points.toLocaleString('en')}</td>
                    <td>${f.recruiting ? html`<span class="pill pill-green">Recruiting</span>` : ''}</td>
                  </tr>`
                )}</tbody></table></div>`
            : html`<p class="muted">No FAs listed yet.</p>`}
        </section>
        <section class="panel">
          <header class="panel-head"><h2>Top community contributors</h2></header>
          <p class="muted small">Forum posts plus wiki edits (wiki edits count double).</p>
          ${contributors.length
            ? html`<div class="table-wrap"><table>
                <thead><tr><th>#</th><th>Manager</th><th class="num">Posts</th><th class="num">Wiki edits</th></tr></thead>
                <tbody>${contributors.map(
                  (u, i) => html`<tr><td class="rank-cell">${i + 1}</td><td>${userLink(u)}</td><td class="num">${u.posts}</td><td class="num">${u.edits}</td></tr>`
                )}</tbody></table></div>`
            : html`<p class="muted">Nobody has posted yet.</p>`}
        </section>`,
    });
  });

  router.get('/rules', (req, res) => {
    res.page({
      title: 'Community rules',
      body: html`
        <article class="prose">
          <h1>Community rules</h1>
          <ol>
            <li><strong>Be respectful.</strong> Rival FAs are welcome here. No harassment, hate speech or threats.</li>
            <li><strong>No cheating or exploits.</strong> Don't share hacks, account selling or ways to break the game's terms.</li>
            <li><strong>No account trading or scams.</strong> Never share your game login with anyone.</li>
            <li><strong>Blue ticks are earned.</strong> Only verify your own in-game account. Impersonation gets you banned.</li>
            <li><strong>Keep the wiki accurate.</strong> Add sources or screenshots when you can, and don't vandalise pages.</li>
            <li><strong>Use the right forum.</strong> Recruitment posts go in FA Recruitment, bugs go in Help &amp; Bugs.</li>
          </ol>
          <p>Moderators can edit or remove posts, lock threads and suspend accounts that break these rules.</p>
        </article>`,
    });
  });

  return router;
};

