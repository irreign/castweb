'use strict';

const express = require('express');
const { requireUser, requireRole, hasRole } = require('../auth');
const { html, th, csrfField, userLink, utcDate, toDateTimeLocal, daysLeft, markup } = require('../render');
const { t, tn } = require('../i18n');
const { notFound, intParam, text } = require('./util');

// Suggestions only: card tiers and positions are free text so the list can follow the game.
const RARITIES = ['Common', 'Rare', 'Epic', 'Legendary', 'Icon'];
const POSITIONS = ['GK', 'LB', 'CB', 'RB', 'LWB', 'RWB', 'CDM', 'CM', 'CAM', 'LM', 'RM', 'LW', 'RW', 'CF', 'ST'];

async function currentSeason(db) {
  return (
    (await db.get('SELECT * FROM seasons WHERE is_current = 1 ORDER BY ends_at DESC LIMIT 1')) ||
    (await db.get('SELECT * FROM seasons WHERE starts_at <= ? ORDER BY ends_at DESC LIMIT 1', Date.now())) ||
    null
  );
}

function seasonCountdown(season) {
  if (!season) {
    return html`<div class="countdown-card empty-season">
      <p class="eyebrow">${t('season.current')}</p>
      <h2>${t('season.noneSet')}</h2>
      <p class="muted">${t('season.noneSetHint')}</p>
    </div>`;
  }
  const now = Date.now();
  const total = Math.max(1, season.ends_at - season.starts_at);
  const progress = Math.min(100, Math.max(0, Math.round(((now - season.starts_at) / total) * 100)));
  const ended = now >= season.ends_at;
  const notStarted = now < season.starts_at;
  return html`<div class="countdown-card">
    <p class="eyebrow">${notStarted ? t('season.next') : t('season.current')}</p>
    <h2><a href="/season/${season.id}">${season.name}</a></h2>
    <div class="countdown" data-ends="${season.ends_at}">
      <div><strong data-unit="days">${daysLeft(season.ends_at, now)}</strong><span>${t('season.days')}</span></div>
      <div><strong data-unit="hours">–</strong><span>${t('season.hours')}</span></div>
      <div><strong data-unit="minutes">–</strong><span>${t('season.minutes')}</span></div>
      <div><strong data-unit="seconds">–</strong><span>${t('season.seconds')}</span></div>
    </div>
    <p class="countdown-label">${ended ? t('season.ended') : t('season.endsAt', { date: utcDate(season.ends_at) })}</p>
    <progress class="season-progress" value="${progress}" max="100" aria-label="${t('season.progress')}">${progress}%</progress>
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
      <label>${t('season.name')} <input name="name" value="${s.name || ''}" required maxlength="60" placeholder="${t('season.namePlaceholder')}"></label>
      <div class="row">
        <label>${t('season.startsUtc')} <input type="datetime-local" name="starts_at" value="${s.starts_at ? toDateTimeLocal(s.starts_at) : ''}" required></label>
        <label>${t('season.endsUtc')} <input type="datetime-local" name="ends_at" value="${s.ends_at ? toDateTimeLocal(s.ends_at) : ''}" required></label>
      </div>
      <label>${t('season.notes')} <textarea name="notes" rows="4" maxlength="5000" placeholder="${t('season.notesHint')}">${s.notes || ''}</textarea></label>
      <label class="check"><input type="checkbox" name="is_current" value="1" ${s.is_current ? 'checked' : ''}> ${t('season.isCurrent')}</label>
      <button class="btn">${t('season.save')}</button>
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
  if (!s.name) error = t('season.needName');
  else if (Number.isNaN(s.starts_at) || Number.isNaN(s.ends_at)) error = t('season.needDates');
  else if (s.ends_at <= s.starts_at) error = t('season.endAfterStart');
  return { s, error };
}

module.exports = ({ db }) => {
  const router = express.Router();

  // Saves a season (new when no id) and returns its id. Only one season can be current.
  const saveSeason = async (s, id) => {
    const statements = s.is_current ? [['UPDATE seasons SET is_current = 0']] : [];
    statements.push(
      id
        ? ['UPDATE seasons SET name = ?, starts_at = ?, ends_at = ?, notes = ?, is_current = ? WHERE id = ?', s.name, s.starts_at, s.ends_at, s.notes, s.is_current, id]
        : ['INSERT INTO seasons (name, starts_at, ends_at, notes, is_current) VALUES (?, ?, ?, ?, ?)', s.name, s.starts_at, s.ends_at, s.notes, s.is_current]
    );
    const results = await db.batch(statements);
    return id || results[results.length - 1].lastInsertRowid;
  };

  const renderSeason = async (req, res, season, { error = '' } = {}) => {
    const seasons = await db.all('SELECT id, name, starts_at, ends_at, is_current FROM seasons ORDER BY starts_at DESC');
    const isMod = hasRole(req.user, 'mod');
    const canAdd = req.user && (isMod || req.user.verified);

    let players = [];
    if (season) {
      players = await db.all(`SELECT p.*, u.username, u.role, u.verified FROM pack_players p
             LEFT JOIN users u ON u.id = p.added_by
            WHERE p.season_id = ? ORDER BY p.pack_name, p.rating IS NULL, p.rating DESC, p.player_name`, season.id);
    }
    const packs = new Map();
    for (const p of players) {
      if (!packs.has(p.pack_name)) packs.set(p.pack_name, []);
      packs.get(p.pack_name).push(p);
    }

    res.page({
      title: season ? season.name : t('nav.season'),
      active: '/season',
      body: html`
        <div class="page-head">
          <h1>${season ? season.name : t('season.tracker')}</h1>
          ${season && isMod ? html`<a class="btn btn-ghost btn-small" href="/season/${season.id}/edit">${t('season.edit')}</a>` : ''}
        </div>
        <div class="grid-2 season-top">
          ${seasonCountdown(season)}
          <section class="panel">
            <h2>${t('season.about')}</h2>
            ${season
              ? html`<dl class="facts">
                  <dt>${t('season.started')}</dt><dd>${utcDate(season.starts_at)}</dd>
                  <dt>${t('season.ends')}</dt><dd>${utcDate(season.ends_at)}</dd>
                  <dt>${t('season.length')}</dt><dd>${tn('season.daysCount', Math.round((season.ends_at - season.starts_at) / 86400000))}</dd>
                  <dt>${t('season.packPlayers')}</dt><dd>${players.length}</dd>
                </dl>
                ${season.notes ? html`<div class="prose">${markup(season.notes)}</div>` : ''}`
              : html`<p class="muted">${t('season.noneYet')}</p>`}
          </section>
        </div>

        ${season
          ? html`<section class="panel">
              <header class="panel-head"><h2>${t('season.playersTitle')}</h2></header>
              ${players.length
                ? [...packs].map(
                    ([pack, list]) => html`<h3 class="pack-name">${pack} <span class="muted">(${list.length})</span></h3>
                    <div class="table-wrap"><table>
                      <thead><tr><th class="num">${t('season.rating')}</th><th>${t('season.player')}</th><th>${t('season.pos')}</th><th>${t('season.club')}</th><th>${t('season.rarity')}</th><th>${t('season.notes')}</th><th>${t('season.addedBy')}</th>${isMod || req.user ? html`<th></th>` : ''}</tr></thead>
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
                                ? html`<form method="post" action="/season/${season.id}/players/${p.id}/delete" class="inline" data-confirm="${t('season.removeConfirm', { name: p.player_name })}">${csrfField(res)}<button class="btn-link danger">${t('common.remove')}</button></form>`
                                : ''}</td>`
                            : ''}
                        </tr>`
                      )}</tbody>
                    </table></div>`
                  )
                : html`<p class="muted">${t('season.noPlayers')}</p>`}

              ${canAdd
                ? html`<details class="add-box" ${error ? 'open' : ''}>
                    <summary>${t('season.addPlayer')}</summary>
                    ${error ? html`<p class="form-error" role="alert">${error}</p>` : ''}
                    <form method="post" action="/season/${season.id}/players" class="stack">
                      ${csrfField(res)}
                      <div class="row">
                        <label>${t('season.playerName')} <input name="player_name" required maxlength="60"></label>
                        <label>${t('season.pack')} <input name="pack_name" required maxlength="60" list="pack-names" placeholder="${t('season.packHint')}"></label>
                        <datalist id="pack-names">${[...packs.keys()].map((n) => html`<option value="${n}">`)}</datalist>
                      </div>
                      <div class="row">
                        <label>${t('season.position')} <input name="position" maxlength="10" list="positions"></label>
                        <datalist id="positions">${POSITIONS.map((p) => html`<option value="${p}">`)}</datalist>
                        <label>${t('season.rating')} <input type="number" name="rating" min="1" max="150"></label>
                        <label>${t('season.rarityTier')} <input name="rarity" maxlength="20" list="rarities"></label>
                        <datalist id="rarities">${RARITIES.map((r) => html`<option value="${r}">`)}</datalist>
                      </div>
                      <div class="row">
                        <label>${t('season.realClub')} <input name="club" maxlength="60"></label>
                        <label>${t('season.notes')} <input name="notes" maxlength="200" placeholder="${t('season.playerNotesHint')}"></label>
                      </div>
                      <button class="btn">${t('season.addPlayerButton')}</button>
                    </form>
                  </details>`
                : req.user
                  ? html`<p class="muted small">${th('season.onlyVerified', { verify: html`<a href="/verify">${t('nav.verify')}</a>`, forum: html`<a href="/forum/packs-transfers">${t('cat.packs-transfers.name')}</a>` })}</p>`
                  : html`<p class="muted small">${th('season.loginToHelp', { link: html`<a href="/login?next=/season">${t('nav.login')}</a>` })}</p>`}
            </section>`
          : ''}

        <section class="panel">
          <header class="panel-head"><h2>${t('season.all')}</h2></header>
          ${seasons.length
            ? html`<ul class="list">${seasons.map(
                (s) => html`<li><a class="list-title" href="/season/${s.id}">${s.name}</a>${s.is_current ? html` <span class="pill pill-green">${t('wiki.current')}</span>` : ''}<span class="meta">${utcDate(s.starts_at)} → ${utcDate(s.ends_at)}</span></li>`
              )}</ul>`
            : html`<p class="muted">${t('season.noSeasons')}</p>`}
          ${isMod
            ? html`<details class="add-box"><summary>${t('season.add')}</summary>${seasonForm(res, '/season', { is_current: 1 })}</details>`
            : ''}
        </section>`,
    });
  };

  router.get('/season', async (req, res) => renderSeason(req, res, await currentSeason(db)));

  router.post('/season', requireRole('mod'), async (req, res) => {
    const { s, error } = readSeason(req.body);
    if (error) {
      res.status(400);
      return res.page({ title: t('season.add'), body: html`<h1>${t('season.add')}</h1>${seasonForm(res, '/season', s, error)}` });
    }
    const id = await saveSeason(s);
    res.flash('success', t('season.saved'));
    res.redirect(`/season/${id}`);
  });

  const loadSeason = async (req) => {
    const id = intParam(req.params.id);
    const season = id && await db.get('SELECT * FROM seasons WHERE id = ?', id);
    if (!season) throw notFound(t('season.notFound'));
    return season;
  };

  router.get('/season/:id', async (req, res) => renderSeason(req, res, await loadSeason(req)));

  router.get('/season/:id/edit', requireRole('mod'), async (req, res) => {
    const season = await loadSeason(req);
    res.page({
      title: t('season.editNamed', { name: season.name }),
      active: '/season',
      body: html`<h1>${t('season.editNamed', { name: season.name })}</h1>
        ${seasonForm(res, `/season/${season.id}/edit`, season)}
        <form method="post" action="/season/${season.id}/delete" class="danger-zone" data-confirm="${t('season.deleteConfirm')}">
          ${csrfField(res)}<button class="btn btn-danger">${t('season.delete')}</button>
        </form>`,
    });
  });

  router.post('/season/:id/edit', requireRole('mod'), async (req, res) => {
    const season = await loadSeason(req);
    const { s, error } = readSeason(req.body);
    if (error) {
      res.status(400);
      return res.page({ title: t('season.edit'), body: html`<h1>${t('season.edit')}</h1>${seasonForm(res, `/season/${season.id}/edit`, s, error)}` });
    }
    await saveSeason(s, season.id);
    res.flash('success', t('season.updated'));
    res.redirect(`/season/${season.id}`);
  });

  router.post('/season/:id/delete', requireRole('mod'), async (req, res) => {
    const season = await loadSeason(req);
    await db.run('DELETE FROM seasons WHERE id = ?', season.id);
    res.flash('success', t('season.deleted', { name: season.name }));
    res.redirect('/season');
  });

  router.post('/season/:id/players', requireUser, async (req, res) => {
    const season = await loadSeason(req);
    if (!hasRole(req.user, 'mod') && !req.user.verified) {
      throw Object.assign(new Error(t('season.onlyVerifiedError')), { status: 403 });
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
    if (!p.player_name || !p.pack_name) error = t('season.needPlayer');
    else if (p.rating !== null && (!p.rating || p.rating > 150)) error = t('season.badRating');
    if (error) {
      res.status(400);
      return renderSeason(req, res, season, { error });
    }
    await db.run(`INSERT INTO pack_players (season_id, pack_name, player_name, position, rating, rarity, club, notes, added_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, season.id, p.pack_name, p.player_name, p.position, p.rating, p.rarity, p.club, p.notes, req.user.id, Date.now());
    res.flash('success', t('season.playerAdded', { name: p.player_name }));
    res.redirect(`/season/${season.id}`);
  });

  router.post('/season/:id/players/:pid/delete', requireUser, async (req, res) => {
    const season = await loadSeason(req);
    const player = await db.get('SELECT * FROM pack_players WHERE id = ? AND season_id = ?', intParam(req.params.pid) || 0, season.id);
    if (!player) throw notFound(t('season.playerNotFound'));
    if (!hasRole(req.user, 'mod') && player.added_by !== req.user.id) {
      throw Object.assign(new Error(t('season.ownPlayersOnly')), { status: 403 });
    }
    await db.run('DELETE FROM pack_players WHERE id = ?', player.id);
    res.flash('success', t('season.playerRemoved', { name: player.player_name }));
    res.redirect(`/season/${season.id}`);
  });

  return router;
};

module.exports.currentSeason = currentSeason;
module.exports.seasonCountdown = seasonCountdown;
