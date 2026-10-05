'use strict';

const express = require('express');
const { transaction } = require('../db');
const { requireUser, requireRole, hasRole } = require('../auth');
const { html, csrfField, userLink, dateTime, markup } = require('../render');
const { notFound, forbidden, intParam, text } = require('./util');

module.exports = ({ db }) => {
  const router = express.Router();

  const loadFa = (idParam) => {
    const id = intParam(idParam);
    const fa = id && db.prepare('SELECT * FROM fas WHERE id = ?').get(id);
    if (!fa) throw notFound('FA not found.');
    return fa;
  };

  const canManage = (user, fa) => Boolean(user) && (hasRole(user, 'mod') || fa.leader_user_id === user.id);
  const canCreate = (user) => Boolean(user) && (user.verified || hasRole(user, 'mod'));

  const readFa = (body, isMod) => {
    const fa = {
      name: text(body.name, 40),
      tag: text(body.tag, 8),
      region: text(body.region, 40),
      description: text(body.description, 5000),
      recruiting: body.recruiting === '1' ? 1 : 0,
      members_count: Math.min(500, intParam(body.members_count) || 0),
    };
    if (isMod) {
      fa.points = Math.min(2_000_000_000, intParam(body.points) || 0);
      fa.leader = text(body.leader, 24);
    }
    return fa;
  };

  const faForm = (res, action, fa, { isMod, error = '', leaderName = '' } = {}) => html`
    ${error ? html`<p class="form-error" role="alert">${error}</p>` : ''}
    <form method="post" action="${action}" class="stack">
      ${csrfField(res)}
      <div class="row">
        <label>FA name <input name="name" value="${fa.name || ''}" required maxlength="40"></label>
        <label>Tag <input name="tag" value="${fa.tag || ''}" maxlength="8" placeholder="e.g. LDN"></label>
      </div>
      <div class="row">
        <label>Region / language <input name="region" value="${fa.region || ''}" maxlength="40" placeholder="e.g. Singapore, English"></label>
        <label>Members in game <input type="number" name="members_count" value="${fa.members_count || ''}" min="0" max="500"></label>
      </div>
      <label>About the FA <textarea name="description" rows="6" maxlength="5000" placeholder="Play style, activity requirements, how to apply…">${fa.description || ''}</textarea></label>
      <label class="check"><input type="checkbox" name="recruiting" value="1" ${fa.recruiting ? 'checked' : ''}> We are recruiting</label>
      ${isMod
        ? html`<fieldset class="mod-fields">
            <legend>Moderator only</legend>
            <div class="row">
              <label>Ranking points <input type="number" name="points" value="${fa.points ?? 0}" min="0"></label>
              <label>Leader's site username <input name="leader" value="${leaderName}" maxlength="24"></label>
            </div>
          </fieldset>`
        : ''}
      <button class="btn">Save FA</button>
    </form>`;

  // ─── Directory ───────────────────────────────────────────────────────────

  router.get('/fas', (req, res) => {
    const q = text(req.query.q, 40);
    const recruiting = req.query.recruiting === '1';
    const where = [];
    const params = [];
    if (q) {
      where.push("(f.name LIKE ? ESCAPE '\\' OR f.tag LIKE ? ESCAPE '\\' OR f.region LIKE ? ESCAPE '\\')");
      const like = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
      params.push(like, like, like);
    }
    if (recruiting) where.push('f.recruiting = 1');
    const fas = db
      .prepare(
        `SELECT f.*, u.username AS leader_name, u.role AS leader_role, u.verified AS leader_verified,
                (SELECT COUNT(*) FROM users m WHERE m.fa_id = f.id) AS site_members
           FROM fas f LEFT JOIN users u ON u.id = f.leader_user_id
          ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
          ORDER BY f.points DESC, f.name LIMIT 200`
      )
      .all(...params);

    res.page({
      title: 'FA directory',
      active: '/fas',
      body: html`
        <div class="page-head">
          <h1>FA directory</h1>
          ${canCreate(req.user) ? html`<a class="btn" href="/fas/new">List your FA</a>` : ''}
        </div>
        <p class="lead">Find an FA to join, or find rivals to talk to. FA leaders with a blue tick can list and manage their FA here.</p>
        <form method="get" action="/fas" class="search-row" role="search">
          <input type="search" name="q" value="${q}" placeholder="Search by name, tag or region" aria-label="Search FAs">
          <label class="check"><input type="checkbox" name="recruiting" value="1" ${recruiting ? 'checked' : ''}> Recruiting only</label>
          <button class="btn btn-small">Filter</button>
        </form>
        ${fas.length
          ? html`<div class="fa-grid">${fas.map(
              (f) => html`<a class="fa-card" href="/fas/${f.id}">
                <div class="fa-card-head">
                  <span class="fa-badge" aria-hidden="true">${(f.tag || f.name).slice(0, 3).toUpperCase()}</span>
                  <div><h2>${f.name}</h2><span class="muted small">${f.region || 'Region not set'}</span></div>
                </div>
                <div class="fa-card-stats">
                  <span><strong>${f.points.toLocaleString('en')}</strong> pts</span>
                  <span><strong>${f.members_count || f.site_members}</strong> members</span>
                  ${f.recruiting ? html`<span class="pill pill-green">Recruiting</span>` : ''}
                </div>
              </a>`
            )}</div>`
          : html`<p class="empty">No FAs match. ${canCreate(req.user) ? html`<a href="/fas/new">List yours</a>.` : ''}</p>`}
        ${req.user && !canCreate(req.user)
          ? html`<p class="muted small">Want to list your FA? <a href="/verify">Get your blue tick</a> first.</p>`
          : ''}`,
    });
  });

  router.get('/fas/new', requireUser, (req, res) => {
    if (!canCreate(req.user)) throw forbidden('Only verified managers can list an FA. Get your blue tick first.');
    res.page({
      title: 'List your FA',
      active: '/fas',
      body: html`<h1>List your FA</h1>
        <p class="muted">You will be shown as the FA's leader on this site.</p>
        ${faForm(res, '/fas', { recruiting: 1 }, { isMod: false })}`,
    });
  });

  router.post('/fas', requireUser, (req, res) => {
    if (!canCreate(req.user)) throw forbidden('Only verified managers can list an FA.');
    const fa = readFa(req.body, false);
    let error = '';
    if (!fa.name) error = 'Give your FA a name.';
    else if (db.prepare('SELECT 1 FROM fas WHERE name = ?').get(fa.name)) error = 'An FA with that name is already listed. Ask a moderator if it is yours.';
    if (error) {
      res.status(400);
      return res.page({ title: 'List your FA', body: html`<h1>List your FA</h1>${faForm(res, '/fas', fa, { error })}` });
    }
    const id = transaction(db, () => {
      const now = Date.now();
      const newId = db
        .prepare(
          `INSERT INTO fas (name, tag, region, description, recruiting, members_count, leader_user_id, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(fa.name, fa.tag, fa.region, fa.description, fa.recruiting, fa.members_count, req.user.id, now, now).lastInsertRowid;
      db.prepare('UPDATE users SET fa_id = ? WHERE id = ?').run(newId, req.user.id);
      return newId;
    });
    res.flash('success', `${fa.name} is now listed.`);
    res.redirect(`/fas/${id}`);
  });

  // ─── FA page ─────────────────────────────────────────────────────────────

  router.get('/fas/:id', (req, res) => {
    const fa = loadFa(req.params.id);
    const leader = fa.leader_user_id
      ? db.prepare('SELECT username, role, verified FROM users WHERE id = ?').get(fa.leader_user_id)
      : null;
    const members = db
      .prepare('SELECT username, role, verified, ign FROM users WHERE fa_id = ? AND banned = 0 ORDER BY verified DESC, username')
      .all(fa.id);
    const { n: rankAbove } = db.prepare('SELECT COUNT(*) AS n FROM fas WHERE points > ?').get(fa.points);
    const inThisFa = req.user && req.user.fa_id === fa.id;

    res.page({
      title: fa.name,
      active: '/fas',
      body: html`
        <p class="crumbs"><a href="/fas">FA directory</a> ›</p>
        <div class="page-head">
          <h1>${fa.name}${fa.tag ? html` <span class="tag">${fa.tag}</span>` : ''}</h1>
          <div class="actions">
            ${canManage(req.user, fa) ? html`<a class="btn btn-ghost btn-small" href="/fas/${fa.id}/edit">Edit FA</a>` : ''}
            ${req.user
              ? inThisFa
                ? html`<form method="post" action="/fas/leave" class="inline">${csrfField(res)}<button class="btn btn-ghost btn-small">Leave this FA</button></form>`
                : html`<form method="post" action="/fas/${fa.id}/join" class="inline">${csrfField(res)}<button class="btn btn-small">I'm in this FA</button></form>`
              : ''}
          </div>
        </div>
        <div class="grid-2">
          <section class="panel">
            <dl class="facts">
              <dt>Rank</dt><dd>#${rankAbove + 1}</dd>
              <dt>Points</dt><dd>${fa.points.toLocaleString('en')}</dd>
              <dt>Members</dt><dd>${fa.members_count || members.length}</dd>
              <dt>Region</dt><dd>${fa.region || '–'}</dd>
              <dt>Leader</dt><dd>${leader ? userLink(leader) : '–'}</dd>
              <dt>Recruiting</dt><dd>${fa.recruiting ? html`<span class="pill pill-green">Yes</span>` : 'No'}</dd>
              <dt>Updated</dt><dd>${dateTime(fa.updated_at)}</dd>
            </dl>
            ${fa.recruiting ? html`<p><a href="/forum/fa-recruitment">Find recruitment posts →</a></p>` : ''}
          </section>
          <section class="panel">
            <h2>About</h2>
            ${fa.description ? html`<div class="prose">${markup(fa.description)}</div>` : html`<p class="muted">No description yet.</p>`}
          </section>
        </div>
        <section class="panel">
          <h2>Members on TopGoal Hub <span class="muted">(${members.length})</span></h2>
          ${members.length
            ? html`<ul class="member-list">${members.map(
                (m) => html`<li>${userLink(m)}${m.ign ? html` <span class="muted small">${m.ign}</span>` : ''}</li>`
              )}</ul>`
            : html`<p class="muted">No members have linked this FA yet.</p>`}
        </section>
        ${hasRole(req.user, 'mod')
          ? html`<form method="post" action="/fas/${fa.id}/delete" class="danger-zone" data-confirm="Remove ${fa.name} from the directory?">${csrfField(res)}<button class="btn btn-danger btn-small">Remove FA</button></form>`
          : ''}`,
    });
  });

  router.get('/fas/:id/edit', requireUser, (req, res) => {
    const fa = loadFa(req.params.id);
    if (!canManage(req.user, fa)) throw forbidden('Only the FA leader or a moderator can edit this FA.');
    const leader = fa.leader_user_id && db.prepare('SELECT username FROM users WHERE id = ?').get(fa.leader_user_id);
    res.page({
      title: `Edit ${fa.name}`,
      active: '/fas',
      body: html`<h1>Edit ${fa.name}</h1>
        ${faForm(res, `/fas/${fa.id}/edit`, fa, { isMod: hasRole(req.user, 'mod'), leaderName: leader ? leader.username : '' })}`,
    });
  });

  router.post('/fas/:id/edit', requireUser, (req, res) => {
    const fa = loadFa(req.params.id);
    if (!canManage(req.user, fa)) throw forbidden('Only the FA leader or a moderator can edit this FA.');
    const isMod = hasRole(req.user, 'mod');
    const next = readFa(req.body, isMod);
    let error = '';
    let leaderId = fa.leader_user_id;
    if (!next.name) error = 'The FA needs a name.';
    else if (db.prepare('SELECT 1 FROM fas WHERE name = ? AND id != ?').get(next.name, fa.id)) error = 'Another FA already uses that name.';
    else if (isMod) {
      if (!next.leader) leaderId = null;
      else {
        const leader = db.prepare('SELECT id FROM users WHERE username = ?').get(next.leader);
        if (!leader) error = `No user called ${next.leader}.`;
        else leaderId = leader.id;
      }
    }
    if (error) {
      res.status(400);
      return res.page({
        title: `Edit ${fa.name}`,
        body: html`<h1>Edit ${fa.name}</h1>${faForm(res, `/fas/${fa.id}/edit`, next, { isMod, error, leaderName: next.leader || '' })}`,
      });
    }
    db.prepare(
      `UPDATE fas SET name = ?, tag = ?, region = ?, description = ?, recruiting = ?, members_count = ?,
              points = ?, leader_user_id = ?, updated_at = ? WHERE id = ?`
    ).run(
      next.name,
      next.tag,
      next.region,
      next.description,
      next.recruiting,
      next.members_count,
      isMod ? next.points : fa.points,
      leaderId,
      Date.now(),
      fa.id
    );
    res.flash('success', 'FA updated.');
    res.redirect(`/fas/${fa.id}`);
  });

  router.post('/fas/:id/join', requireUser, (req, res) => {
    const fa = loadFa(req.params.id);
    db.prepare('UPDATE users SET fa_id = ? WHERE id = ?').run(fa.id, req.user.id);
    res.flash('success', `Your profile now shows ${fa.name}.`);
    res.redirect(`/fas/${fa.id}`);
  });

  router.post('/fas/leave', requireUser, (req, res) => {
    db.prepare('UPDATE users SET fa_id = NULL WHERE id = ?').run(req.user.id);
    res.flash('success', 'Your FA has been removed from your profile.');
    res.redirect('/fas');
  });

  router.post('/fas/:id/delete', requireRole('mod'), (req, res) => {
    const fa = loadFa(req.params.id);
    db.prepare('DELETE FROM fas WHERE id = ?').run(fa.id);
    res.flash('success', `${fa.name} removed.`);
    res.redirect('/fas');
  });

  return router;
};
