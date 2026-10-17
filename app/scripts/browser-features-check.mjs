import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { createRoom, player, view } from '../server/engine.mjs';

mkdirSync('../artifacts', { recursive: true });
const base = process.env.CATAN_URL || 'http://127.0.0.1:4173';
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/opt/google/chrome/chrome', headless: true, args: ['--no-sandbox'] });
const errors = [];
async function pageFor(width = 393, height = 852) {
  const context = await browser.newContext({ viewport: { width, height } }), page = await context.newPage();
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  return page;
}
async function closeAlert(p) { if (await p.getByRole('button', { name: 'Zamknij powiadomienie', exact: true }).count()) await p.getByRole('button', { name: 'Zamknij powiadomienie', exact: true }).click(); }
try {
  const email = `qa-${Date.now()}@example.com`, password = 'Browser-test-password-123';
  const p = await pageFor(); await p.goto(base);
  await p.getByRole('button', { name: 'Zaloguj / załóż konto', exact: true }).click();
  await p.getByRole('button', { name: 'Załóż konto', exact: true }).click();
  await p.getByLabel('Imię gracza', { exact: true }).fill('Ala');
  await p.getByLabel('Adres e-mail', { exact: true }).fill(email); await p.getByLabel('Hasło', { exact: true }).fill(password);
  await p.getByRole('button', { name: 'Utwórz konto', exact: true }).click();
  await p.getByText('Zalogowano jako', { exact: false }).waitFor();
  await p.screenshot({ path: '../artifacts/account-mobile.png', fullPage: true });
  await p.getByRole('button', { name: 'Zamknij panel', exact: true }).click();
  await p.getByRole('combobox', { name: 'Tryb rozgrywki', exact: true }).selectOption('ai');
  await p.getByRole('button', { name: 'Zagraj z AI', exact: true }).click();
  await p.locator('.legal-vertex').first().waitFor(); const code = new URL(p.url()).searchParams.get('room'); await closeAlert(p);
  await p.getByRole('button', { name: 'Moje konto', exact: true }).click();
  await p.getByRole('button', { name: 'Wyloguj się', exact: true }).click();
  await p.getByRole('button', { name: 'Zaloguj / załóż konto', exact: true }).waitFor();
  const device = await pageFor(320, 740); await device.goto(base);
  await device.getByRole('button', { name: 'Zaloguj / załóż konto', exact: true }).click();
  await device.getByLabel('Adres e-mail', { exact: true }).fill(email); await device.getByLabel('Hasło', { exact: true }).fill(password);
  await device.getByRole('button', { name: 'Zaloguj się', exact: true }).click();
  await device.getByRole('button', { name: new RegExp(code) }).click();
  await device.locator('.legal-vertex').first().waitFor(); await closeAlert(device);
  assert.equal(await device.locator('.players .player').count(), 2);
  assert.equal(await device.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);

  // Controlled public/private snapshots exercise incoming events and rich cards.
  const g = createRoom('QA1234', 'Ala', true); g.players.push(player('Bartek', 1));
  g.phase = 'roll'; g.turn = 1; g.robber = null;
  g.players[0].cards = ['ward', 'roads', 'plenty', 'monopoly', 'point'].map((type, i) => ({ id: `card-${i}`, type, bought: 0 }));
  const eventPage = await pageFor();
  await eventPage.addInitScript(() => { localStorage.setItem('catan:QA1234', 'fixture-token'); window.__notifications = []; class TestNotification { static permission = 'granted'; constructor(title, options) { window.__notifications.push({ title, ...options }); } close() {} } window.Notification = TestNotification; });
  await eventPage.route('**/api/rooms/QA1234', route => route.fulfill({ json: view(g, g.host) }));
  await eventPage.goto(base + '/?room=QA1234');
  await eventPage.getByRole('alert', { name: 'Twój ruch', exact: true }).waitFor(); await closeAlert(eventPage);
  await eventPage.getByRole('button', { name: 'Budowa', exact: true }).click();
  const disabled = eventPage.locator('.build-option:disabled'); assert.equal(await disabled.count(), 4);
  assert.equal(await disabled.first().evaluate(el => getComputedStyle(el).opacity), '1');
  await eventPage.screenshot({ path: '../artifacts/build-readable-mobile.png', fullPage: true });
  await eventPage.getByRole('button', { name: 'Zamknij panel', exact: true }).click();
  await eventPage.getByRole('button', { name: 'Karty', exact: true }).click();
  assert.equal(await eventPage.locator('.card-description').count(), 5);
  await eventPage.getByText('Opisy wszystkich Kart Magii', { exact: true }).click();
  await eventPage.screenshot({ path: '../artifacts/card-descriptions-mobile.png', fullPage: true });
  await eventPage.getByRole('button', { name: 'Zamknij panel', exact: true }).click();
  await eventPage.evaluate(() => Object.defineProperty(document, 'hidden', { configurable: true, value: true }));
  g.active = 1; g.phase = 'main'; g.revision++;
  g.offers = [{ id: 'offer-1', from: g.players[1].id, to: g.host, give: { wood: 1 }, want: { ore: 1 } }];
  await eventPage.getByRole('alert', { name: 'Propozycja handlu', exact: true }).waitFor();
  assert.ok((await eventPage.title()).includes('Propozycja handlu'));
  assert.equal(await eventPage.evaluate(() => window.__notifications.at(-1).title), 'Propozycja handlu');
  await eventPage.screenshot({ path: '../artifacts/trade-alert-mobile.png', fullPage: true });
  await eventPage.getByRole('button', { name: 'Zobacz ofertę', exact: true }).click();
  await eventPage.locator('.trade-offer').waitFor(); await eventPage.getByRole('button', { name: 'Zamknij panel', exact: true }).click();
  g.offers = []; g.active = 0; g.turn = 3; g.phase = 'roll'; g.revision++;
  await eventPage.getByRole('alert', { name: 'Twój ruch', exact: true }).waitFor();
  assert.equal(await eventPage.evaluate(() => window.__notifications.at(-1).title), 'Twój ruch'); await closeAlert(eventPage);
  await eventPage.waitForTimeout(1400); assert.equal(await eventPage.locator('.game-alert').count(), 0);
  const viewport = await eventPage.locator('.board-viewport').boundingBox();
  await eventPage.mouse.move(viewport.x + 100, viewport.y + 100); await eventPage.mouse.down(); await eventPage.mouse.move(viewport.x + 1500, viewport.y + 1500, { steps: 10 }); await eventPage.mouse.up();
  for (const size of [{ width: 320, height: 740 }, { width: 1440, height: 1000 }]) {
    await eventPage.setViewportSize(size); await eventPage.waitForTimeout(100);
    assert.equal(await eventPage.locator('.board-world').evaluate(el => getComputedStyle(el).overflow), 'hidden');
    const bounds = await eventPage.evaluate(() => { const w = document.querySelector('.board-world').getBoundingClientRect(), v = document.querySelector('.board-viewport').getBoundingClientRect(); return { w: { left: w.left, right: w.right, top: w.top, bottom: w.bottom }, v: { left: v.left, right: v.right, top: v.top, bottom: v.bottom } }; });
    assert.ok(bounds.w.right >= bounds.v.left + 100 && bounds.w.left <= bounds.v.right - 100);
    assert.ok(bounds.w.bottom >= bounds.v.top + 100 && bounds.w.top <= bounds.v.bottom - 100);
  }
  await eventPage.screenshot({ path: '../artifacts/features-desktop.png', fullPage: true });
  assert.deepEqual(errors.filter(e => !e.includes('favicon') && !e.includes('ERR_CERT_AUTHORITY_INVALID')), []);
  writeFileSync('../artifacts/features-browser-results.json', JSON.stringify({ result: 'passed', tests: ['email registration', 'logout', 'new device login', 'room recovery', 'readable disabled builds', 'five card descriptions', 'turn popup', 'incoming trade popup', 'hidden tab title', 'system notification dispatch', 'no duplicate events', 'board bounds', '320px and desktop'], errors }, null, 2));
  console.log('Feature browser checks passed: accounts, recovery, notifications, descriptions, contrast and board bounds.');
} finally { await browser.close(); }
