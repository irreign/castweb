'use strict';

const express = require('express');
const { requireRole, hasRole } = require('../auth');
const { html, csrfField, userLink, dateTime, markup } = require('../render');
const { notFound, forbidden, intParam, text } = require('./util');

module.exports = ({ db }) => {
  const router = express.Router();
  router.use('/admin', requireRole('mod'));

  router.get('/admin', async (req, res) => {
    const pending = await db.all(`SELECT r.*, u.username, u.role, u.verified, u.created_at AS joined
           FROM verification_requests r JOIN users u ON u.id = r.user_id
          WHERE r.status = 'pending' ORDER BY r.id`);
    const q = text(req.query.q, 24);
    const users = await db.all(`SELECT id, username, role, verified, banned, ign, created_at FROM users
          ${q ? "WHERE username LIKE ? ESCAPE '\\' OR ign LIKE ? ESCAPE '\\'" : ''}
          ORDER BY id DESC LIMIT 50`, ...(q ? Array(2).fill(`%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`) : []));
    const isAdmin = hasRole(req.user, 'admin');

    res.page({
      title: 'Moderation',
      body: html`
        <h1>Moderation</h1>
        <section class="panel">
          <h2>Verification requests <span class="muted">(${pending.length} pending)</span></h2>
          <p class="muted small">Look the manager up in TopGoal and check the code appears on their profile before approving.</p>
          ${pending.length
            ? pending.map(
                (r) => html`<article class="review-card">
                  <div>
                    <p>${userLink(r)} <span class="muted small">joined ${dateTime(r.joined)} · requested ${dateTime(r.created_at)}</span></p>
                    <dl class="facts">
                      <dt>Code</dt><dd><code>${r.code}</code></dd>
                      <dt>In-game name</dt><dd>${r.ign}</dd>
                      <dt>FA</dt><dd>${r.fa_name || '–'}</dd>
                    </dl>
                    <div class="prose small">${markup(r.evidence)}</div>
                  </div>
                  <form method="post" action="/admin/requests/${r.id}" class="stack">
                    ${csrfField(res)}
                    <label>Note to the manager <input name="note" maxlength="300" placeholder="Required when rejecting"></label>
                    <div class="row-actions">
                      <button name="decision" value="approve" class="btn btn-small">Approve</button>
                      <button name="decision" value="reject" class="btn btn-danger btn-small">Reject</button>
                    </div>
                  </form>
                </article>`
              )
            : html`<p class="muted">Nothing to review.</p>`}
        </section>

        <section class="panel">
          <header class="panel-head"><h2>Users</h2></header>
          <form method="get" action="/admin" class="search-row" role="search">
            <input type="search" name="q" value="${q}" placeholder="Find by username or in-game name" aria-label="Find user">
            <button class="btn btn-small">Search</button>
          </form>
          <div class="table-wrap"><table>
            <thead><tr><th>User</th><th>IGN</th><th>Joined</th><th>Role</th><th>Verified</th><th>Status</th><th></th></tr></thead>
            <tbody>${users.map(
              (u) => html`<tr>
                <td>${userLink(u)}</td>
                <td>${u.ign || '–'}</td>
                <td>${dateTime(u.created_at)}</td>
                <td colspan="4">
                  <form method="post" action="/admin/users/${u.id}" class="user-row-form">
                    ${csrfField(res)}
                    <select name="role" aria-label="Role" ${isAdmin && u.id !== req.user.id ? '' : 'disabled'}>
                      ${['user', 'mod', 'admin'].map((r) => html`<option value="${r}" ${u.role === r ? 'selected' : ''}>${r}</option>`)}
                    </select>
                    <label class="check"><input type="checkbox" name="verified" value="1" ${u.verified ? 'checked' : ''}> Blue tick</label>
                    <label class="check"><input type="checkbox" name="banned" value="1" ${u.banned ? 'checked' : ''} ${u.id === req.user.id ? 'disabled' : ''}> Suspended</label>
                    <button class="btn btn-small">Save</button>
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
    const request = id && await db.get("SELECT * FROM verification_requests WHERE id = ? AND status = 'pending'", id);
    if (!request) throw notFound('That request was already handled or does not exist.');
    const note = text(req.body.note, 300);
    const approve = req.body.decision === 'approve';
    if (!approve && !note) {
      res.flash('error', 'Add a short note explaining why the request was rejected.');
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
    res.flash('success', approve ? 'Approved. The blue tick is live.' : 'Request rejected.');
    res.redirect('/admin');
  });

  router.post('/admin/users/:id', async (req, res) => {
    const id = intParam(req.params.id);
    const target = id && await db.get('SELECT * FROM users WHERE id = ?', id);
    if (!target) throw notFound('User not found.');
    const isAdmin = hasRole(req.user, 'admin');
    const isSelf = target.id === req.user.id;
    // Moderators can only manage regular users; admins can manage everyone but themselves' role/ban.
    if (!isAdmin && target.role !== 'user') throw forbidden('Only admins can change moderators and admins.');

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
    res.flash('success', `Saved ${target.username}.`);
    res.redirect('/admin');
  });

  return router;
};
