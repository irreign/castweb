'use strict';

// Minimal multipart/form-data parser for small uploads (a screenshot plus a few fields).
// Works on Node and Cloudflare Workers because it only needs the raw request body.
//
// After it runs: req.body holds the text fields, req.files[name] = { filename, type, data }.

const express = require('express');

const MAX_BODY = '2600kb';
const MAX_PARTS = 20;

const rawMultipart = express.raw({ type: 'multipart/form-data', limit: MAX_BODY });

function parseHeaders(text) {
  const headers = {};
  for (const line of text.split('\r\n')) {
    const i = line.indexOf(':');
    if (i > 0) headers[line.slice(0, i).trim().toLowerCase()] = line.slice(i + 1).trim();
  }
  return headers;
}

function dispositionParam(header, name) {
  const m = new RegExp(`;\\s*${name}="([^"]*)"`, 'i').exec(header || '');
  return m ? m[1] : null;
}

function parse(body, boundary) {
  const fields = Object.create(null);
  const files = Object.create(null);
  const delimiter = Buffer.from(`--${boundary}`);
  let pos = body.indexOf(delimiter);
  let parts = 0;
  while (pos !== -1) {
    pos += delimiter.length;
    if (body.subarray(pos, pos + 2).toString() === '--') break; // closing delimiter
    pos += 2; // CRLF after the delimiter
    const headerEnd = body.indexOf('\r\n\r\n', pos);
    if (headerEnd === -1) break;
    const next = body.indexOf(delimiter, headerEnd + 4);
    if (next === -1) break;
    if (++parts > MAX_PARTS) throw Object.assign(new Error('Too many form fields.'), { status: 413 });

    const headers = parseHeaders(body.subarray(pos, headerEnd).toString('utf8'));
    const data = body.subarray(headerEnd + 4, next - 2); // drop CRLF before the next delimiter
    const name = dispositionParam(headers['content-disposition'], 'name');
    const filename = dispositionParam(headers['content-disposition'], 'filename');
    if (name !== null) {
      if (filename !== null) {
        if (data.length > 0) files[name] = { filename, type: headers['content-type'] || '', data: Buffer.from(data) };
      } else {
        fields[name] = data.toString('utf8');
      }
    }
    pos = next;
  }
  return { fields, files };
}

// Express middleware: parses multipart bodies, leaves every other request alone.
function multipart(req, res, next) {
  if (!req.is('multipart/form-data')) return next();
  rawMultipart(req, res, (err) => {
    if (err) {
      if (err.type === 'entity.too.large') err.tooLarge = true;
      return next(err);
    }
    const boundary = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(req.get('content-type') || '');
    if (!boundary || !Buffer.isBuffer(req.body)) {
      return next(Object.assign(new Error('Malformed upload.'), { status: 400 }));
    }
    try {
      const { fields, files } = parse(req.body, boundary[1] || boundary[2]);
      req.body = fields;
      req.files = files;
      next();
    } catch (e) {
      next(e);
    }
  });
}

// Recognise the image formats we accept by their first bytes, not the client's claim.
function sniffImage(data) {
  if (data.length > 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return 'image/jpeg';
  if (data.length > 8 && data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (data.length > 12 && data.subarray(0, 4).toString('latin1') === 'RIFF' && data.subarray(8, 12).toString('latin1') === 'WEBP') return 'image/webp';
  return null;
}

module.exports = { multipart, parse, sniffImage };
