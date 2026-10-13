'use strict';

// Friends tab: find managers, send/accept/decline friend requests, see your friends.
// A friendship row goes from requester to addressee; status is 'pending' until accepted.

const express = require('express');
const { requireUser } = require('../auth');
const { html, csrfField, userLink, dateTime } = require('../render');
const { t, tn } = require('../i18n');
const { notFound, badRequest, text } = require('./util');

const MAX_FRIENDS = 500;

// Relationship between two users, from `me`'s point of view:
// 'none' | 'friends' | 'sent' (I asked them) | 'received' (they asked me)
async function relationship(db, meId, otherId) {
  const row = await db.get(
    `SELECT requester_id, status FROM friendships
      WHERE (requester_id = ? AND addressee_id = ?) OR (requester_id = ? AND addressee_id = ?)`,
    meId, otherId, otherId, meId
  );
  if (!row) return 'none';
  if (row.status === 'accepted') return 'friends';
  return row.requester_id === meId ? 'sent' : 'received';
}

// Buttons shown next to another user (profile page, search results, lists).
function friendButton(res, other, rel) {
  const form = (action, label, cls = 'btn btn-small') =>
    html`<form method="post" action="/friends/${action}" class="inline">${csrfField(res)}<input type="hidden" name="username" value="${other.username}"><button class="${cls}">${label}</button></form>`;
  switch (rel) {
    case 'friends':
      return html`<span class="pill pill-green">✓ ${t('friends.areFriends')}</span>`;
    case 'sent':
      return html`<span class="pill">${t('friends.requestSent')}</span> ${form('cancel', t('friends.cancel'), 'btn-link')}`;
    case 'received':
      return html`${form('accept', t('friends.accept'))} ${form('decline', t('friends.decline'), 'btn btn-ghost btn-small')}`;
    default:
      return form('add', `+ ${t('friends.add')}`);
  }
}

function routes({ db }) {
  const router = express.Router();

  const findUser = async (username) => {
    const user = await db.get('SELECT id, username, banned FROM users WHERE username = ?', text(username, 24));
    if (!user || user.banned) throw notFound(t('friends.noSuchUser'));
    return user;
  };

  // Back to where the button was pressed, if that was on this site.
  const back = (req, fallback = '/friends') => {
    const ref = req.get('referer');
    try {
      const url = new URL(ref);
      if (url.host === req.get('host')) return url.pathname + url.search;
    } catch {
      // no or bad referer
    }
    return fallback;
  };

  router.get('/friends', async (req, res) => {
    if (!req.user) {
      return res.page({
        title: t('nav.friends'),
        active: '/friends',
        body: html`<h1>${t('nav.friends')}</h1>
          <section class="empty">
            <p class="lead">${t('friends.loggedOut')}</p>
            <a class="btn" href="/register">${t('nav.join')}</a> <a class="btn btn-ghost" href="/login?next=/friends">${t('nav.login')}</a>
          </section>`,
      });
    }
    const me = req.user.id;
    const q = text(req.query.q, 40);
    const cols = 'u.id, u.username, u.role, u.verified, u.ign, f.name AS fa_name, f.id AS fa_id';
    const [friends, incoming, outgoing, results] = await Promise.all([
      db.all(
        `SELECT ${cols}, fr.accepted_at FROM friendships fr
           JOIN users u ON u.id = CASE WHEN fr.requester_id = ? THEN fr.addressee_id ELSE fr.requester_id END
           LEFT JOIN fas f ON f.id = u.fa_id
          WHERE fr.status = 'accepted' AND (fr.requester_id = ? OR fr.addressee_id = ?) AND u.banned = 0
          ORDER BY u.username COLLATE NOCASE`,
        me, me, me
      ),
      db.all(
        `SELECT ${cols}, fr.created_at FROM friendships fr JOIN users u ON u.id = fr.requester_id
           LEFT JOIN fas f ON f.id = u.fa_id
          WHERE fr.addressee_id = ? AND fr.status = 'pending' AND u.banned = 0 ORDER BY fr.created_at DESC`,
        me
      ),
      db.all(
        `SELECT ${cols}, fr.created_at FROM friendships fr JOIN users u ON u.id = fr.addressee_id
           LEFT JOIN fas f ON f.id = u.fa_id
          WHERE fr.requester_id = ? AND fr.status = 'pending' ORDER BY fr.created_at DESC`,
        me
      ),
      q
        ? db.all(
            `SELECT ${cols},
                    (SELECT CASE WHEN fr.status = 'accepted' THEN 'friends'
                                 WHEN fr.requester_id = ? THEN 'sent' ELSE 'received' END
                       FROM friendships fr
                      WHERE (fr.requester_id = ? AND fr.addressee_id = u.id) OR (fr.requester_id = u.id AND fr.addressee_id = ?)) AS rel
               FROM users u LEFT JOIN fas f ON f.id = u.fa_id
              WHERE u.id != ? AND u.banned = 0
                AND (u.username LIKE ? ESCAPE '\\' OR u.ign LIKE ? ESCAPE '\\')
              ORDER BY u.verified DESC, u.username COLLATE NOCASE LIMIT 20`,
            me, me, me, me,
            ...Array(2).fill(`%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`)
          )
        : [],
    ]);

    const person = (u, actions) => html`<li class="person">
      <div class="avatar" aria-hidden="true">${u.username.slice(0, 1).toUpperCase()}</div>
      <div class="person-info">
        ${userLink(u)}
        <span class="small muted">${[u.ign && t('friends.ign', { ign: u.ign }), u.fa_name].filter(Boolean).join(' · ')}</span>
      </div>
      <div class="person-actions">${actions}</div>
    </li>`;

    res.page({
      title: t('nav.friends'),
      active: '/friends',
      body: html`
        <h1>${t('nav.friends')}</h1>
        <p class="lead">${t('friends.lead')}</p>
        <section class="panel">
          <h2>${t('friends.find')}</h2>
          <form method="get" action="/friends" class="search-row" role="search">
            <input type="search" name="q" value="${q}" placeholder="${t('friends.searchPlaceholder')}" aria-label="${t('friends.find')}">
            <button class="btn btn-small">${t('common.search')}</button>
          </form>
          ${q
            ? results.length
              ? html`<ul class="people">${results.map((u) => person(u, friendButton(res, u, u.rel || 'none')))}</ul>`
              : html`<p class="muted">${t('friends.noResults', { q })}</p>`
            : ''}
        </section>

        ${incoming.length
          ? html`<section class="panel highlight">
              <h2>${t('friends.incoming')} <span class="badge">${incoming.length}</span></h2>
              <ul class="people">${incoming.map((u) => person(u, html`${friendButton(res, u, 'received')} <span class="small muted">${dateTime(u.created_at)}</span>`))}</ul>
            </section>`
          : ''}

        <section class="panel">
          <h2>${t('friends.yourFriends')} <span class="muted">(${friends.length})</span></h2>
          ${friends.length
            ? html`<ul class="people">${friends.map((u) =>
                person(
                  u,
                  html`<form method="post" action="/friends/remove" class="inline" data-confirm="${t('friends.removeConfirm', { name: u.username })}">${csrfField(res)}<input type="hidden" name="username" value="${u.username}"><button class="btn-link danger">${t('friends.remove')}</button></form>`
                )
              )}</ul>`
            : html`<p class="muted">${t('friends.none')}</p>`}
        </section>

        ${outgoing.length
          ? html`<section class="panel">
              <h2>${t('friends.outgoing')}</h2>
              <ul class="people">${outgoing.map((u) => person(u, friendButton(res, u, 'sent')))}</ul>
            </section>`
          : ''}`,
    });
  });

  router.post('/friends/add', requireUser, async (req, res) => {
    const other = await findUser(req.body.username);
    if (other.id === req.user.id) throw badRequest(t('friends.notYourself'));
    const rel = await relationship(db, req.user.id, other.id);
    if (rel === 'received') {
      // They already asked us: adding them back accepts their request.
      await db.run(
        "UPDATE friendships SET status = 'accepted', accepted_at = ? WHERE requester_id = ? AND addressee_id = ?",
        Date.now(), other.id, req.user.id
      );
      res.flash('success', t('friends.nowFriends', { name: other.username }));
    } else if (rel === 'none') {
      const { n } = await db.get(
        'SELECT COUNT(*) AS n FROM friendships WHERE requester_id = ? OR addressee_id = ?',
        req.user.id, req.user.id
      );
      if (n >= MAX_FRIENDS) throw badRequest(tn('friends.limit', MAX_FRIENDS));
      await db.run(
        'INSERT OR IGNORE INTO friendships (requester_id, addressee_id, created_at) VALUES (?, ?, ?)',
        req.user.id, other.id, Date.now()
      );
      res.flash('success', t('friends.sent', { name: other.username }));
    }
    res.redirect(back(req));
  });

  router.post('/friends/accept', requireUser, async (req, res) => {
    const other = await findUser(req.body.username);
    const { changes } = await db.run(
      "UPDATE friendships SET status = 'accepted', accepted_at = ? WHERE requester_id = ? AND addressee_id = ? AND status = 'pending'",
      Date.now(), other.id, req.user.id
    );
    if (changes) res.flash('success', t('friends.nowFriends', { name: other.username }));
    res.redirect(back(req));
  });

  // Decline a request to me, cancel my own request, or unfriend: each removes the row.
  const removing = (path, sql, params, flashKey) =>
    router.post(path, requireUser, async (req, res) => {
      const other = await findUser(req.body.username);
      const { changes } = await db.run(sql, ...params(req.user.id, other.id));
      if (changes) res.flash('success', t(flashKey, { name: other.username }));
      res.redirect(back(req));
    });
  const PENDING = "DELETE FROM friendships WHERE requester_id = ? AND addressee_id = ? AND status = 'pending'";
  removing('/friends/decline', PENDING, (me, other) => [other, me], 'friends.declined');
  removing('/friends/cancel', PENDING, (me, other) => [me, other], 'friends.cancelled');
  removing(
    '/friends/remove',
    "DELETE FROM friendships WHERE status = 'accepted' AND ((requester_id = ? AND addressee_id = ?) OR (requester_id = ? AND addressee_id = ?))",
    (me, other) => [me, other, other, me],
    'friends.removed'
  );

  return router;
}

module.exports = routes;
module.exports.relationship = relationship;
module.exports.friendButton = friendButton;
