'use strict';

const express = require('express');
const { requireUser, hashPassword, verifyPassword, revokeOtherSessions } = require('../auth');
const { html, csrfField, userLink, dateTime, markup, BLUE_TICK } = require('../render');
const { notFound, text } = require('./util');

module.exports = ({ db }) => {
  const router = express.Router();

  router.get('/u/:username', (req, res) => {
    const user = db
      .prepare(
        `SELECT u.id, u.username, u.role, u.verified, u.verified_at, u.ign, u.bio, u.banned, u.created_at,
                f.id AS fa_id, f.name AS fa_name
           FROM users u LEFT JOIN fas f ON f.id = u.fa_id WHERE u.username = ?`
      )
      .get(String(req.params.username));
    if (!user) throw notFound('No manager with that name.');
    const threads = db
      .prepare('SELECT id, title, created_at FROM threads WHERE user_id = ? ORDER BY id DESC LIMIT 10')
      .all(user.id);
    const counts = db
      .prepare(
        `SELECT (SELECT COUNT(*) FROM posts WHERE user_id = ? AND deleted = 0) AS posts,
                (SELECT COUNT(*) FROM wiki_revisions WHERE user_id = ?) AS edits`
      )
      .get(user.id, user.id);

    res.page({
      title: user.username,
      body: html`
        <section class="profile-head">
          <div class="avatar avatar-lg" aria-hidden="true">${user.username.slice(0, 1).toUpperCase()}</div>
          <div>
            <h1>${user.username}${user.verified ? BLUE_TICK : ''}</h1>
            <p class="muted">
              ${user.role !== 'user' ? html`<span class="role-badge">${user.role}</span> ` : ''}
              ${user.verified ? html`Verified manager since ${dateTime(user.verified_at)} · ` : ''}Joined ${dateTime(user.created_at)}
              ${user.banned ? html` · <strong class="danger">Suspended</strong>` : ''}
            </p>
            <p>
              ${user.ign ? html`In-game name: <strong>${user.ign}</strong>` : ''}
              ${user.fa_name ? html` · FA: <a href="/fas/${user.fa_id}">${user.fa_name}</a>` : ''}
            </p>
          </div>
          ${req.user && req.user.id === user.id ? html`<a class="btn btn-ghost btn-small" href="/settings">Edit profile</a>` : ''}
        </section>
        <div class="grid-2">
          <section class="panel">
            <h2>About</h2>
            ${user.bio ? html`<div class="prose">${markup(user.bio)}</div>` : html`<p class="muted">Nothing here yet.</p>`}
            <dl class="facts"><dt>Forum posts</dt><dd>${counts.posts}</dd><dt>Wiki edits</dt><dd>${counts.edits}</dd></dl>
          </section>
          <section class="panel">
            <h2>Recent threads</h2>
            ${threads.length
              ? html`<ul class="list">${threads.map((t) => html`<li><a class="list-title" href="/t/${t.id}">${t.title}</a><span class="meta">${dateTime(t.created_at)}</span></li>`)}</ul>`
              : html`<p class="muted">No threads yet.</p>`}
          </section>
        </div>`,
    });
  });

  const settingsPage = (req, res, user, { error = '' } = {}) =>
    res.page({
      title: 'Settings',
      body: html`
        <h1>Your profile</h1>
        ${error ? html`<p class="form-error" role="alert">${error}</p>` : ''}
        <div class="grid-2">
          <section class="panel">
            <h2>Profile</h2>
            <form method="post" action="/settings" class="stack">
              ${csrfField(res)}
              <label>In-game manager name
                <input name="ign" value="${user.ign || ''}" maxlength="40" ${user.verified ? 'readonly' : ''}>
              </label>
              ${user.verified ? html`<small class="muted">Your in-game name is locked because it was verified. Ask a moderator to change it.</small>` : ''}
              <label>About you <textarea name="bio" rows="6" maxlength="2000">${user.bio}</textarea></label>
              <button class="btn">Save profile</button>
            </form>
            <p class="small">Your FA: ${user.fa_name ? html`<a href="/fas/${user.fa_id}">${user.fa_name}</a>` : 'none'} · <a href="/fas">Change in the FA directory</a></p>
          </section>
          <section class="panel">
            <h2>Change password</h2>
            <form method="post" action="/settings/password" class="stack">
              ${csrfField(res)}
              <label>Current password <input type="password" name="current" required autocomplete="current-password"></label>
              <label>New password <input type="password" name="password" required minlength="8" maxlength="200" autocomplete="new-password"></label>
              <button class="btn">Change password</button>
            </form>
            <p class="small"><a href="${`/u/${encodeURIComponent(user.username)}`}">View public profile</a> · Signed in as ${userLink(user)}</p>
          </section>
        </div>`,
    });

  const loadMe = (req) =>
    db
      .prepare(
        `SELECT u.*, f.name AS fa_name FROM users u LEFT JOIN fas f ON f.id = u.fa_id WHERE u.id = ?`
      )
      .get(req.user.id);

  router.get('/settings', requireUser, (req, res) => settingsPage(req, res, loadMe(req)));

  router.post('/settings', requireUser, (req, res) => {
    const me = loadMe(req);
    const ign = me.verified ? me.ign : text(req.body.ign, 40) || null;
    db.prepare('UPDATE users SET ign = ?, bio = ? WHERE id = ?').run(ign, text(req.body.bio, 2000), me.id);
    res.flash('success', 'Profile saved.');
    res.redirect('/settings');
  });

  router.post('/settings/password', requireUser, (req, res) => {
    const me = loadMe(req);
    const current = String(req.body.current || '');
    const password = String(req.body.password || '');
    if (!verifyPassword(current, me.password_hash)) {
      res.status(400);
      return settingsPage(req, res, me, { error: 'Your current password is wrong.' });
    }
    if (password.length < 8 || password.length > 200) {
      res.status(400);
      return settingsPage(req, res, me, { error: 'New passwords must be at least 8 characters.' });
    }
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(password), me.id);
    // Sign out every other device.
    revokeOtherSessions(db, req, me.id);
    res.flash('success', 'Password changed. Other devices have been signed out.');
    res.redirect('/settings');
  });

  return router;
};
