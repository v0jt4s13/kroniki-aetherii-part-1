import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { createRoom, player, act, view } from '../server/engine.mjs';
import { chooseBotAction } from '../server/bot.mjs';
const base = process.env.AETHERII_URL || 'http://127.0.0.1:4175';
const g = createRoom('DOUBLE', 'Ala', true); g.players.push(player('Bartek', 1)); act(g, g.host, 'start');
while (g.phase.startsWith('setup')) { const p = g.players[g.active], d = chooseBotAction(view(g, p.id)); act(g, p.id, d.action, d.payload); }
const dice = [2, 2, 4, 4, 1, 2], errors = [];
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/opt/google/chrome/chrome', headless: true, args: ['--no-sandbox'] });
mkdirSync('../artifacts', { recursive: true });
try {
  const page = await browser.newPage({ viewport: { width: 393, height: 852 } });
  page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.addInitScript(() => localStorage.setItem('catan:DOUBLE', 'qa-token'));
  await page.route('**/api/rooms/DOUBLE', route => route.fulfill({ json: view(g, g.host) }));
  await page.route('**/api/rooms/DOUBLE/action', async route => {
    const { action, payload } = route.request().postDataJSON();
    act(g, g.host, action, payload, () => dice.shift()); g.revision++; await route.fulfill({ json: view(g, g.host) });
  });
  const dismiss = async () => { const close = page.getByRole('button', { name: 'Zamknij powiadomienie', exact: true }); if (await close.count()) await close.click(); };
  await page.goto(base + '/?room=DOUBLE'); await page.getByRole('button', { name: 'Rzuć kośćmi', exact: true }).waitFor(); await dismiss();
  await page.getByRole('button', { name: 'Rzuć kośćmi', exact: true }).click();
  await page.getByRole('heading', { name: 'Dublet! Rzuć ponownie', exact: true }).waitFor();
  assert.equal(g.phase, 'roll'); assert.equal(g.bonusRoll, true); assert.equal(await page.getByRole('button', { name: 'Zakończ turę', exact: true }).count(), 0);
  await page.screenshot({ path: '../artifacts/doubles-mobile.png', fullPage: true });
  await page.reload(); await page.getByRole('button', { name: 'Rzuć ponownie', exact: true }).waitFor(); await dismiss();
  await page.getByRole('button', { name: 'Budowa', exact: true }).click();
  assert.equal(await page.locator('.build-option:disabled').count(), 4);
  await page.getByRole('button', { name: 'Zamknij panel', exact: true }).click();
  await page.getByRole('button', { name: 'Rzuć ponownie', exact: true }).click();
  await page.waitForFunction(() => [...document.querySelectorAll('.dice-result>b')].every(el => el.textContent === '4'));
  assert.equal(g.bonusRoll, true); assert.equal(g.turn, 1); assert.equal(g.active, 0);
  await page.getByRole('button', { name: 'Rzuć ponownie', exact: true }).click();
  await page.getByRole('button', { name: 'Zakończ turę', exact: true }).waitFor();
  assert.equal(g.phase, 'main'); assert.equal(g.bonusRoll, false); assert.equal(g.turn, 1);
  assert.equal(g.log.filter(e => e.text.startsWith('Produkcja po rzucie')).length, 3);
  assert.equal(await page.getByRole('button', { name: 'Rzuć ponownie', exact: true }).count(), 0);
  await page.getByRole('button', { name: 'Zakończ turę', exact: true }).click();
  await page.getByRole('heading', { name: 'Teraz gra Bartek', exact: true }).waitFor();
  assert.equal(g.turn, 2); assert.equal(g.active, 1); assert.deepEqual(errors, []);
  writeFileSync('../artifacts/doubles-browser-results.json', JSON.stringify({ result: 'passed', tests: ['double gives extra roll', 'mandatory roll blocks construction and end', 'pending roll survives reload', 'second double repeats again', 'non-double unlocks normal actions', 'every roll logs production', 'chain is one turn'], errors }, null, 2));
  console.log('Doubles browser checks passed: repeated rolls, reload, blocked actions, production and turn handoff.');
} finally { await browser.close(); }
