'use strict';

// Tiny HTML templating. Every interpolated value is escaped unless it was
// produced by `html` itself or wrapped in `raw()`, so templates are XSS-safe
// by default.

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

function timeAgo(ms) {
  const s = Math.round((Date.now() - ms) / 1000);
  if (s < 60) return 'just now';
  const units = [
    ['y', 31536000],
    ['mo', 2592000],
    ['d', 86400],
    ['h', 3600],
    ['m', 60],
  ];
  for (const [label, size] of units) {
    if (s >= size) return `${Math.floor(s / size)}${label} ago`;
  }
  return 'just now';
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

const BLUE_TICK = raw(
  '<svg class="tick" viewBox="0 0 24 24" aria-label="Verified manager" role="img"><title>Verified manager</title><path fill="currentColor" d="M22.5 12.5c0-1.58-.88-2.95-2.15-3.6.15-.44.23-.91.23-1.4 0-2.21-1.71-4-3.82-4-.47 0-.92.08-1.34.25C14.81 2.48 13.49 1.5 12 1.5s-2.8.97-3.42 2.25c-.42-.17-.87-.25-1.34-.25-2.11 0-3.82 1.79-3.82 4 0 .49.08.96.23 1.4-1.27.65-2.15 2.02-2.15 3.6 0 1.5.8 2.8 1.97 3.48-.04.24-.06.48-.06.73 0 2.21 1.71 4 3.82 4 .47 0 .92-.09 1.34-.25.62 1.29 1.93 2.25 3.43 2.25s2.81-.96 3.43-2.25c.42.16.87.25 1.34.25 2.11 0 3.82-1.79 3.82-4 0-.25-.02-.49-.06-.73 1.17-.68 1.97-1.98 1.97-3.48zm-6.4-3.8-5.2 7.8a.75.75 0 0 1-1.15.12l-2.9-2.9 1.06-1.06 2.25 2.24 4.69-7.04 1.25.84z"/></svg>'
);

function userLink(u, opts = {}) {
  if (!u || !u.username) return html`<span class="user deleted">unknown</span>`;
  return html`<a class="user role-${u.role || 'user'}" href="/u/${encodeURIComponent(u.username)}">${u.username}${u.verified ? BLUE_TICK : ''}${
    opts.showRole && u.role && u.role !== 'user' ? html`<span class="role-badge">${u.role}</span>` : ''
  }</a>`;
}

function csrfField(res) {
  return html`<input type="hidden" name="_csrf" value="${res.locals.csrf}">`;
}

function flashBox(flash) {
  if (!flash) return '';
  return html`<div class="flash flash-${flash.type}" role="status">${flash.message}</div>`;
}

const NAV = [
  ['/', 'Home'],
  ['/forum', 'Forums'],
  ['/wiki', 'Wiki'],
  ['/season', 'Season'],
  ['/fas', 'FAs'],
  ['/rankings', 'Rankings'],
];

function layout(req, res, { title, body, active }) {
  const user = req.user;
  const navItems = NAV.map(
    ([href, label]) => html`<li><a href="${href}"${active === href ? raw(' aria-current="page"') : ''}>${label}</a></li>`
  );
  const account = user
    ? html`
        ${user.role !== 'user' ? html`<a href="/admin" class="nav-admin">Admin</a>` : ''}
        ${userLink(user)}
        <form method="post" action="/logout" class="inline">${csrfField(res)}<button class="btn-link">Log out</button></form>`
    : html`<a href="/login">Log in</a> <a href="/register" class="btn btn-small">Join</a>`;

  return html`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title ? `${title} · ` : ''}TopGoal Hub</title>
<meta name="description" content="Fan-run community for TopGoal players: forums, wiki, season countdown, pack players and FA rankings.">
<link rel="stylesheet" href="/static/style.css">
<link rel="icon" href="/static/favicon.svg" type="image/svg+xml">
<script src="/static/app.js" defer></script>
</head>
<body>
<header class="site-header">
  <div class="wrap header-row">
    <a class="brand" href="/"><span class="brand-mark">⚽</span> TopGoal <span class="brand-hub">Hub</span></a>
    <button class="nav-toggle" aria-expanded="false" aria-controls="site-nav">Menu</button>
    <nav id="site-nav" class="site-nav">
      <ul>${navItems}</ul>
      <div class="account">${account}</div>
    </nav>
  </div>
</header>
<main class="wrap">
${flashBox(res.locals.flash)}
${body}
</main>
<footer class="site-footer">
  <div class="wrap">
    <p>TopGoal Hub is an unofficial, fan-made community. It is not affiliated with or endorsed by the makers of TopGoal.</p>
    <p><a href="/wiki">Wiki</a> · <a href="/forum">Forums</a> · <a href="/verify">Get verified</a> · <a href="/rules">Community rules</a></p>
  </div>
</footer>
</body>
</html>`;
}

module.exports = {
  html,
  raw,
  escape,
  slugify,
  timeAgo,
  dateTime,
  utcDate,
  toDateTimeLocal,
  daysLeft,
  markup,
  userLink,
  csrfField,
  layout,
  BLUE_TICK,
};
