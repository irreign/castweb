'use strict';

const express = require('express');
const { requireRole, hasRole } = require('../auth');
const { html, csrfField, userLink, dateTime, markup } = require('../render');
const { t } = require('../i18n');
const { notFound, forbidden, intParam, text } = require('./util');

module.exports = ({ db }) => {
  const router = express.Router();
  router.use('/admin', requireRole('mod'));

  const screenshot = (uploadId) =>
    uploadId
      ? html`<a class="shot" href="/uploads/${uploadId}" target="_blank" rel="noopener"><img src="/uploads/${uploadId}" alt="${t('admin.screenshot')}" loading="lazy"></a>`
      : '';

  router.get('/admin', async (req, res) => {
    const pending = await db.all(`SELECT r.*, u.username, u.role, u.verified, u.created_at AS joined
           FROM verification_requests r JOIN users u ON u.id = r.user_id
          WHERE r.status = 'pending' ORDER BY r.id`);
    const reports = await db.all(`SELECT r.*, u.username, u.role, u.verified
           FROM reports r JOIN users u ON u.id = r.user_id
          WHERE r.status = 'open' ORDER BY r.id LIMIT 50`);
    const q = text(req.query.q, 24);
    const users = await db.all(
      `SELECT id, username, role, verified, banned, ign, created_at FROM users
          ${q ? "WHERE username LIKE ? ESCAPE '\\' OR ign LIKE ? ESCAPE '\\'" : ''}
          ORDER BY id DESC LIMIT 50`,
      ...(q ? Array(2).fill(`%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`) : [])
    );
    const isAdmin = hasRole(req.user, 'admin');

    res.page({
      title: t('admin.title'),
      body: html`
        <h1>${t('admin.title')}</h1>
        <section class="panel">
          <h2>${t('admin.verifications')} <span class="muted">(${pending.length})</span></h2>
          <p class="muted small">${t('admin.verifyHint')}</p>
          ${pending.length
            ? pending.map(
                (r) => html`<article class="review-card">
                  <div>
                    <p>${userLink(r)} <span class="muted small">${t('admin.joined')} ${dateTime(r.joined)} · ${t('admin.requested')} ${dateTime(r.created_at)}</span></p>
                    <dl class="facts">
                      <dt>${t('admin.code')}</dt><dd><code>${r.code}</code></dd>
                      <dt>${t('auth.ign')}</dt><dd>${r.ign}</dd>
                      <dt>${t('fa.federation')}</dt><dd>${r.fa_name || '–'}</dd>
                    </dl>
                    ${screenshot(r.upload_id)}
                    ${r.evidence ? html`<div class="prose small">${markup(r.evidence)}</div>` : ''}
                  </div>
                  <form method="post" action="/admin/requests/${r.id}" class="stack">
                    ${csrfField(res)}
                    <label>${t('admin.noteToManager')} <input name="note" maxlength="300" placeholder="${t('admin.noteRequired')}"></label>
                    <div class="row-actions">
                      <button name="decision" value="approve" class="btn btn-small">${t('admin.approve')}</button>
                      <button name="decision" value="reject" class="btn btn-danger btn-small">${t('admin.reject')}</button>
                    </div>
                  </form>
                </article>`
              )
            : html`<p class="muted">${t('admin.nothing')}</p>`}
        </section>

        <section class="panel">
          <h2>${t('admin.reports')} <span class="muted">(${reports.length})</span></h2>
          ${reports.length
            ? reports.map(
                (r) => html`<article class="review-card">
                  <div>
                    <p><span class="pill">${t(`report.kind.${r.kind}`)}</span> <strong>${r.subject}</strong></p>
                    <p class="muted small">${userLink(r)} · ${dateTime(r.created_at)}</p>
                    <div class="prose small">${markup(r.details)}</div>
                    ${screenshot(r.upload_id)}
                  </div>
                  <form method="post" action="/admin/reports/${r.id}" class="stack">
                    ${csrfField(res)}
                    <label>${t('admin.replyToReporter')} <textarea name="note" rows="3" maxlength="1000"></textarea></label>
                    <button class="btn btn-small">${t('admin.closeReport')}</button>
                  </form>
                </article>`
              )
            : html`<p class="muted">${t('admin.nothing')}</p>`}
        </section>

        <section class="panel">
          <header class="panel-head"><h2>${t('admin.users')}</h2></header>
          <form method="get" action="/admin" class="search-row" role="search">
            <input type="search" name="q" value="${q}" placeholder="${t('admin.findUser')}" aria-label="${t('admin.findUser')}">
            <button class="btn btn-small">${t('common.search')}</button>
          </form>
          <div class="table-wrap"><table>
            <thead><tr><th>${t('admin.user')}</th><th>${t('auth.ign')}</th><th>${t('admin.joined')}</th><th colspan="4"></th></tr></thead>
            <tbody>${users.map(
              (u) => html`<tr>
                <td>${userLink(u)}</td>
                <td>${u.ign || '–'}</td>
                <td>${dateTime(u.created_at)}</td>
                <td colspan="4">
                  <form method="post" action="/admin/users/${u.id}" class="user-row-form">
                    ${csrfField(res)}
                    <select name="role" aria-label="${t('admin.role')}" ${isAdmin && u.id !== req.user.id ? '' : 'disabled'}>
                      ${['user', 'mod', 'admin'].map((r) => html`<option value="${r}" ${u.role === r ? 'selected' : ''}>${t(`role.${r}`)}</option>`)}
                    </select>
                    <label class="check"><input type="checkbox" name="verified" value="1" ${u.verified ? 'checked' : ''}> ${t('admin.blueTick')}</label>
                    <label class="check"><input type="checkbox" name="banned" value="1" ${u.banned ? 'checked' : ''} ${u.id === req.user.id ? 'disabled' : ''}> ${t('admin.suspended')}</label>
                    <button class="btn btn-small">${t('common.save')}</button>
                  </form>
                </td>
              </tr>`
            )}</tbody>
          </table></div>
        </section>`,
    });
  });

  router.post('/admin/requests/:id', async (req, res) => {
    const id = intParam(req.params.id);
    const request = id && (await db.get("SELECT * FROM verification_requests WHERE id = ? AND status = 'pending'", id));
    if (!request) throw notFound(t('admin.alreadyHandled'));
    const note = text(req.body.note, 300);
    const approve = req.body.decision === 'approve';
    if (!approve && !note) {
      res.flash('error', t('admin.rejectNeedsNote'));
      return res.redirect('/admin');
    }
    const now = Date.now();
    const statements = [
      [
        'UPDATE verification_requests SET status = ?, reviewer_id = ?, review_note = ?, reviewed_at = ? WHERE id = ?',
        approve ? 'approved' : 'rejected', req.user.id, note, now, request.id,
      ],
    ];
    if (approve) {
      statements.push(['UPDATE users SET verified = 1, verified_at = ?, ign = ? WHERE id = ?', now, request.ign, request.user_id]);
    }
    await db.batch(statements);
    res.flash('success', approve ? t('admin.approved') : t('admin.rejected'));
    res.redirect('/admin');
  });

  router.post('/admin/reports/:id', async (req, res) => {
    const id = intParam(req.params.id);
    const { changes } = await db.run(
      "UPDATE reports SET status = 'closed', mod_note = ?, handled_by = ?, handled_at = ? WHERE id = ? AND status = 'open'",
      text(req.body.note, 1000), req.user.id, Date.now(), id || 0
    );
    if (!changes) throw notFound(t('admin.alreadyHandled'));
    res.flash('success', t('admin.reportClosed'));
    res.redirect('/admin');
  });

  router.post('/admin/users/:id', async (req, res) => {
    const id = intParam(req.params.id);
    const target = id && (await db.get('SELECT * FROM users WHERE id = ?', id));
    if (!target) throw notFound();
    const isAdmin = hasRole(req.user, 'admin');
    const isSelf = target.id === req.user.id;
    // Moderators can only manage regular users; admins can manage everyone but their own role/ban.
    if (!isAdmin && target.role !== 'user') throw forbidden(t('admin.adminsOnly'));

    const role = isAdmin && !isSelf && ['user', 'mod', 'admin'].includes(req.body.role) ? req.body.role : target.role;
    const verified = req.body.verified === '1' ? 1 : 0;
    const banned = isSelf ? 0 : req.body.banned === '1' ? 1 : 0;

    const statements = [
      [
        `UPDATE users SET role = ?, verified = ?, verified_at = CASE WHEN ? = 1 THEN COALESCE(verified_at, ?) ELSE NULL END,
                banned = ? WHERE id = ?`,
        role, verified, verified, Date.now(), banned, target.id,
      ],
    ];
    if (banned) statements.push(['DELETE FROM sessions WHERE user_id = ?', target.id]);
    await db.batch(statements);
    res.flash('success', t('admin.saved', { name: target.username }));
    res.redirect('/admin');
  });

  return router;
};
