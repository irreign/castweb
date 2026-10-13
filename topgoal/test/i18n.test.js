'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { MESSAGES, LANGUAGES, detectLang } = require('../src/i18n');

const placeholders = (value) =>
  [...new Set((typeof value === 'object' ? Object.values(value).join(' ') : value).match(/\{\w+\}/g) || [])].sort();

function sourceFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === 'locales' ? [] : sourceFiles(full);
    return entry.name.endsWith('.js') ? [full] : [];
  });
}

test('every language has exactly the same keys and placeholders as English', () => {
  const en = MESSAGES.en;
  for (const [lang] of LANGUAGES) {
    const messages = MESSAGES[lang];
    assert.deepEqual(Object.keys(messages).sort(), Object.keys(en).sort(), `${lang}: key sets differ`);
    for (const key of Object.keys(en)) {
      assert.deepEqual(placeholders(messages[key]), placeholders(en[key]), `${lang}: placeholders differ for ${key}`);
      assert.equal(typeof messages[key], typeof en[key], `${lang}: ${key} should be ${typeof en[key]}`);
    }
  }
});

test('plural messages cover every plural form the language uses', () => {
  for (const [lang] of LANGUAGES) {
    const needed = new Intl.PluralRules(lang).resolvedOptions().pluralCategories.filter((c) => c !== 'many' || lang === 'pl');
    for (const [key, value] of Object.entries(MESSAGES[lang])) {
      if (typeof value !== 'object') continue;
      for (const category of needed) assert.ok(category in value, `${lang}: ${key} is missing the "${category}" form`);
    }
  }
});

test('every translation key used in the code exists', () => {
  const used = new Set([
    // Keys built at runtime
    ...['user', 'mod', 'admin'].map((r) => `role.${r}`),
    ...['site', 'game', 'player', 'other'].map((k) => `report.kind.${k}`),
    ...[1, 2, 3, 4, 5, 6].flatMap((i) => [`rules.r${i}.title`, `rules.r${i}.text`]),
  ]);
  for (const file of sourceFiles(path.join(__dirname, '..', 'src'))) {
    const code = fs.readFileSync(file, 'utf8');
    for (const m of code.matchAll(/\b(?:t|tn|th)\('([a-zA-Z0-9_.-]+)'/g)) used.add(m[1]);
  }
  used.delete('key'); // example in a comment
  used.delete('forum.byUser'); // example in a comment
  const missing = [...used].filter((key) => !(key in MESSAGES.en));
  assert.deepEqual(missing, []);
});

test('language detection prefers the saved choice, then the browser, then English', () => {
  assert.equal(detectLang('pl', 'it-IT,it;q=0.9'), 'pl');
  assert.equal(detectLang(undefined, 'it-IT,it;q=0.9,en;q=0.8'), 'it');
  assert.equal(detectLang(undefined, 'de-DE,pl;q=0.5,en;q=0.4'), 'pl');
  assert.equal(detectLang('xx', 'fr-FR'), 'en');
  assert.equal(detectLang(undefined, undefined), 'en');
});
