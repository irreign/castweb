'use strict';

const express = require('express');
const { requireUser } = require('../auth');
const { html, csrfField, dateTime, BLUE_TICK } = require('../render');
const { text } = require('./util');

module.exports = ({ db }) => {
  const router = express.Router();

  const latestRequest = (userId) =>
    db.get('SELECT * FROM verification_requests WHERE user_id = ? ORDER BY id DESC LIMIT 1', userId);

  const howItWorks = html`
    <section class="panel">
      <h2>How the blue tick works</h2>
      <ol class="steps">
        <li><strong>Get your code.</strong> Log in and open this page. You'll see a code that belongs only to your account.</li>
        <li><strong>Show it in the game.</strong> Put the code somewhere other players can see on your TopGoal profile, such as your club name or club description, for a short time.</li>
        <li><strong>Send a request.</strong> Tell us your in-game manager name and FA, and add a screenshot link showing the code.</li>
        <li><strong>A moderator checks.</strong> They look you up in the game and approve you. You get a ${BLUE_TICK} next to your name everywhere on the site, and you can take the code out of your profile.</li>
      </ol>
      <p class="muted small">Verified managers can post in the Verified Lounge, list and manage their FA, and add pack players. Never share your game password, and no moderator will ever ask for it.</p>
    </section>`;

  const page = async (req, res, { error = '', form = {} } = {}) => {
    if (!req.user) {
      return res.page({
        title: 'Get verified',
        body: html`<h1>Get your blue tick</h1>
          <p class="lead">A blue tick shows other managers that you really own the TopGoal account you say you do.</p>
          ${howItWorks}
          <p><a class="btn" href="/register">Create an account</a> <a class="btn btn-ghost" href="/login?next=/verify">Log in</a></p>`,
      });
    }
    const me = await db.get('SELECT verified, verified_at, verify_code, ign FROM users WHERE id = ?', req.user.id);
    const last = await latestRequest(req.user.id);
    const fa = req.user.fa_id ? await db.get('SELECT name FROM fas WHERE id = ?', req.user.fa_id) : null;

    let status;
    if (me.verified) {
      status = html`<div class="flash flash-success">${BLUE_TICK} You're verified (since ${dateTime(me.verified_at)}). Thanks for helping keep the community real.</div>`;
    } else if (last && last.status === 'pending') {
      status = html`<div class="flash flash-info">Your request from ${dateTime(last.created_at)} is waiting for a moderator. Keep the code <code>${me.verify_code}</code> visible in the game until it is reviewed.</div>`;
    } else {
      status = html`
        ${last && last.status === 'rejected'
          ? html`<div class="flash flash-error">Your last request was not approved${last.review_note ? html`: ${last.review_note}` : '.'} You can try again below.</div>`
          : ''}
        <section class="panel verify-form">
          <h2>Your verification code</h2>
          <p class="verify-code" aria-label="Your verification code">${me.verify_code}</p>
          ${error ? html`<p class="form-error" role="alert">${error}</p>` : ''}
          <form method="post" action="/verify" class="stack">
            ${csrfField(res)}
            <label>In-game manager name <input name="ign" required maxlength="40" value="${form.ign ?? me.ign ?? ''}"></label>
            <label>Your FA in the game <input name="fa_name" maxlength="40" value="${form.fa_name ?? (fa ? fa.name : '')}"></label>
            <label>Screenshot link and notes
              <textarea name="evidence" rows="4" maxlength="1000" required placeholder="Link to a screenshot (e.g. Imgur) that shows the code on your TopGoal profile, plus anything that helps a moderator find you.">${form.evidence || ''}</textarea>
            </label>
            <button class="btn">Send verification request</button>
          </form>
        </section>`;
    }

    res.page({
      title: 'Get verified',
      body: html`<h1>Get your blue tick</h1>${status}${howItWorks}`,
    });
  };

  router.get('/verify', async (req, res) => page(req, res));

  router.post('/verify', requireUser, async (req, res) => {
    const me = await db.get('SELECT verified, verify_code FROM users WHERE id = ?', req.user.id);
    const last = await latestRequest(req.user.id);
    if (me.verified || (last && last.status === 'pending')) return res.redirect('/verify');

    const form = {
      ign: text(req.body.ign, 40),
      fa_name: text(req.body.fa_name, 40),
      evidence: text(req.body.evidence, 1000),
    };
    if (!form.ign || !form.evidence) {
      res.status(400);
      return page(req, res, { form, error: 'Your in-game name and a screenshot link are both required.' });
    }
    await db.run('INSERT INTO verification_requests (user_id, code, ign, fa_name, evidence, created_at) VALUES (?, ?, ?, ?, ?, ?)', req.user.id, me.verify_code, form.ign, form.fa_name, form.evidence, Date.now());
    res.flash('success', 'Request sent. A moderator will review it soon.');
    res.redirect('/verify');
  });

  return router;
};
