'use strict';

// Report tab: private reports to the moderators (site problems, game bugs, players breaking
// the rules). Only the reporter and moderators can see a report.

const express = require('express');
const { requireUser, rateLimiter, hasRole } = require('../auth');
const { html, th, csrfField, dateTime } = require('../render');
const { t } = require('../i18n');
const { storeImage } = require('./uploads');
const { text } = require('./util');

const KINDS = ['site', 'game', 'player', 'other'];

module.exports = ({ db }) => {
  const router = express.Router();
  const limiter = rateLimiter({ windowMs: 60 * 60 * 1000, max: 10 });

  const page = async (req, res, { error = '', form = {} } = {}) => {
    const mine = req.user
      ? await db.all(
          'SELECT id, kind, subject, status, mod_note, created_at, handled_at FROM reports WHERE user_id = ? ORDER BY id DESC LIMIT 20',
          req.user.id
        )
      : [];
    res.page({
      title: t('nav.report'),
      active: '/report',
      body: html`
        <h1>${t('report.title')}</h1>
        <p class="lead">${t('report.lead')}</p>
        <div class="grid-2 report-grid">
          <section class="panel">
            <h2>${t('report.new')}</h2>
            ${req.user
              ? html`${error ? html`<p class="form-error" role="alert">${error}</p>` : ''}
                <form method="post" action="/report" class="stack" enctype="multipart/form-data">
                  ${csrfField(res)}
                  <fieldset class="kind-picker">
                    <legend>${t('report.kind')}</legend>
                    ${KINDS.map(
                      (k) => html`<label class="kind-option"><input type="radio" name="kind" value="${k}" ${(form.kind || 'site') === k ? 'checked' : ''}> <span>${t(`report.kind.${k}`)}</span></label>`
                    )}
                  </fieldset>
                  <label>${t('report.subject')} <input name="subject" value="${form.subject || ''}" required maxlength="120"></label>
                  <label>${t('report.details')} <textarea name="details" rows="6" required maxlength="5000" placeholder="${t('report.detailsHint')}">${form.details || ''}</textarea></label>
                  <label>${t('report.screenshot')} <span class="muted">${t('common.optional')}</span>
                    <input type="file" name="screenshot" accept="image/png,image/jpeg,image/webp" data-shrink-image>
                  </label>
                  <small class="muted">${t('upload.hint')}</small>
                  <button class="btn">${t('report.send')}</button>
                </form>`
              : html`<p>${th('report.loginFirst', { link: html`<a href="/login?next=/report">${t('nav.login')}</a>` })}</p>`}
          </section>
          <aside class="stack-gap">
            <section class="panel">
              <h2>${t('report.yours')}</h2>
              ${mine.length
                ? html`<ul class="list">${mine.map(
                    (r) => html`<li>
                      <span class="list-title">${r.subject}</span>
                      <span class="meta">${t(`report.kind.${r.kind}`)} · ${dateTime(r.created_at)} ·
                        ${r.status === 'open' ? html`<span class="pill">${t('report.status.open')}</span>` : html`<span class="pill pill-green">${t('report.status.closed')}</span>`}</span>
                      ${r.mod_note ? html`<blockquote class="small">${t('report.modReply')}: ${r.mod_note}</blockquote>` : ''}
                    </li>`
                  )}</ul>`
                : html`<p class="muted">${t('report.noneYet')}</p>`}
            </section>
            <section class="panel">
              <h2>${t('report.publicHelp')}</h2>
              <p class="muted">${t('report.publicHelpText')}</p>
              <a class="btn btn-ghost btn-small" href="/forum/help-bugs">${t('report.openHelpForum')}</a>
            </section>
          </aside>
        </div>`,
    });
  };

  router.get('/report', async (req, res) => page(req, res));

  router.post('/report', requireUser, async (req, res) => {
    const form = {
      kind: KINDS.includes(req.body.kind) ? req.body.kind : 'other',
      subject: text(req.body.subject, 120),
      details: text(req.body.details, 5000),
    };
    if (!form.subject || !form.details) {
      res.status(400);
      return page(req, res, { form, error: t('report.missing') });
    }
    if (!hasRole(req.user, 'mod') && limiter.hit(`report:${req.user.id}`)) {
      res.status(429);
      return page(req, res, { form, error: t('report.tooMany') });
    }
    let uploadId;
    try {
      uploadId = await storeImage(db, req.user.id, req.files && req.files.screenshot);
    } catch (err) {
      if (err.status !== 400) throw err;
      res.status(400);
      return page(req, res, { form, error: err.message });
    }
    await db.run(
      'INSERT INTO reports (user_id, kind, subject, details, upload_id, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      req.user.id, form.kind, form.subject, form.details, uploadId, Date.now()
    );
    res.flash('success', t('report.thanks'));
    res.redirect('/report');
  });

  return router;
};

