'use strict';

function notFound(message = 'Not found.') {
  return Object.assign(new Error(message), { status: 404 });
}

function forbidden(message = 'You do not have permission to do that.') {
  return Object.assign(new Error(message), { status: 403 });
}

// Positive integer from a route param or form field, otherwise null.
function intParam(value) {
  if (typeof value !== 'string' || !/^\d{1,9}$/.test(value)) return null;
  const n = Number(value);
  return n > 0 ? n : null;
}

// Trimmed single string from a form field, capped at `max` characters.
function text(value, max) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

// Page number from ?page=, and the matching SQL offset.
function paging(req, perPage) {
  const page = intParam(req.query.page) || 1;
  return { page, perPage, offset: (page - 1) * perPage };
}

module.exports = { notFound, forbidden, intParam, text, paging };
