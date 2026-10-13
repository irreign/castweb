'use strict';

const express = require('express');
const { requireUser, requireRole, hasRole } = require('../auth');
const { html, th, csrfField, userLink, dateTime, markup } = require('../render');
const { t, tn, formatNumber } = require('../i18n');
const { notFound, forbidden, intParam, text } = require('./util');

module.exports = ({ db }) => {
  const router = express.Router();

  const loadFa = async (idParam) => {
    const id = intParam(idParam);
    const fa = id && await db.get('SELECT * FROM fas WHERE id = ?', id);
    if (!fa) throw notFound(t('fa.notFound'));
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
        <label>${t('fa.name')} <input name="name" value="${fa.name || ''}" required maxlength="40"></label>
        <label>${t('fa.tag')} <input name="tag" value="${fa.tag || ''}" maxlength="8" placeholder="${t('fa.tagHint')}"></label>
      </div>
      <div class="row">
        <label>${t('fa.regionLanguage')} <input name="region" value="${fa.region || ''}" maxlength="40" placeholder="${t('fa.regionHint')}"></label>
        <label>${t('fa.membersInGame')} <input type="number" name="members_count" value="${fa.members_count || ''}" min="0" max="500"></label>
      </div>
      <label>${t('fa.about')} <textarea name="description" rows="6" maxlength="5000" placeholder="${t('fa.aboutHint')}">${fa.description || ''}</textarea></label>
      <label class="check"><input type="checkbox" name="recruiting" value="1" ${fa.recruiting ? 'checked' : ''}> ${t('fa.weRecruit')}</label>
      ${isMod
        ? html`<fieldset class="mod-fields">
            <legend>${t('fa.modOnly')}</legend>
            <div class="row">
              <label>${t('fa.rankingPoints')} <input type="number" name="points" value="${fa.points ?? 0}" min="0"></label>
              <label>${t('fa.leaderUsername')} <input name="leader" value="${leaderName}" maxlength="24"></label>
            </div>
          </fieldset>`
        : ''}
      <button class="btn">${t('fa.save')}</button>
    </form>`;

  // ─── Directory ───────────────────────────────────────────────────────────

  router.get('/fas', async (req, res) => {
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
    const fas = await db.all(`SELECT f.*, u.username AS leader_name, u.role AS leader_role, u.verified AS leader_verified,
                (SELECT COUNT(*) FROM users m WHERE m.fa_id = f.id) AS site_members
           FROM fas f LEFT JOIN users u ON u.id = f.leader_user_id
          ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
          ORDER BY f.points DESC, f.name LIMIT 200`, ...params);

    res.page({
      title: t('nav.federations'),
      active: '/fas',
      body: html`
        <div class="page-head">
          <h1>${t('nav.federations')}</h1>
          ${canCreate(req.user) ? html`<a class="btn" href="/fas/new">${t('fa.listYours')}</a>` : ''}
        </div>
        <p class="lead">${t('fa.lead')}</p>
        <form method="get" action="/fas" class="search-row" role="search">
          <input type="search" name="q" value="${q}" placeholder="${t('fa.searchHint')}" aria-label="${t('fa.searchHint')}">
          <label class="check"><input type="checkbox" name="recruiting" value="1" ${recruiting ? 'checked' : ''}> ${t('fa.recruitingOnly')}</label>
          <button class="btn btn-small">${t('common.filter')}</button>
        </form>
        ${fas.length
          ? html`<div class="fa-grid">${fas.map(
              (f) => html`<a class="fa-card" href="/fas/${f.id}">
                <div class="fa-card-head">
                  <span class="fa-badge" aria-hidden="true">${(f.tag || f.name).slice(0, 3).toUpperCase()}</span>
                  <div><h2>${f.name}</h2><span class="muted small">${f.region || t('fa.noRegion')}</span></div>
                </div>
                <div class="fa-card-stats">
                  <span>${tn('fa.pointsCount', f.points)}</span>
                  <span>${tn('fa.membersCount', f.members_count || f.site_members)}</span>
                  ${f.recruiting ? html`<span class="pill pill-green">${t('fa.recruiting')}</span>` : ''}
                </div>
              </a>`
            )}</div>`
          : html`<p class="empty">${t('fa.noMatch')} ${canCreate(req.user) ? html`<a href="/fas/new">${t('fa.listYours')}</a>` : ''}</p>`}
        ${req.user && !canCreate(req.user)
          ? html`<p class="muted small">${th('fa.verifyToList', { link: html`<a href="/verify">${t('home.getTick')}</a>` })}</p>`
          : ''}`,
    });
  });

  router.get('/fas/new', requireUser, async (req, res) => {
    if (!canCreate(req.user)) throw forbidden(t('fa.onlyVerified'));
    res.page({
      title: t('fa.listYours'),
      active: '/fas',
      body: html`<h1>${t('fa.listYours')}</h1>
        <p class="muted">${t('fa.youWillLead')}</p>
        ${faForm(res, '/fas', { recruiting: 1 }, { isMod: false })}`,
    });
  });

  router.post('/fas', requireUser, async (req, res) => {
    if (!canCreate(req.user)) throw forbidden(t('fa.onlyVerified'));
    const fa = readFa(req.body, false);
    let error = '';
    if (!fa.name) error = t('fa.needName');
    else if (await db.get('SELECT 1 FROM fas WHERE name = ?', fa.name)) error = t('fa.nameTaken');
    if (error) {
      res.status(400);
      return res.page({ title: t('fa.listYours'), active: '/fas', body: html`<h1>${t('fa.listYours')}</h1>${faForm(res, '/fas', fa, { error })}` });
    }
    const now = Date.now();
    const [{ lastInsertRowid: id }] = await db.batch([
      [
        `INSERT INTO fas (name, tag, region, description, recruiting, members_count, leader_user_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        fa.name, fa.tag, fa.region, fa.description, fa.recruiting, fa.members_count, req.user.id, now, now,
      ],
      ['UPDATE users SET fa_id = last_insert_rowid() WHERE id = ?', req.user.id],
    ]);
    res.flash('success', t('fa.listed', { name: fa.name }));
    res.redirect(`/fas/${id}`);
  });

  // ─── FA page ─────────────────────────────────────────────────────────────

  router.get('/fas/:id', async (req, res) => {
    const fa = await loadFa(req.params.id);
    const leader = fa.leader_user_id
      ? await db.get('SELECT username, role, verified FROM users WHERE id = ?', fa.leader_user_id)
      : null;
    const members = await db.all('SELECT username, role, verified, ign FROM users WHERE fa_id = ? AND banned = 0 ORDER BY verified DESC, username', fa.id);
    const { n: rankAbove } = await db.get('SELECT COUNT(*) AS n FROM fas WHERE points > ?', fa.points);
    const inThisFa = req.user && req.user.fa_id === fa.id;

    res.page({
      title: fa.name,
      active: '/fas',
      body: html`
        <p class="crumbs"><a href="/fas">${t('nav.federations')}</a> ›</p>
        <div class="page-head">
          <h1>${fa.name}${fa.tag ? html` <span class="tag">${fa.tag}</span>` : ''}</h1>
          <div class="actions">
            ${canManage(req.user, fa) ? html`<a class="btn btn-ghost btn-small" href="/fas/${fa.id}/edit">${t('fa.edit')}</a>` : ''}
            ${req.user
              ? inThisFa
                ? html`<form method="post" action="/fas/leave" class="inline">${csrfField(res)}<button class="btn btn-ghost btn-small">${t('fa.leave')}</button></form>`
                : html`<form method="post" action="/fas/${fa.id}/join" class="inline">${csrfField(res)}<button class="btn btn-small">${t('fa.join')}</button></form>`
              : ''}
          </div>
        </div>
        <div class="grid-2">
          <section class="panel">
            <dl class="facts">
              <dt>${t('fa.rank')}</dt><dd>#${rankAbove + 1}</dd>
              <dt>${t('fa.points')}</dt><dd>${formatNumber(fa.points)}</dd>
              <dt>${t('fa.members')}</dt><dd>${formatNumber(fa.members_count || members.length)}</dd>
              <dt>${t('fa.region')}</dt><dd>${fa.region || '–'}</dd>
              <dt>${t('fa.leader')}</dt><dd>${leader ? userLink(leader) : '–'}</dd>
              <dt>${t('fa.recruiting')}</dt><dd>${fa.recruiting ? html`<span class="pill pill-green">${t('common.yes')}</span>` : t('common.no')}</dd>
              <dt>${t('fa.updated')}</dt><dd>${dateTime(fa.updated_at)}</dd>
            </dl>
            ${fa.recruiting ? html`<p><a href="/forum/fa-recruitment">${t('fa.findRecruitment')} →</a></p>` : ''}
          </section>
          <section class="panel">
            <h2>${t('profile.about')}</h2>
            ${fa.description ? html`<div class="prose">${markup(fa.description)}</div>` : html`<p class="muted">${t('fa.noDescription')}</p>`}
          </section>
        </div>
        <section class="panel">
          <h2>${t('fa.siteMembers')} <span class="muted">(${members.length})</span></h2>
          ${members.length
            ? html`<ul class="member-list">${members.map(
                (m) => html`<li>${userLink(m)}${m.ign ? html` <span class="muted small">${m.ign}</span>` : ''}</li>`
              )}</ul>`
            : html`<p class="muted">${t('fa.noMembers')}</p>`}
        </section>
        ${hasRole(req.user, 'mod')
          ? html`<form method="post" action="/fas/${fa.id}/delete" class="danger-zone" data-confirm="${t('fa.removeConfirm', { name: fa.name })}">${csrfField(res)}<button class="btn btn-danger btn-small">${t('fa.remove')}</button></form>`
          : ''}`,
    });
  });

  router.get('/fas/:id/edit', requireUser, async (req, res) => {
    const fa = await loadFa(req.params.id);
    if (!canManage(req.user, fa)) throw forbidden(t('fa.leaderOnly'));
    const leader = fa.leader_user_id && await db.get('SELECT username FROM users WHERE id = ?', fa.leader_user_id);
    res.page({
      title: t('fa.editNamed', { name: fa.name }),
      active: '/fas',
      body: html`<h1>${t('fa.editNamed', { name: fa.name })}</h1>
        ${faForm(res, `/fas/${fa.id}/edit`, fa, { isMod: hasRole(req.user, 'mod'), leaderName: leader ? leader.username : '' })}`,
    });
  });

  router.post('/fas/:id/edit', requireUser, async (req, res) => {
    const fa = await loadFa(req.params.id);
    if (!canManage(req.user, fa)) throw forbidden(t('fa.leaderOnly'));
    const isMod = hasRole(req.user, 'mod');
    const next = readFa(req.body, isMod);
    let error = '';
    let leaderId = fa.leader_user_id;
    if (!next.name) error = t('fa.needName');
    else if (await db.get('SELECT 1 FROM fas WHERE name = ? AND id != ?', next.name, fa.id)) error = t('fa.nameTaken');
    else if (isMod) {
      if (!next.leader) leaderId = null;
      else {
        const leader = await db.get('SELECT id FROM users WHERE username = ?', next.leader);
        if (!leader) error = t('fa.noSuchUser', { name: next.leader });
        else leaderId = leader.id;
      }
    }
    if (error) {
      res.status(400);
      return res.page({
        title: t('fa.editNamed', { name: fa.name }),
        active: '/fas',
        body: html`<h1>${t('fa.editNamed', { name: fa.name })}</h1>${faForm(res, `/fas/${fa.id}/edit`, next, { isMod, error, leaderName: next.leader || '' })}`,
      });
    }
    await db.run(`UPDATE fas SET name = ?, tag = ?, region = ?, description = ?, recruiting = ?, members_count = ?,
              points = ?, leader_user_id = ?, updated_at = ? WHERE id = ?`, next.name,
      next.tag,
      next.region,
      next.description,
      next.recruiting,
      next.members_count,
      isMod ? next.points : fa.points,
      leaderId,
      Date.now(),
      fa.id);
    res.flash('success', t('fa.updatedFlash'));
    res.redirect(`/fas/${fa.id}`);
  });

  router.post('/fas/:id/join', requireUser, async (req, res) => {
    const fa = await loadFa(req.params.id);
    await db.run('UPDATE users SET fa_id = ? WHERE id = ?', fa.id, req.user.id);
    res.flash('success', t('fa.joined', { name: fa.name }));
    res.redirect(`/fas/${fa.id}`);
  });

  router.post('/fas/leave', requireUser, async (req, res) => {
    await db.run('UPDATE users SET fa_id = NULL WHERE id = ?', req.user.id);
    res.flash('success', t('fa.left'));
    res.redirect('/fas');
  });

  router.post('/fas/:id/delete', requireRole('mod'), async (req, res) => {
    const fa = await loadFa(req.params.id);
    await db.run('DELETE FROM fas WHERE id = ?', fa.id);
    res.flash('success', t('fa.removed', { name: fa.name }));
    res.redirect('/fas');
  });

  return router;
};
