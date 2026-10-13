'use strict';

const express = require('express');
const { sessionMiddleware, csrfProtection, safeNext } = require('./auth');
const { i18nMiddleware, isLang, LANG_COOKIE, t } = require('./i18n');
const { multipart } = require('./multipart');
const { html, layout } = require('./render');

const ROUTES = [
  require('./routes/home'),
  require('./routes/news'),
  require('./routes/auth'),
  require('./routes/forum'),
  require('./routes/wiki'),
  require('./routes/season'),
  require('./routes/fas'),
  require('./routes/profile'),
  require('./routes/verify'),
  require('./routes/friends'),
  require('./routes/report'),
  require('./routes/uploads'),
  require('./routes/admin'),
];

// Options:
//   staticDir   folder to serve /static/* from (Node only; Cloudflare serves it as Worker assets)
//   trustProxy  trust X-Forwarded-* from one reverse proxy
//   cloudflare  running on Cloudflare Workers (HTTPS-only cookies, CF-Connecting-IP)
function createApp(db, { staticDir, trustProxy = false, cloudflare = false } = {}) {
  const app = express();
  app.disable('x-powered-by');
  if (trustProxy) app.set('trust proxy', 1);
  if (cloudflare) {
    app.set('cloudflare', true);
    app.set('secure cookies', true);
  }

  app.use((req, res, next) => {
    res.set({
      'Content-Security-Policy':
        "default-src 'self'; img-src 'self' https: data: blob:; style-src 'self'; script-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'same-origin',
      'X-Frame-Options': 'DENY',
    });
    next();
  });

  if (staticDir) app.use('/static', express.static(staticDir, { maxAge: '1h' }));
  app.use(async (req, res, next) => {
    await db.ready();
    next();
  });
  app.use(express.urlencoded({ extended: false, limit: '200kb' }));
  app.use(sessionMiddleware(db));
  app.use(i18nMiddleware);

  // Render helper: res.page({ title, body, active })
  app.use((req, res, next) => {
    res.page = (opts) => res.type('html').send(String(layout(req, res, opts)));
    next();
  });

  app.use(multipart);
  app.use(csrfProtection);

  // Language picker: remembers the choice for a year, then goes back to the page.
  app.get('/lang/:code', (req, res) => {
    if (isLang(req.params.code)) {
      res.cookie(LANG_COOKIE, req.params.code, {
        maxAge: 365 * 86400000,
        httpOnly: true,
        sameSite: 'lax',
        secure: req.secure || app.get('secure cookies') === true,
        path: '/',
      });
    }
    res.redirect(safeNext(req.query.next));
  });

  const ctx = { db };
  for (const routes of ROUTES) app.use(routes(ctx));

  app.use((req, res) => {
    res.status(404).page({
      title: t('errors.notFoundTitle'),
      body: html`<section class="empty"><h1>${t('errors.notFoundTitle')}</h1><p>${t('errors.pageMissing')} <a href="/">${t('errors.backHome')}</a></p></section>`,
    });
  });

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    const status = err.status || err.statusCode || 500;
    if (status >= 500) console.error(err);
    let message = err.message;
    if (status >= 500) message = t('errors.server');
    else if (err.type === 'entity.too.large') message = t('errors.tooLarge');
    else if (err.expose === true && err.type) message = t('errors.badRequest'); // body-parser errors
    res.status(status);
    if (!res.page) return res.type('text').send(message);
    res.page({
      title: t('errors.title'),
      body: html`<section class="empty"><h1>${status === 403 ? t('errors.notAllowed') : t('errors.title')}</h1><p>${message}</p></section>`,
    });
  });

  return app;
}

module.exports = { createApp };
