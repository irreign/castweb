'use strict';

const express = require('express');
const { transaction } = require('../db');
const { requireUser, requireRole, hasRole } = require('../auth');
const { html, csrfField, userLink, utcDate, toDateTimeLocal, daysLeft, markup } = require('../render');
const { notFound, intParam, text } = require('./util');

// Suggestions only: card tiers and positions are free text so the list can follow the game.
const RARITIES = ['Common', 'Rare', 'Epic', 'Legendary', 'Icon'];
const POSITIONS = ['GK', 'LB', 'CB', 'RB', 'LWB', 'RWB', 'CDM', 'CM', 'CAM', 'LM', 'RM', 'LW', 'RW', 'CF', 'ST'];

function currentSeason(db) {
  return (
    db.prepare('SELECT * FROM seasons WHERE is_current = 1 ORDER BY ends_at DESC LIMIT 1').get() ||
    db.prepare('SELECT * FROM seasons WHERE starts_at <= ? ORDER BY ends_at DESC LIMIT 1').get(Date.now()) ||
    null
  );
}

function seasonCountdown(season) {
  if (!season) {
    return html`<div class="countdown-card empty-season">
      <p class="eyebrow">Current season</p>
      <h2>No season set yet</h2>
      <p class="muted">A moderator can add the current season on the <a href="/season">Season page</a>.</p>
    </div>`;
  }
  const now = Date.now();
  const total = Math.max(1, season.ends_at - season.starts_at);
  const progress = Math.min(100, Math.max(0, Math.round(((now - season.starts_at) / total) * 100)));
  const ended = now >= season.ends_at;
  const notStarted = now < season.starts_at;
  return html`<div class="countdown-card">
    <p class="eyebrow">${notStarted ? 'Next season' : 'Current season'}</p>
    <h2><a href="/season/${season.id}">${season.name}</a></h2>
    <div class="countdown" data-ends="${season.ends_at}">
      <div><strong data-unit="days">${daysLeft(season.ends_at, now)}</strong><span>days</span></div>
      <div><strong data-unit="hours">–</strong><span>hours</span></div>
      <div><strong data-unit="minutes">–</strong><span>mins</span></div>
      <div><strong data-unit="seconds">–</strong><span>secs</span></div>
    </div>
    <p class="countdown-label">${ended ? 'This season has ended.' : html`Ends ${utcDate(season.ends_at)}`}</p>
    <progress class="season-progress" value="${progress}" max="100" aria-label="Season progress">${progress}%</progress>
  </div>`;
}

// <input type="datetime-local"> values are treated as UTC.
function parseUtc(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return NaN;
  return Date.parse(`${value}:00Z`);
}

function seasonForm(res, action, s = {}, error = '') {
  return html`
    ${error ? html`<p class="form-error" role="alert">${error}</p>` : ''}
    <form method="post" action="${action}" class="stack">
      ${csrfField(res)}
      <label>Season name <input name="name" value="${s.name || ''}" required maxlength="60" placeholder="Season 12"></label>
      <div class="row">
        <label>Starts (UTC) <input type="datetime-local" name="starts_at" value="${s.starts_at ? toDateTimeLocal(s.starts_at) : ''}" required></label>
        <label>Ends (UTC) <input type="datetime-local" name="ends_at" value="${s.ends_at ? toDateTimeLocal(s.ends_at) : ''}" required></label>
      </div>
      <label>Notes <textarea name="notes" rows="4" maxlength="5000" placeholder="Rewards, rule changes, special events…">${s.notes || ''}</textarea></label>
      <label class="check"><input type="checkbox" name="is_current" value="1" ${s.is_current ? 'checked' : ''}> This is the current season</label>
      <button class="btn">Save season</button>
    </form>`;
}

function readSeason(body) {
  const s = {
    name: text(body.name, 60),
    starts_at: parseUtc(body.starts_at),
    ends_at: parseUtc(body.ends_at),
    notes: text(body.notes, 5000),
    is_current: body.is_current === '1' ? 1 : 0,
  };
  let error = '';
  if (!s.name) error = 'Give the season a name.';
  else if (Number.isNaN(s.starts_at) || Number.isNaN(s.ends_at)) error = 'Enter both start and end dates.';
  else if (s.ends_at <= s.starts_at) error = 'The season must end after it starts.';
  return { s, error };
}

module.exports = ({ db }) => {
  const router = express.Router();

  const saveSeason = (s, id) =>
    transaction(db, () => {
      if (s.is_current) db.prepare('UPDATE seasons SET is_current = 0').run();
      if (id) {
        db.prepare('UPDATE seasons SET name = ?, starts_at = ?, ends_at = ?, notes = ?, is_current = ? WHERE id = ?').run(
          s.name, s.starts_at, s.ends_at, s.notes, s.is_current, id
        );
        return id;
      }
      return db
        .prepare('INSERT INTO seasons (name, starts_at, ends_at, notes, is_current) VALUES (?, ?, ?, ?, ?)')
        .run(s.name, s.starts_at, s.ends_at, s.notes, s.is_current).lastInsertRowid;
    });

  const renderSeason = (req, res, season, { error = '' } = {}) => {
    const seasons = db.prepare('SELECT id, name, starts_at, ends_at, is_current FROM seasons ORDER BY starts_at DESC').all();
    const isMod = hasRole(req.user, 'mod');
    const canAdd = req.user && (isMod || req.user.verified);

    let players = [];
    if (season) {
      players = db
        .prepare(
          `SELECT p.*, u.username, u.role, u.verified FROM pack_players p
             LEFT JOIN users u ON u.id = p.added_by
            WHERE p.season_id = ? ORDER BY p.pack_name, p.rating IS NULL, p.rating DESC, p.player_name`
        )
        .all(season.id);
    }
    const packs = new Map();
    for (const p of players) {
      if (!packs.has(p.pack_name)) packs.set(p.pack_name, []);
      packs.get(p.pack_name).push(p);
    }

    res.page({
      title: season ? season.name : 'Season',
      active: '/season',
      body: html`
        <div class="page-head">
          <h1>${season ? season.name : 'Season tracker'}</h1>
          ${season && isMod ? html`<a class="btn btn-ghost btn-small" href="/season/${season.id}/edit">Edit season</a>` : ''}
        </div>
        <div class="grid-2 season-top">
          ${seasonCountdown(season)}
          <section class="panel">
            <h2>About this season</h2>
            ${season
              ? html`<dl class="facts">
                  <dt>Started</dt><dd>${utcDate(season.starts_at)}</dd>
                  <dt>Ends</dt><dd>${utcDate(season.ends_at)}</dd>
                  <dt>Length</dt><dd>${Math.round((season.ends_at - season.starts_at) / 86400000)} days</dd>
                  <dt>Pack players</dt><dd>${players.length}</dd>
                </dl>
                ${season.notes ? html`<div class="prose">${markup(season.notes)}</div>` : ''}`
              : html`<p class="muted">No season has been added yet.</p>`}
          </section>
        </div>

        ${season
          ? html`<section class="panel">
              <header class="panel-head"><h2>Players in packs this season</h2></header>
              ${players.length
                ? [...packs].map(
                    ([pack, list]) => html`<h3 class="pack-name">${pack} <span class="muted">(${list.length})</span></h3>
                    <div class="table-wrap"><table>
                      <thead><tr><th class="num">Rating</th><th>Player</th><th>Pos</th><th>Club</th><th>Rarity</th><th>Notes</th><th>Added by</th>${isMod || req.user ? html`<th></th>` : ''}</tr></thead>
                      <tbody>${list.map(
                        (p) => html`<tr>
                          <td class="num"><span class="rating-badge rarity-${p.rarity.toLowerCase().replace(/[^a-z]/g, '')}">${p.rating ?? '–'}</span></td>
                          <td><strong>${p.player_name}</strong></td>
                          <td>${p.position || '–'}</td>
                          <td>${p.club || '–'}</td>
                          <td>${p.rarity || '–'}</td>
                          <td class="small">${p.notes}</td>
                          <td class="small">${p.username ? userLink(p) : '–'}</td>
                          ${isMod || req.user
                            ? html`<td>${isMod || (req.user && p.added_by === req.user.id)
                                ? html`<form method="post" action="/season/${season.id}/players/${p.id}/delete" class="inline" data-confirm="Remove ${p.player_name}?">${csrfField(res)}<button class="btn-link danger">Remove</button></form>`
                                : ''}</td>`
                            : ''}
                        </tr>`
                      )}</tbody>
                    </table></div>`
                  )
                : html`<p class="muted">No players listed yet for this season.</p>`}

              ${canAdd
                ? html`<details class="add-box" ${error ? 'open' : ''}>
                    <summary>Add a pack player</summary>
                    ${error ? html`<p class="form-error" role="alert">${error}</p>` : ''}
                    <form method="post" action="/season/${season.id}/players" class="stack">
                      ${csrfField(res)}
                      <div class="row">
                        <label>Player name <input name="player_name" required maxlength="60"></label>
                        <label>Pack <input name="pack_name" required maxlength="60" list="pack-names" placeholder="e.g. Season Pack"></label>
                        <datalist id="pack-names">${[...packs.keys()].map((n) => html`<option value="${n}">`)}</datalist>
                      </div>
                      <div class="row">
                        <label>Position <input name="position" maxlength="10" list="positions"></label>
                        <datalist id="positions">${POSITIONS.map((p) => html`<option value="${p}">`)}</datalist>
                        <label>Rating <input type="number" name="rating" min="1" max="150"></label>
                        <label>Rarity / tier <input name="rarity" maxlength="20" list="rarities"></label>
                        <datalist id="rarities">${RARITIES.map((r) => html`<option value="${r}">`)}</datalist>
                      </div>
                      <div class="row">
                        <label>Real-life club <input name="club" maxlength="60"></label>
                        <label>Notes <input name="notes" maxlength="200" placeholder="Drop rate, best use, etc."></label>
                      </div>
                      <button class="btn">Add player</button>
                    </form>
                  </details>`
                : req.user
                  ? html`<p class="muted small">Only <a href="/verify">verified managers</a> and moderators can add pack players. Post corrections in <a href="/forum/packs-transfers">Packs &amp; Players</a>.</p>`
                  : html`<p class="muted small"><a href="/login">Log in</a> to help keep this list up to date.</p>`}
            </section>`
          : ''}

        <section class="panel">
          <header class="panel-head"><h2>All seasons</h2></header>
          ${seasons.length
            ? html`<ul class="list">${seasons.map(
                (s) => html`<li><a class="list-title" href="/season/${s.id}">${s.name}</a>${s.is_current ? html` <span class="pill pill-green">Current</span>` : ''}<span class="meta">${utcDate(s.starts_at)} → ${utcDate(s.ends_at)}</span></li>`
              )}</ul>`
            : html`<p class="muted">No seasons yet.</p>`}
          ${isMod
            ? html`<details class="add-box"><summary>Add a season</summary>${seasonForm(res, '/season', { is_current: 1 })}</details>`
            : ''}
        </section>`,
    });
  };

  router.get('/season', (req, res) => renderSeason(req, res, currentSeason(db)));

  router.post('/season', requireRole('mod'), (req, res) => {
    const { s, error } = readSeason(req.body);
    if (error) {
      res.status(400);
      return res.page({ title: 'New season', body: html`<h1>New season</h1>${seasonForm(res, '/season', s, error)}` });
    }
    const id = saveSeason(s);
    res.flash('success', 'Season saved.');
    res.redirect(`/season/${id}`);
  });

  const loadSeason = (req) => {
    const id = intParam(req.params.id);
    const season = id && db.prepare('SELECT * FROM seasons WHERE id = ?').get(id);
    if (!season) throw notFound('Season not found.');
    return season;
  };

  router.get('/season/:id', (req, res) => renderSeason(req, res, loadSeason(req)));

  router.get('/season/:id/edit', requireRole('mod'), (req, res) => {
    const season = loadSeason(req);
    res.page({
      title: `Edit ${season.name}`,
      active: '/season',
      body: html`<h1>Edit ${season.name}</h1>
        ${seasonForm(res, `/season/${season.id}/edit`, season)}
        <form method="post" action="/season/${season.id}/delete" class="danger-zone" data-confirm="Delete this season and all its pack players?">
          ${csrfField(res)}<button class="btn btn-danger">Delete season</button>
        </form>`,
    });
  });

  router.post('/season/:id/edit', requireRole('mod'), (req, res) => {
    const season = loadSeason(req);
    const { s, error } = readSeason(req.body);
    if (error) {
      res.status(400);
      return res.page({ title: 'Edit season', body: html`<h1>Edit season</h1>${seasonForm(res, `/season/${season.id}/edit`, s, error)}` });
    }
    saveSeason(s, season.id);
    res.flash('success', 'Season updated.');
    res.redirect(`/season/${season.id}`);
  });

  router.post('/season/:id/delete', requireRole('mod'), (req, res) => {
    const season = loadSeason(req);
    db.prepare('DELETE FROM seasons WHERE id = ?').run(season.id);
    res.flash('success', `Deleted ${season.name}.`);
    res.redirect('/season');
  });

  router.post('/season/:id/players', requireUser, (req, res) => {
    const season = loadSeason(req);
    if (!hasRole(req.user, 'mod') && !req.user.verified) {
      throw Object.assign(new Error('Only verified managers can add pack players.'), { status: 403 });
    }
    const p = {
      player_name: text(req.body.player_name, 60),
      pack_name: text(req.body.pack_name, 60),
      position: text(req.body.position, 10).toUpperCase(),
      rarity: text(req.body.rarity, 20),
      rating: req.body.rating === '' || req.body.rating === undefined ? null : intParam(req.body.rating),
      club: text(req.body.club, 60),
      notes: text(req.body.notes, 200),
    };
    let error = '';
    if (!p.player_name || !p.pack_name) error = 'Player name and pack are required.';
    else if (p.rating !== null && (!p.rating || p.rating > 150)) error = 'Rating must be a number between 1 and 150.';
    if (error) {
      res.status(400);
      return renderSeason(req, res, season, { error });
    }
    db.prepare(
      `INSERT INTO pack_players (season_id, pack_name, player_name, position, rating, rarity, club, notes, added_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(season.id, p.pack_name, p.player_name, p.position, p.rating, p.rarity, p.club, p.notes, req.user.id, Date.now());
    res.flash('success', `Added ${p.player_name}.`);
    res.redirect(`/season/${season.id}`);
  });

  router.post('/season/:id/players/:pid/delete', requireUser, (req, res) => {
    const season = loadSeason(req);
    const player = db
      .prepare('SELECT * FROM pack_players WHERE id = ? AND season_id = ?')
      .get(intParam(req.params.pid) || 0, season.id);
    if (!player) throw notFound('Player not found.');
    if (!hasRole(req.user, 'mod') && player.added_by !== req.user.id) {
      throw Object.assign(new Error('You can only remove players you added.'), { status: 403 });
    }
    db.prepare('DELETE FROM pack_players WHERE id = ?').run(player.id);
    res.flash('success', `Removed ${player.player_name}.`);
    res.redirect(`/season/${season.id}`);
  });

  return router;
};

module.exports.currentSeason = currentSeason;
module.exports.seasonCountdown = seasonCountdown;
