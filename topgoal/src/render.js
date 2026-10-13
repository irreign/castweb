'use strict';

// Tiny HTML templating. Every interpolated value is escaped unless it was
// produced by `html` itself or wrapped in `raw()`, so templates are XSS-safe
// by default.

const { t, tn, message, currentLang, LANGUAGES } = require('./i18n');

class SafeHtml {
  constructor(value) {
    this.value = value;
  }
  toString() {
    return this.value;
  }
}

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

function escape(value) {
  return String(value).replace(/[&<>"']/g, (c) => ESCAPES[c]);
}

function toHtml(value) {
  if (value === null || value === undefined || value === false) return '';
  if (value instanceof SafeHtml) return value.value;
  if (Array.isArray(value)) return value.map(toHtml).join('');
  return escape(value);
}

function html(strings, ...values) {
  let out = strings[0];
  for (let i = 0; i < values.length; i++) out += toHtml(values[i]) + strings[i + 1];
  return new SafeHtml(out);
}

function raw(value) {
  return new SafeHtml(String(value));
}

// ─── Formatting helpers ────────────────────────────────────────────────────

function slugify(text) {
  return String(text)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

// Translated message as HTML: the message text is escaped and each {name} is replaced by
// vars[name], which may itself be html`` (e.g. a link).
function th(key, vars = {}) {
  const template = message(key, vars.count ?? vars.n);
  return raw(
    template
      .split(/(\{\w+\})/)
      .map((part) => {
        const name = /^\{(\w+)\}$/.exec(part)?.[1];
        return name && name in vars ? toHtml(vars[name]) : escape(part);
      })
      .join('')
  );
}

const RELATIVE_UNITS = [
  ['year', 31536000],
  ['month', 2592000],
  ['day', 86400],
  ['hour', 3600],
  ['minute', 60],
];

function timeAgo(ms) {
  const s = Math.round((Date.now() - ms) / 1000);
  if (s < 60) return t('time.justNow');
  const rtf = new Intl.RelativeTimeFormat(currentLang(), { numeric: 'auto', style: 'short' });
  for (const [unit, size] of RELATIVE_UNITS) {
    if (s >= size) return rtf.format(-Math.floor(s / size), unit);
  }
  return t('time.justNow');
}

function dateTime(ms) {
  return html`<time datetime="${new Date(ms).toISOString()}" title="${new Date(ms).toUTCString()}">${timeAgo(ms)}</time>`;
}

function utcDate(ms) {
  return new Date(ms).toISOString().slice(0, 16).replace('T', ' ') + ' UTC';
}

// Format value for an <input type="datetime-local">, in UTC.
function toDateTimeLocal(ms) {
  return new Date(ms).toISOString().slice(0, 16);
}

function daysLeft(endsAt, now = Date.now()) {
  return Math.max(0, Math.floor((endsAt - now) / 86400000));
}

// ─── Lightweight markup for posts and wiki pages ───────────────────────────
// Supports: # headings, - lists, **bold**, *italic*, `code`, ```code blocks```,
// [text](https://link), bare https:// links, > quotes and [[Wiki Links]].

function inline(text, wikiExists) {
  let s = escape(text);
  const codes = [];
  s = s.replace(/`([^`]+)`/g, (_, c) => {
    codes.push(c);
    return `\u0000${codes.length - 1}\u0000`;
  });
  s = s.replace(/\[\[([^\]|]{1,80})\]\]/g, (_, title) => {
    const slug = slugify(title.replace(/&amp;/g, '&').replace(/&#39;/g, "'"));
    if (!slug) return title;
    const missing = wikiExists && !wikiExists(slug);
    return `<a href="/wiki/${slug}" class="wikilink${missing ? ' missing' : ''}">${title}</a>`;
  });
  s = s.replace(
    /\[([^\]]{1,200})\]\((https?:\/\/[^\s)"<]+)\)/g,
    (_, label, url) => `<a href="${url}" rel="nofollow noopener" target="_blank">${label}</a>`
  );
  s = s.replace(
    /(^|[\s(])(https?:\/\/[^\s<)"]+)/g,
    (_, pre, url) => `${pre}<a href="${url}" rel="nofollow noopener" target="_blank">${url}</a>`
  );
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>');
  s = s.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${codes[Number(i)]}</code>`);
  return s;
}

// Slugs of every [[Wiki Link]] in a piece of text, so callers can look them up before rendering.
function wikiLinkSlugs(source) {
  const slugs = new Set();
  for (const m of String(source).matchAll(/\[\[([^\]|]{1,80})\]\]/g)) {
    const slug = slugify(m[1]);
    if (slug) slugs.add(slug);
  }
  return slugs;
}

function markup(source, { wikiExists } = {}) {
  const lines = String(source).replace(/\r\n?/g, '\n').split('\n');
  const out = [];
  let list = null;
  let para = [];
  let code = null;

  const flushPara = () => {
    if (para.length) out.push(`<p>${para.map((l) => inline(l, wikiExists)).join('<br>')}</p>`);
    para = [];
  };
  const flushList = () => {
    if (list) out.push(`<${list.tag}>${list.items.map((i) => `<li>${inline(i, wikiExists)}</li>`).join('')}</${list.tag}>`);
    list = null;
  };

  for (const line of lines) {
    if (code !== null) {
      if (line.trim().startsWith('```')) {
        out.push(`<pre><code>${escape(code.join('\n'))}</code></pre>`);
        code = null;
      } else {
        code.push(line);
      }
      continue;
    }
    if (line.trim().startsWith('```')) {
      flushPara();
      flushList();
      code = [];
      continue;
    }
    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    const bullet = line.match(/^\s*[-*]\s+(.+)$/);
    const numbered = line.match(/^\s*\d+[.)]\s+(.+)$/);
    const quote = line.match(/^>\s?(.*)$/);
    if (heading) {
      flushPara();
      flushList();
      const level = heading[1].length + 1; // # -> h2, page title is h1
      out.push(`<h${level}>${inline(heading[2], wikiExists)}</h${level}>`);
    } else if (bullet || numbered) {
      flushPara();
      const tag = bullet ? 'ul' : 'ol';
      if (!list || list.tag !== tag) {
        flushList();
        list = { tag, items: [] };
      }
      list.items.push((bullet || numbered)[1]);
    } else if (quote) {
      flushPara();
      flushList();
      out.push(`<blockquote>${inline(quote[1], wikiExists)}</blockquote>`);
    } else if (line.trim() === '') {
      flushPara();
      flushList();
    } else {
      flushList();
      para.push(line);
    }
  }
  if (code !== null) out.push(`<pre><code>${escape(code.join('\n'))}</code></pre>`);
  flushPara();
  flushList();
  return raw(out.join('\n'));
}

// ─── Shared fragments ──────────────────────────────────────────────────────

const TICK_PATH =
  'M22.5 12.5c0-1.58-.88-2.95-2.15-3.6.15-.44.23-.91.23-1.4 0-2.21-1.71-4-3.82-4-.47 0-.92.08-1.34.25C14.81 2.48 13.49 1.5 12 1.5s-2.8.97-3.42 2.25c-.42-.17-.87-.25-1.34-.25-2.11 0-3.82 1.79-3.82 4 0 .49.08.96.23 1.4-1.27.65-2.15 2.02-2.15 3.6 0 1.5.8 2.8 1.97 3.48-.04.24-.06.48-.06.73 0 2.21 1.71 4 3.82 4 .47 0 .92-.09 1.34-.25.62 1.29 1.93 2.25 3.43 2.25s2.81-.96 3.43-2.25c.42.16.87.25 1.34.25 2.11 0 3.82-1.79 3.82-4 0-.25-.02-.49-.06-.73 1.17-.68 1.97-1.98 1.97-3.48zm-6.4-3.8-5.2 7.8a.75.75 0 0 1-1.15.12l-2.9-2.9 1.06-1.06 2.25 2.24 4.69-7.04 1.25.84z';

function blueTick() {
  const label = t('user.verifiedManager');
  return html`<svg class="tick" viewBox="0 0 24 24" aria-label="${label}" role="img"><title>${label}</title><path fill="currentColor" d="${TICK_PATH}"/></svg>`;
}

function userLink(u, opts = {}) {
  if (!u || !u.username) return html`<span class="user deleted">${t('user.unknown')}</span>`;
  return html`<a class="user role-${u.role || 'user'}" href="/u/${encodeURIComponent(u.username)}">${u.username}${u.verified ? blueTick() : ''}${
    opts.showRole && u.role && u.role !== 'user' ? html`<span class="role-badge">${t(`role.${u.role}`)}</span>` : ''
  }</a>`;
}

function csrfField(res) {
  return html`<input type="hidden" name="_csrf" value="${res.locals.csrf}">`;
}

function flashBox(flash) {
  if (!flash) return '';
  return html`<div class="flash flash-${flash.type}" role="status">${flash.message}</div>`;
}

// Name of a default forum category in the current language (custom ones keep their own name).
function categoryName(c) {
  const key = `cat.${c.slug}.name`;
  const name = t(key);
  return name === key ? c.name : name;
}

function categoryDescription(c) {
  const key = `cat.${c.slug}.desc`;
  const desc = t(key);
  return desc === key ? c.description : desc;
}

// Main tabs: [path, message key, icon]
const TABS = [
  ['/', 'nav.home', '🏟️'],
  ['/news', 'nav.news', '📰'],
  ['/forum', 'nav.chat', '💬'],
  ['/fas', 'nav.federations', '🛡️'],
  ['/friends', 'nav.friends', '🤝'],
  ['/season', 'nav.season', '⏱️'],
  ['/wiki', 'nav.wiki', '📖'],
  ['/rankings', 'nav.rankings', '🏆'],
  ['/report', 'nav.reportTab', '🚩'],
];

function badge(n) {
  return n > 0 ? html`<span class="badge" aria-label="${tn('nav.badge', n)}">${n > 99 ? '99+' : n}</span>` : '';
}

function layout(req, res, { title, body, active }) {
  const user = req.user;
  const lang = currentLang();
  const counts = res.locals.counts || {};
  const here = req.method === 'GET' ? req.originalUrl : '/';
  const tabs = TABS.map(
    ([href, key, icon]) => html`<li><a href="${href}"${active === href ? raw(' aria-current="page"') : ''}><span class="tab-icon" aria-hidden="true">${icon}</span><span class="tab-label">${t(key)}</span>${
      href === '/friends' ? badge(counts.friendRequests) : ''
    }</a></li>`
  );
  const languages = LANGUAGES.map(
    ([code, name]) => html`<li><a href="/lang/${code}?next=${encodeURIComponent(here)}" lang="${code}" hreflang="${code}"${code === lang ? raw(' aria-current="true"') : ''}>${name}</a></li>`
  );
  const account = user
    ? html`
        ${user.role !== 'user' ? html`<a href="/admin" class="nav-admin">${t('nav.admin')}${badge(counts.modQueue)}</a>` : ''}
        ${userLink(user)}
        <a href="/settings" class="nav-settings" title="${t('nav.settings')}" aria-label="${t('nav.settings')}">⚙️</a>
        <form method="post" action="/logout" class="inline">${csrfField(res)}<button class="btn-link">${t('nav.logout')}</button></form>`
    : html`<a href="/login">${t('nav.login')}</a> <a href="/register" class="btn btn-small">${t('nav.join')}</a>`;

  return html`<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title ? `${title} · ` : ''}TopGoal Hub</title>
<meta name="description" content="${t('site.description')}">
<meta name="theme-color" content="#0b3d22">
<link rel="stylesheet" href="/static/style.css">
<link rel="icon" href="/static/favicon.svg" type="image/svg+xml">
<script src="/static/app.js" defer></script>
</head>
<body>
<header class="site-header">
  <div class="wrap header-row">
    <a class="brand" href="/"><span class="brand-mark" aria-hidden="true">⚽</span> TopGoal <span class="brand-hub">Hub</span></a>
    <div class="header-tools">
      <details class="lang-menu">
        <summary aria-label="${t('nav.language')}"><span aria-hidden="true">🌐</span> ${lang.toUpperCase()}</summary>
        <ul>${languages}</ul>
      </details>
      <div class="account">${account}</div>
    </div>
  </div>
  <nav class="tabbar" aria-label="${t('nav.main')}">
    <div class="wrap"><ul>${tabs}</ul></div>
  </nav>
</header>
<main class="wrap">
  <div class="board">
${flashBox(res.locals.flash)}
${body}
  </div>
</main>
<footer class="site-footer">
  <div class="wrap">
    <p>${t('site.disclaimer')}</p>
    <p><a href="/rules">${t('nav.rules')}</a> · <a href="/verify">${t('nav.verify')}</a> · <a href="/report">${t('nav.report')}</a></p>
  </div>
</footer>
</body>
</html>`;
}

module.exports = {
  html,
  raw,
  escape,
  th,
  slugify,
  timeAgo,
  dateTime,
  utcDate,
  toDateTimeLocal,
  daysLeft,
  markup,
  wikiLinkSlugs,
  blueTick,
  userLink,
  csrfField,
  categoryName,
  categoryDescription,
  layout,
};
