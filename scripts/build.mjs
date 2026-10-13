// Assembles ./dist for Workers Static Assets: the existing marketing page (untouched), the agency app, and the embeddable widget.
import { cpSync, mkdirSync, rmSync, existsSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });

cpSync(join(root, 'index.html'), join(dist, 'index.html'));               // CastWeb marketing site, byte-for-byte
cpSync(join(root, 'web', 'app'), join(dist, 'app'), { recursive: true });
cpSync(join(root, 'web', 'widget'), join(dist, 'widget'), { recursive: true });

// Static-asset headers. API/widget-frame headers are set by the Worker itself.
writeFileSync(join(dist, '_headers'), `/app/*
  X-Frame-Options: DENY
  Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'
  Referrer-Policy: strict-origin-when-cross-origin
  X-Content-Type-Options: nosniff
/widget/v1.js
  Cache-Control: public, max-age=300
  Access-Control-Allow-Origin: *
`);
console.log('built dist/', existsSync(join(dist, 'index.html')) ? 'ok' : 'MISSING');
