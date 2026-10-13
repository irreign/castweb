'use strict';

// Private image uploads (blue-tick screenshots and report screenshots).
// Images are stored in the database, so the same code works with SQLite and D1.
// Only the uploader and moderators can view an upload.

const express = require('express');
const { hasRole } = require('../auth');
const { sniffImage } = require('../multipart');
const { t } = require('../i18n');
const { notFound, badRequest, intParam } = require('./util');

// D1 rows are limited to 2 MB. The browser shrinks screenshots before sending them,
// so real uploads are usually far smaller than this.
const MAX_IMAGE_BYTES = 1_800_000;

// Validates an uploaded file and stores it. Returns the new upload id, or null if no file was sent.
async function storeImage(db, userId, file) {
  if (!file) return null;
  const mime = sniffImage(file.data);
  if (!mime) throw badRequest(t('upload.badType'));
  if (file.data.length > MAX_IMAGE_BYTES) throw badRequest(t('upload.tooBig', { mb: '1.8' }));
  const { lastInsertRowid } = await db.run(
    'INSERT INTO uploads (user_id, mime, size, data, created_at) VALUES (?, ?, ?, ?, ?)',
    userId,
    mime,
    file.data.length,
    file.data,
    Date.now()
  );
  return lastInsertRowid;
}

function routes({ db }) {
  const router = express.Router();

  router.get('/uploads/:id', async (req, res) => {
    const id = intParam(req.params.id);
    const upload = id && (await db.get('SELECT user_id, mime, data FROM uploads WHERE id = ?', id));
    if (!upload || !req.user || (upload.user_id !== req.user.id && !hasRole(req.user, 'mod'))) {
      throw notFound();
    }
    // D1 returns BLOBs as arrays of numbers; SQLite returns a Uint8Array.
    const data = Buffer.from(upload.data);
    res.set({
      'Content-Type': upload.mime,
      'Content-Length': String(data.length),
      'Cache-Control': 'private, max-age=3600',
      'Content-Security-Policy': "default-src 'none'; sandbox",
      'Content-Disposition': 'inline',
    });
    res.end(data);
  });

  return router;
}

module.exports = routes;
module.exports.storeImage = storeImage;
module.exports.MAX_IMAGE_BYTES = MAX_IMAGE_BYTES;
