'use strict';

const express = require('express');
const { sessionMiddleware, csrfProtection } = require('./auth');
const { html, layout } = require('./render');

const ROUTES = [
  require('./routes/home'),
  require('./routes/auth'),
  require('./routes/forum'),
  require('./routes/wiki'),
  require('./routes/season'),
  require('./routes/fas'),
  require('./routes/profile'),
  require('./routes/verify'),
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
        "default-src 'self'; img-src 'self' https: data:; style-src 'self'; script-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
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

  // Render helper: res.page({ title, body, active })
  app.use((req, res, next) => {
    res.page = (opts) => res.type('html').send(String(layout(req, res, opts)));
    next();
  });

  app.use(csrfProtection);

  const ctx = { db };
  for (const routes of ROUTES) app.use(routes(ctx));

  app.use((req, res) => {
    res.status(404).page({
      title: 'Not found',
      body: html`<section class="empty"><h1>Page not found</h1><p>That page doesn't exist. <a href="/">Back to the home page</a>.</p></section>`,
    });
  });

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    const status = err.status || err.statusCode || 500;
    if (status >= 500) console.error(err);
    const message = status >= 500 ? 'Something went wrong on our side. Please try again.' : err.message;
    res.status(status);
    if (!res.page) return res.type('text').send(message);
    res.page({
      title: 'Error',
      body: html`<section class="empty"><h1>${status === 403 ? 'Not allowed' : 'Something went wrong'}</h1><p>${message}</p></section>`,
    });
  });

  return app;
}

module.exports = { createApp };
