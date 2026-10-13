'use strict';

const crypto = require('node:crypto');
const express = require('express');
const { ensureMainWikiPage } = require('../db');
const { hashPassword, verifyPassword, createSession, destroySession, rateLimiter, clientIp, safeNext } = require('../auth');
const { html, th, csrfField } = require('../render');
const { t } = require('../i18n');

const USERNAME_RE = /^[A-Za-z0-9_.-]{3,24}$/;

function newVerifyCode() {
  // Short, unambiguous code a player can type into their in-game profile.
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = 'TG-';
  for (const byte of crypto.randomBytes(5)) code += alphabet[byte % alphabet.length];
  return code;
}

module.exports = ({ db }) => {
  const router = express.Router();
  const loginLimiter = rateLimiter({ windowMs: 15 * 60 * 1000, max: 10 });
  const registerLimiter = rateLimiter({ windowMs: 60 * 60 * 1000, max: 5 });

  const registerForm = (res, { username = '', ign = '', error = '' } = {}) =>
    res.page({
      title: t('auth.joinTitle'),
      body: html`
        <section class="auth-card">
          <h1>${t('auth.joinHeading')}</h1>
          <p class="muted">${t('auth.joinIntro')}</p>
          ${error ? html`<p class="form-error" role="alert">${error}</p>` : ''}
          <form method="post" action="/register" class="stack">
            ${csrfField(res)}
            <label>${t('auth.username')} <input name="username" value="${username}" required minlength="3" maxlength="24" pattern="[A-Za-z0-9_.\\-]{3,24}" autocomplete="username"></label>
            <small class="muted">${t('auth.usernameHint')}</small>
            <label>${t('auth.ign')} <span class="muted">${t('common.optional')}</span><input name="ign" value="${ign}" maxlength="40"></label>
            <label>${t('auth.password')} <input type="password" name="password" required minlength="8" maxlength="200" autocomplete="new-password"></label>
            <label>${t('auth.confirmPassword')} <input type="password" name="confirm" required minlength="8" maxlength="200" autocomplete="new-password"></label>
            <button class="btn">${t('auth.createAccount')}</button>
          </form>
          <p class="muted">${th('auth.haveAccount', { link: html`<a href="/login">${t('nav.login')}</a>` })}</p>
        </section>`,
    });

  router.get('/register', (req, res) => {
    if (req.user) return res.redirect('/');
    registerForm(res);
  });

  router.post('/register', async (req, res) => {
    const username = String(req.body.username || '').trim();
    const ign = String(req.body.ign || '').trim().slice(0, 40);
    const password = String(req.body.password || '');
    const confirm = String(req.body.confirm || '');

    if (registerLimiter.hit(clientIp(req))) {
      res.status(429);
      return registerForm(res, { username, ign, error: t('auth.tooManySignups') });
    }
    let error = '';
    if (!USERNAME_RE.test(username)) error = t('auth.usernameInvalid');
    else if (password.length < 8) error = t('auth.passwordShort');
    else if (password !== confirm) error = t('auth.passwordMismatch');
    else if (await db.get('SELECT 1 FROM users WHERE username = ?', username)) error = t('auth.usernameTaken');
    if (error) {
      res.status(400);
      return registerForm(res, { username, ign, error });
    }

    // The very first account becomes the site admin (decided inside the INSERT so two
    // simultaneous sign-ups cannot both become admin).
    let userId;
    try {
      ({ lastInsertRowid: userId } = await db.run(
        `INSERT INTO users (username, password_hash, role, verify_code, ign, created_at)
         VALUES (?, ?, CASE WHEN EXISTS (SELECT 1 FROM users) THEN 'user' ELSE 'admin' END, ?, ?, ?)`,
        username, hashPassword(password), newVerifyCode(), ign || null, Date.now()
      ));
    } catch (err) {
      if (!/UNIQUE/i.test(String(err && err.message))) throw err;
      res.status(400);
      return registerForm(res, { username, ign, error: t('auth.usernameTaken') });
    }
    await ensureMainWikiPage(db, userId);
    await createSession(db, req, res, userId);
    res.flash('success', t('auth.welcome', { name: username }));
    res.redirect('/');
  });

  const loginForm = (res, { username = '', next = '/', error = '' } = {}) =>
    res.page({
      title: t('nav.login'),
      body: html`
        <section class="auth-card">
          <h1>${t('nav.login')}</h1>
          ${error ? html`<p class="form-error" role="alert">${error}</p>` : ''}
          <form method="post" action="/login" class="stack">
            ${csrfField(res)}
            <input type="hidden" name="next" value="${next}">
            <label>${t('auth.username')} <input name="username" value="${username}" required autocomplete="username"></label>
            <label>${t('auth.password')} <input type="password" name="password" required autocomplete="current-password"></label>
            <button class="btn">${t('nav.login')}</button>
          </form>
          <p class="muted">${th('auth.newHere', { link: html`<a href="/register">${t('auth.createAccount')}</a>` })}</p>
        </section>`,
    });

  router.get('/login', (req, res) => {
    if (req.user) return res.redirect('/');
    loginForm(res, { next: safeNext(req.query.next) });
  });

  router.post('/login', async (req, res) => {
    const username = String(req.body.username || '').trim();
    const password = String(req.body.password || '');
    const next = safeNext(req.body.next);
    const key = `${clientIp(req)}|${username.toLowerCase()}`;

    if (loginLimiter.hit(key)) {
      res.status(429);
      return loginForm(res, { username, next, error: t('auth.tooManyAttempts') });
    }
    const user = await db.get('SELECT id, password_hash, banned FROM users WHERE username = ?', username);
    if (!user || !verifyPassword(password, user.password_hash)) {
      res.status(401);
      return loginForm(res, { username, next, error: t('auth.wrongPassword') });
    }
    if (user.banned) {
      res.status(403);
      return loginForm(res, { username, next, error: t('auth.suspended') });
    }
    loginLimiter.reset(key);
    await createSession(db, req, res, user.id);
    res.redirect(next);
  });

  router.post('/logout', async (req, res) => {
    await destroySession(db, req, res);
    res.redirect('/');
  });

  return router;
};
