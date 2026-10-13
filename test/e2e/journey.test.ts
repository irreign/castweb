declare const document: any; // used only inside page.evaluate callbacks (browser context)
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { spawn, execSync, type ChildProcess } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, type Browser, type Page } from 'playwright-core';

const PORT = 8799; const BASE = `http://127.0.0.1:${PORT}`;
let server: ChildProcess; let browser: Browser; let persist: string; let logs = '';
const consoleErrors: string[] = [];

async function waitHealthy() {
  for (let i = 0; i < 90; i++) { try { const r = await fetch(`${BASE}/api/health`); if (r.ok) return; } catch { /* starting */ } await new Promise((r) => setTimeout(r, 1000)); }
  throw new Error('server did not start:\n' + logs.slice(-2000));
}
function watch(page: Page) {
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('response', (r) => { if (r.status() >= 400) consoleErrors.push(`HTTP ${r.status()} ${r.url()}`); });
  page.on('pageerror', (e) => consoleErrors.push('pageerror: ' + e.message));
}

beforeAll(async () => {
  persist = mkdtempSync(join(tmpdir(), 'nl-e2e-'));
  execSync('npm run build', { stdio: 'pipe' });
  execSync(`npx wrangler d1 migrations apply nexus-enquiry --local --persist-to ${persist}`, { stdio: 'pipe' });
  server = spawn('npx', ['wrangler', 'dev', '--port', String(PORT), '--ip', '127.0.0.1', '--persist-to', persist], { stdio: 'pipe', detached: true });
  server.stdout!.on('data', (d) => { logs += d; }); server.stderr!.on('data', (d) => { logs += d; });
  await waitHealthy();
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox'] });
}, 120000);

afterAll(async () => {
  await browser?.close();
  try { process.kill(-server.pid!, 'SIGTERM'); } catch { /* already gone */ }
  rmSync(persist, { recursive: true, force: true });
});

describe('enquiry → answer → lead → booking, in a real browser', () => {
  let inviteUrl = ''; let widgetKey = '';
  it('provisions an agency through the operator API', async () => {
    const r = await fetch(`${BASE}/api/platform/tenants`, { method: 'POST', headers: { authorization: 'Bearer dev-operator-token', 'content-type': 'application/json' }, body: JSON.stringify({ agencyName: 'Sunrise Maid Agency', slug: 'sunrise', ownerName: 'Grace Tan', ownerEmail: 'grace@sunrise.test' }) });
    expect(r.status).toBe(201);
    const j = await r.json() as any; inviteUrl = j.inviteUrl.replace(/^https?:\/\/[^/]+/, BASE); widgetKey = j.widgetKey;
  });

  it('owner activates the account, adds and publishes an FAQ, and tests it', async () => {
    const ctx = await browser.newContext(); const page = await ctx.newPage(); watch(page);
    await page.goto(inviteUrl);
    await page.getByLabel('Choose a password').fill('a-long-passphrase-1');
    await page.getByLabel('Confirm password').fill('different-passphrase');
    await page.getByRole('button', { name: 'Set password and continue' }).click();
    await page.getByText('Passwords do not match').waitFor();
    await page.getByLabel('Confirm password').fill('a-long-passphrase-1');
    await page.getByRole('button', { name: 'Set password and continue' }).click();
    await page.getByRole('heading', { name: 'Overview' }).waitFor();
    expect(await page.getByText('No published knowledge sources').count()).toBeGreaterThan(0); // honest health warning
    await page.goto(`${BASE}/app/#/knowledge`);
    await page.getByRole('button', { name: '+ FAQ' }).click();
    await page.getByLabel('Customer question').fill('What are your office hours?');
    await page.getByLabel('Approved answer').fill('We are open Monday to Friday 9am to 6pm and Saturday 9am to 1pm.');
    await page.getByRole('button', { name: 'Save' }).click();
    await page.getByRole('cell', { name: /What are your office hours\?/ }).waitFor();
    await page.getByLabel('Test question').fill('When are you open? office hours');
    await page.getByRole('button', { name: 'Test question' }).click();
    await page.getByText('The assistant would answer using these sources.').waitFor();
    await page.getByRole('button', { name: 'Publish' }).click();
    await page.getByText('Published', { exact: true }).first().waitFor();
    await ctx.storageState({ path: join(persist, 'owner.json') });
    await ctx.close();
  }, 60000);

  it('a website visitor gets a grounded answer, consents, shares details and books a consultation', async () => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 780 } }); const page = await ctx.newPage(); watch(page);
    await page.goto(`${BASE}/widget/frame?k=${widgetKey}`);
    await page.getByText('You are chatting with an AI assistant').waitFor();
    await page.getByLabel('Your message').fill('What are your office hours?');
    await page.getByRole('button', { name: 'Send' }).click();
    await page.getByText('Monday to Friday 9am to 6pm').waitFor();
    await page.getByLabel('Your message').fill('What is the placement fee for a transfer helper?');
    await page.getByRole('button', { name: 'Send' }).click();
    await page.getByText("I don't have approved information on that").waitFor();
    await page.getByRole('button', { name: 'Book', exact: true }).click();
    await page.getByLabel('Name').fill('Mrs Lim');
    await page.getByLabel('Mobile number').fill('9123 4567');
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.getByText('Please tick the box to agree').waitFor(); // consent is mandatory
    await page.getByLabel(/By sharing your details/).check();
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.getByRole('heading', { name: 'Choose a consultation time' }).waitFor();
    const slot = page.locator('.slot').first(); await slot.waitFor(); await slot.click();
    await page.getByRole('button', { name: 'Confirm this time' }).click();
    await page.getByText(/Your consultation is confirmed:/).waitFor();
    await ctx.close();
  }, 60000);

  it('staff see the lead, conversation, booking, and updated overview', async () => {
    const ctx = await browser.newContext({ storageState: join(persist, 'owner.json'), viewport: { width: 1280, height: 800 } }); const page = await ctx.newPage(); watch(page);
    await page.goto(`${BASE}/app/#/leads`);
    await page.getByRole('cell', { name: /Mrs Lim/ }).waitFor();
    await page.getByLabel('Search leads').fill('9123');
    await page.getByRole('cell', { name: /Mrs Lim/ }).waitFor();
    await page.getByLabel('Search leads').fill('zzzz-nothing');
    await page.getByText('No leads match these filters').waitFor();
    await page.getByLabel('Search leads').fill('');
    await page.getByRole('cell', { name: /Mrs Lim/ }).click();
    await page.getByRole('heading', { name: 'Mrs Lim' }).waitFor();
    await page.getByPlaceholder('e.g. Call back about fees').fill('Call Mrs Lim before consultation');
    await page.getByRole('button', { name: 'Save next action' }).click();
    await page.getByText('Next action saved').waitFor();
    await page.getByRole('button', { name: 'Close' }).first().click();
    await page.goto(`${BASE}/app/#/bookings`);
    await page.getByRole('button', { name: 'List' }).click();
    await page.getByRole('link', { name: 'Mrs Lim' }).waitFor();
    await page.goto(`${BASE}/app/#/conversations`);
    await page.getByText('Mrs Lim').first().click();
    await page.getByText('Monday to Friday 9am to 6pm').first().waitFor();
    await page.getByText('Source: What are your office hours?').first().waitFor();
    await page.goto(`${BASE}/app/#/overview`);
    await page.getByText('Confirmed consultations').waitFor();
    await page.waitForFunction(() => document.querySelector('.kpi.good .value')?.textContent === '1');
    await page.goto(`${BASE}/app/#/reports`);
    await page.getByText('Revenue is not shown').waitFor();
    await ctx.close();
  }, 60000);

  it('the app is usable at phone width (no horizontal overflow, menu works)', async () => {
    const ctx = await browser.newContext({ storageState: join(persist, 'owner.json'), viewport: { width: 390, height: 780 } }); const page = await ctx.newPage(); watch(page);
    for (const route of ['overview', 'leads', 'followups', 'knowledge', 'settings']) {
      await page.goto(`${BASE}/app/#/${route}`); await page.getByRole('heading').first().waitFor(); await page.waitForTimeout(500);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, `horizontal overflow on ${route}`).toBeLessThanOrEqual(1);
    }
    await page.getByRole('button', { name: 'Open menu' }).click();
    await page.getByRole('link', { name: 'Leads' }).click();
    await page.getByRole('heading', { name: 'Leads' }).waitFor();
    await ctx.close();
  }, 60000);

  it('unauthenticated users see sign-in and wrong passwords are rejected clearly', async () => {
    const ctx = await browser.newContext(); const page = await ctx.newPage(); watch(page);
    await page.goto(`${BASE}/app/#/leads`);
    await page.getByRole('heading', { name: 'Sign in' }).waitFor();
    await page.getByLabel('Email').fill('grace@sunrise.test'); await page.getByLabel('Password').fill('wrong-password-123');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await page.getByText('Incorrect email or password').waitFor();
    await ctx.close();
  }, 30000);

  it('had no unexpected browser console errors', () => {
    const real = consoleErrors.filter((e) => !/(Failed to load resource: the server responded with a status of|HTTP) (401|404|409|422)/.test(e));
    expect(real).toEqual([]);
  });

  it('keeps the CastWeb marketing page byte-for-byte intact at /', async () => {
    const served = await (await fetch(`${BASE}/`)).text();
    const orig = execSync('git show HEAD:index.html', { cwd: process.cwd(), maxBuffer: 5e6 }).toString();
    expect(served).toBe(orig);
  });
});
