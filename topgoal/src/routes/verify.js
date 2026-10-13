'use strict';

const express = require('express');
const { requireUser } = require('../auth');
const { html, th, csrfField, dateTime, blueTick } = require('../render');
const { t } = require('../i18n');
const { storeImage } = require('./uploads');
const { text } = require('./util');

module.exports = ({ db }) => {
  const router = express.Router();

  const latestRequest = (userId) =>
    db.get('SELECT * FROM verification_requests WHERE user_id = ? ORDER BY id DESC LIMIT 1', userId);

  const howItWorks = () => html`
    <section class="panel">
      <h2>${t('verify.howTitle')}</h2>
      <ol class="steps">
        <li><strong>${t('verify.step1.title')}</strong> ${t('verify.step1.text')}</li>
        <li><strong>${t('verify.step2.title')}</strong> ${t('verify.step2.text')}</li>
        <li><strong>${t('verify.step3.title')}</strong> ${t('verify.step3.text')}</li>
        <li><strong>${t('verify.step4.title')}</strong> ${th('verify.step4.text', { tick: blueTick() })}</li>
      </ol>
      <p class="muted small">${t('verify.perks')}</p>
    </section>`;

  const page = async (req, res, { error = '', form = {} } = {}) => {
    if (!req.user) {
      return res.page({
        title: t('verify.title'),
        body: html`<h1>${t('verify.title')}</h1>
          <p class="lead">${t('verify.lead')}</p>
          ${howItWorks()}
          <p><a class="btn" href="/register">${t('auth.createAccount')}</a> <a class="btn btn-ghost" href="/login?next=/verify">${t('nav.login')}</a></p>`,
      });
    }
    const me = await db.get('SELECT verified, verified_at, verify_code, ign FROM users WHERE id = ?', req.user.id);
    const last = await latestRequest(req.user.id);
    const fa = req.user.fa_id ? await db.get('SELECT name FROM fas WHERE id = ?', req.user.fa_id) : null;

    let status;
    if (me.verified) {
      status = html`<div class="flash flash-success">${blueTick()} ${th('verify.done', { when: dateTime(me.verified_at) })}</div>`;
    } else if (last && last.status === 'pending') {
      status = html`<div class="flash flash-info">${th('verify.pending', { when: dateTime(last.created_at), code: html`<code>${me.verify_code}</code>` })}
        ${last.upload_id ? html`<p><a href="/uploads/${last.upload_id}" target="_blank" rel="noopener">${t('verify.viewScreenshot')}</a></p>` : ''}</div>`;
    } else {
      status = html`
        ${last && last.status === 'rejected'
          ? html`<div class="flash flash-error">${last.review_note ? t('verify.rejectedNote', { note: last.review_note }) : t('verify.rejected')}</div>`
          : ''}
        <section class="panel verify-form">
          <h2>${t('verify.yourCode')}</h2>
          <p class="verify-code" aria-label="${t('verify.yourCode')}">${me.verify_code}</p>
          ${error ? html`<p class="form-error" role="alert">${error}</p>` : ''}
          <form method="post" action="/verify" class="stack" enctype="multipart/form-data">
            ${csrfField(res)}
            <div class="row">
              <label>${t('auth.ign')} <input name="ign" required maxlength="40" value="${form.ign ?? me.ign ?? ''}"></label>
              <label>${t('verify.faInGame')} <input name="fa_name" maxlength="40" value="${form.fa_name ?? (fa ? fa.name : '')}"></label>
            </div>
            <label class="upload-box">
              <span class="upload-title">📸 ${t('verify.uploadLabel')}</span>
              <span class="muted small">${t('verify.uploadHint')}</span>
              <input type="file" name="screenshot" accept="image/png,image/jpeg,image/webp" data-shrink-image>
              <img class="upload-preview" alt="" hidden>
            </label>
            <small class="muted">${t('upload.hint')}</small>
            <label>${t('verify.notes')} <span class="muted">${t('common.optional')}</span>
              <textarea name="evidence" rows="3" maxlength="1000" placeholder="${t('verify.notesHint')}">${form.evidence || ''}</textarea>
            </label>
            <button class="btn">${t('verify.send')}</button>
          </form>
        </section>`;
    }

    res.page({
      title: t('verify.title'),
      body: html`<h1>${t('verify.title')}</h1>${status}${howItWorks()}`,
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
    const file = req.files && req.files.screenshot;
    let error = '';
    if (!form.ign) error = t('verify.needIgn');
    else if (!file && !form.evidence) error = t('verify.needScreenshot');
    let uploadId = null;
    if (!error) {
      try {
        uploadId = await storeImage(db, req.user.id, file);
      } catch (err) {
        if (err.status !== 400) throw err;
        error = err.message;
      }
    }
    if (error) {
      res.status(400);
      return page(req, res, { form, error });
    }
    await db.run(
      'INSERT INTO verification_requests (user_id, code, ign, fa_name, evidence, upload_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      req.user.id, me.verify_code, form.ign, form.fa_name, form.evidence, uploadId, Date.now()
    );
    res.flash('success', t('verify.sent'));
    res.redirect('/verify');
  });

  return router;
};
