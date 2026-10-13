'use strict';

// Interface translations. The current request's language is kept in AsyncLocalStorage,
// so any code running for a request can call t('key') without passing the request around.
//
//   t('nav.home')                       -> "Home" / "Home" / "Strona główna"
//   t('forum.byUser', { name })         -> fills {name}
//   tn('forum.posts', 3)                -> picks the plural form for 3 and fills {n}
//
// Messages live in src/locales/<lang>.js. A plural message is an object keyed by
// Intl.PluralRules categories (one, few, many, other).

const { AsyncLocalStorage } = require('node:async_hooks');

const MESSAGES = {
  en: require('./locales/en'),
  it: require('./locales/it'),
  pl: require('./locales/pl'),
};
const LANGUAGES = [
  ['en', 'English'],
  ['it', 'Italiano'],
  ['pl', 'Polski'],
];
const DEFAULT_LANG = 'en';
const LANG_COOKIE = 'tg_lang';

const storage = new AsyncLocalStorage();

function currentLang() {
  return storage.getStore()?.lang || DEFAULT_LANG;
}

function isLang(code) {
  return Object.hasOwn(MESSAGES, code);
}

const pluralRules = {};
function pluralCategory(lang, n) {
  pluralRules[lang] ??= new Intl.PluralRules(lang);
  return pluralRules[lang].select(n);
}

// The raw message template for `key`, with the plural form for `n` chosen.
function message(key, n) {
  const lang = currentLang();
  let value = MESSAGES[lang][key] ?? MESSAGES[DEFAULT_LANG][key];
  if (value === undefined) return key;
  if (typeof value === 'object') value = value[pluralCategory(lang, n ?? 0)] ?? value.other;
  return value;
}

function formatNumber(n) {
  return Number(n).toLocaleString(currentLang());
}

function fill(template, vars) {
  return template.replace(/\{(\w+)\}/g, (match, name) => (name in vars ? String(vars[name]) : match));
}

function t(key, vars = {}) {
  return fill(message(key, vars.count ?? vars.n), vars);
}

// Plural message: {n} is the number formatted for the language, {count} the raw number.
function tn(key, n, vars = {}) {
  return t(key, { ...vars, n: formatNumber(n), count: n });
}

// Pick the language: saved choice (cookie), then the browser's Accept-Language, then English.
function detectLang(cookieValue, acceptLanguage) {
  if (cookieValue && isLang(cookieValue)) return cookieValue;
  const wanted = String(acceptLanguage || '')
    .split(',')
    .map((part) => {
      const [tag, ...params] = part.trim().split(';');
      const q = params.find((p) => p.trim().startsWith('q='));
      return { lang: tag.trim().toLowerCase().split('-')[0], q: q ? Number(q.trim().slice(2)) || 0 : 1 };
    })
    .filter((w) => w.lang && w.q > 0)
    .sort((a, b) => b.q - a.q);
  return wanted.find((w) => isLang(w.lang))?.lang || DEFAULT_LANG;
}

// Express middleware: runs the rest of the request inside the visitor's language.
function i18nMiddleware(req, res, next) {
  const lang = detectLang(req.cookies?.[LANG_COOKIE], req.get('accept-language'));
  req.lang = lang;
  res.set('Content-Language', lang);
  storage.run({ lang }, next);
}

module.exports = {
  LANGUAGES,
  LANG_COOKIE,
  MESSAGES,
  t,
  tn,
  message,
  formatNumber,
  currentLang,
  isLang,
  detectLang,
  i18nMiddleware,
};
