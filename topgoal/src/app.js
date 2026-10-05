'use strict';

const path = require('node:path');
const express = require('express');
const { sessionMiddleware, csrfProtection } = require('./auth');
const { html, layout } = require('./render');

function createApp(db, { trustProxy = false } = {}) {
  const app = express();
  app.disable('x-powered-by');
  if (trustProxy) app.set('trust proxy', 1);

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

  app.use('/static', express.static(path.join(__dirname, '..', 'public'), { maxAge: '1h' }));
  app.use(express.urlencoded({ extended: false, limit: '200kb' }));
  app.use(sessionMiddleware(db));

  // Render helper: res.page({ title, body, active })
  app.use((req, res, next) => {
    res.page = (opts) => res.type('html').send(String(layout(req, res, opts)));
    next();
  });

  app.use(csrfProtection);

  const ctx = { db };
  for (const name of ['home', 'auth', 'forum', 'wiki', 'season', 'fas', 'profile', 'verify', 'admin']) {
    app.use(require(`./routes/${name}`)(ctx));
  }

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
