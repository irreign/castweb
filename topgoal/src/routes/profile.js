'use strict';

const express = require('express');
const { requireUser, hashPassword, verifyPassword, revokeOtherSessions } = require('../auth');
const { html, csrfField, userLink, dateTime, markup, blueTick } = require('../render');
const { t, formatNumber } = require('../i18n');
const { relationship, friendButton } = require('./friends');
const { notFound, text } = require('./util');

module.exports = ({ db }) => {
  const router = express.Router();

  router.get('/u/:username', async (req, res) => {
    const user = await db.get(
      `SELECT u.id, u.username, u.role, u.verified, u.verified_at, u.ign, u.bio, u.banned, u.created_at,
              f.id AS fa_id, f.name AS fa_name
         FROM users u LEFT JOIN fas f ON f.id = u.fa_id WHERE u.username = ?`,
      String(req.params.username)
    );
    if (!user) throw notFound(t('profile.notFound'));
    const threads = await db.all('SELECT id, title, created_at FROM threads WHERE user_id = ? ORDER BY id DESC LIMIT 10', user.id);
    const counts = await db.get(
      `SELECT (SELECT COUNT(*) FROM posts WHERE user_id = ? AND deleted = 0) AS posts,
              (SELECT COUNT(*) FROM wiki_revisions WHERE user_id = ?) AS edits,
              (SELECT COUNT(*) FROM friendships WHERE status = 'accepted' AND (requester_id = ? OR addressee_id = ?)) AS friends`,
      user.id, user.id, user.id, user.id
    );
    const isMe = req.user && req.user.id === user.id;
    const rel = req.user && !isMe ? await relationship(db, req.user.id, user.id) : null;

    res.page({
      title: user.username,
      body: html`
        <section class="profile-head">
          <div class="avatar avatar-lg" aria-hidden="true">${user.username.slice(0, 1).toUpperCase()}</div>
          <div>
            <h1>${user.username}${user.verified ? blueTick() : ''}</h1>
            <p class="muted">
              ${user.role !== 'user' ? html`<span class="role-badge">${t(`role.${user.role}`)}</span> ` : ''}
              ${user.verified ? html`${t('profile.verifiedSince')} ${dateTime(user.verified_at)} · ` : ''}${t('profile.joined')} ${dateTime(user.created_at)}
              ${user.banned ? html` · <strong class="danger">${t('admin.suspended')}</strong>` : ''}
            </p>
            <p>
              ${user.ign ? html`${t('auth.ign')}: <strong>${user.ign}</strong>` : ''}
              ${user.fa_name ? html` · ${t('fa.federation')}: <a href="/fas/${user.fa_id}">${user.fa_name}</a>` : ''}
            </p>
          </div>
          <div class="actions">
            ${isMe ? html`<a class="btn btn-ghost btn-small" href="/settings">${t('profile.edit')}</a>` : ''}
            ${rel && !user.banned ? friendButton(res, user, rel) : ''}
            ${!req.user ? html`<a class="btn btn-small" href="/login?next=${encodeURIComponent(`/u/${user.username}`)}">+ ${t('friends.add')}</a>` : ''}
          </div>
        </section>
        <div class="grid-2">
          <section class="panel">
            <h2>${t('profile.about')}</h2>
            ${user.bio ? html`<div class="prose">${markup(user.bio)}</div>` : html`<p class="muted">${t('profile.noBio')}</p>`}
            <dl class="facts">
              <dt>${t('rankings.posts')}</dt><dd>${formatNumber(counts.posts)}</dd>
              <dt>${t('rankings.edits')}</dt><dd>${formatNumber(counts.edits)}</dd>
              <dt>${t('nav.friends')}</dt><dd>${formatNumber(counts.friends)}</dd>
            </dl>
          </section>
          <section class="panel">
            <h2>${t('profile.recentThreads')}</h2>
            ${threads.length
              ? html`<ul class="list">${threads.map((row) => html`<li><a class="list-title" href="/t/${row.id}">${row.title}</a><span class="meta">${dateTime(row.created_at)}</span></li>`)}</ul>`
              : html`<p class="muted">${t('profile.noThreads')}</p>`}
          </section>
        </div>`,
    });
  });

  const settingsPage = (req, res, user, { error = '' } = {}) =>
    res.page({
      title: t('nav.settings'),
      body: html`
        <h1>${t('settings.title')}</h1>
        ${error ? html`<p class="form-error" role="alert">${error}</p>` : ''}
        <div class="grid-2">
          <section class="panel">
            <h2>${t('settings.profile')}</h2>
            <form method="post" action="/settings" class="stack">
              ${csrfField(res)}
              <label>${t('auth.ign')}
                <input name="ign" value="${user.ign || ''}" maxlength="40" ${user.verified ? 'readonly' : ''}>
              </label>
              ${user.verified ? html`<small class="muted">${t('settings.ignLocked')}</small>` : ''}
              <label>${t('settings.bio')} <textarea name="bio" rows="6" maxlength="2000">${user.bio}</textarea></label>
              <button class="btn">${t('settings.saveProfile')}</button>
            </form>
            <p class="small">${t('settings.yourFa')}: ${user.fa_name ? html`<a href="/fas/${user.fa_id}">${user.fa_name}</a>` : t('common.none')} · <a href="/fas">${t('settings.changeFa')}</a></p>
          </section>
          <section class="panel">
            <h2>${t('settings.changePassword')}</h2>
            <form method="post" action="/settings/password" class="stack">
              ${csrfField(res)}
              <label>${t('settings.currentPassword')} <input type="password" name="current" required autocomplete="current-password"></label>
              <label>${t('settings.newPassword')} <input type="password" name="password" required minlength="8" maxlength="200" autocomplete="new-password"></label>
              <button class="btn">${t('settings.changePassword')}</button>
            </form>
            <p class="small"><a href="${`/u/${encodeURIComponent(user.username)}`}">${t('settings.viewProfile')}</a> · ${userLink(user)}</p>
          </section>
        </div>`,
    });

  const loadMe = (req) =>
    db.get(`SELECT u.*, f.name AS fa_name FROM users u LEFT JOIN fas f ON f.id = u.fa_id WHERE u.id = ?`, req.user.id);

  router.get('/settings', requireUser, async (req, res) => settingsPage(req, res, await loadMe(req)));

  router.post('/settings', requireUser, async (req, res) => {
    const me = await loadMe(req);
    const ign = me.verified ? me.ign : text(req.body.ign, 40) || null;
    await db.run('UPDATE users SET ign = ?, bio = ? WHERE id = ?', ign, text(req.body.bio, 2000), me.id);
    res.flash('success', t('settings.saved'));
    res.redirect('/settings');
  });

  router.post('/settings/password', requireUser, async (req, res) => {
    const me = await loadMe(req);
    const current = String(req.body.current || '');
    const password = String(req.body.password || '');
    if (!verifyPassword(current, me.password_hash)) {
      res.status(400);
      return settingsPage(req, res, me, { error: t('settings.wrongPassword') });
    }
    if (password.length < 8 || password.length > 200) {
      res.status(400);
      return settingsPage(req, res, me, { error: t('auth.passwordShort') });
    }
    await db.run('UPDATE users SET password_hash = ? WHERE id = ?', hashPassword(password), me.id);
    // Sign out every other device.
    await revokeOtherSessions(db, req, me.id);
    res.flash('success', t('settings.passwordChanged'));
    res.redirect('/settings');
  });

  return router;
};
