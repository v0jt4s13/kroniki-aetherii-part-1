import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { createRoom, player, act, view } from '../server/engine.mjs';
import { chooseBotAction } from '../server/bot.mjs';
const base = process.env.CATAN_URL || 'http://127.0.0.1:4173';
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/opt/google/chrome/chrome', headless: true, args: ['--no-sandbox'] });
const g = createRoom('DEF123', 'Ala');
for (let i = 1; i < 4; i++) g.players.push(player(['Bartek', 'Celina', 'Dawid'][i - 1], i));
act(g, g.host, 'start');
while (g.phase.startsWith('setup')) { const p = g.players[g.active], d = chooseBotAction(view(g, p.id)); act(g, p.id, d.action, d.payload); }
for (const p of g.players) for (const r of Object.keys(p.resources)) { g.bank[r] += p.resources[r]; p.resources[r] = 0; }
g.players[0].resources.ore = 3; g.bank.ore -= 3;
const dice = [3, 4]; act(g, g.host, 'roll', {}, () => dice.shift());
const errors = [];
mkdirSync('../artifacts', { recursive: true });
async function pageFor(viewer, width = 393, height = 852) {
  const context = await browser.newContext({ viewport: { width, height } });
  const page = await context.newPage();
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.addInitScript(() => localStorage.setItem('catan:DEF123', 'qa-token'));
  await page.route('**/api/rooms/DEF123', route => route.fulfill({ json: view(g, viewer) }));
  await page.route('**/api/rooms/DEF123/action', async route => {
    const { action, payload } = route.request().postDataJSON();
    try { act(g, viewer, action, payload); g.revision++; await route.fulfill({ json: view(g, viewer) }); }
    catch (e) { await route.fulfill({ status: 400, json: { error: e.message } }); }
  });
  await page.goto(base + '/?room=DEF123');
  await page.locator('.realm-defense').waitFor();
  const dismiss = page.getByRole('button', { name: 'Zamknij powiadomienie', exact: true }); if (await dismiss.count()) await dismiss.click();
  return page;
}
try {
  const page = await pageFor(g.host);
  await page.getByRole('button', { name: 'Mobilizacja i wkłady', exact: true }).click();
  const add = page.getByRole('button', { name: 'Dodaj: Wpłata do obrony, Mitril', exact: true });
  await add.click(); await add.click();
  assert.ok((await page.locator('.game-sheet').innerText()).includes('Wpłata daje 4 Pancerza'));
  await page.getByRole('button', { name: 'Wesprzyj obronę', exact: true }).click();
  assert.equal(g.raid.contributions[g.host].armor, 4); assert.equal(g.players[0].resources.ore, 1);
  await page.screenshot({ path: '../artifacts/aetherii-defense-mobile.png', fullPage: true });
  await page.getByRole('button', { name: 'Zamknij panel', exact: true }).click();
  // Verify real image loading and keep all five resource icons in the fantasy set.
  await page.waitForFunction(() => [...document.querySelectorAll('.hex-tile img,.resources img')].every(i => i.complete && i.naturalWidth > 0));
  assert.equal(await page.locator('.resources img[src^="/game/aetherii/"]').count(), 5);
  await page.waitForFunction(() => [...document.querySelectorAll('.watchtower-art,.player-crest img')].every(i => i.complete && i.naturalWidth > 0));
  assert.equal(await page.locator('.watchtower-art').count(), 8);
  assert.equal(await page.locator('.player-crest img').count(), 4);
  const boardTowers = await page.locator('.watchtower-art').evaluateAll(imgs => [...new Set(imgs.map(i => i.getAttribute('src')))].sort());
  const scoreTowers = await page.locator('.player-crest img').evaluateAll(imgs => imgs.map(i => i.getAttribute('src')).sort());
  assert.equal(boardTowers.length, 4); assert.deepEqual(boardTowers, scoreTowers);

  for (const width of [320, 393, 1440]) {
    await page.setViewportSize({ width, height: width === 1440 ? 1000 : 852 });
    await page.evaluate(() => window.scrollTo(0, 0));
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    if (width < 850) {
      const title = await page.locator('.brand h1').boundingBox(), tools = await page.locator('.room-tools').boundingBox();
      assert.ok(title.y + title.height < tools.y, 'Title and room controls must have separate rows on small phones');
    }
    await page.screenshot({ path: `../artifacts/aetherii-game-${width}.png`, fullPage: true });
    await page.locator('.players').screenshot({ path: `../artifacts/watchtower-score-${width}.png` });
    await page.locator('.board-viewport').screenshot({ path: `../artifacts/watchtower-board-${width}.png` });
  }
  act(g, g.host, 'end'); const nonDouble = [1, 2]; act(g, g.players[1].id, 'roll', {}, () => nonDouble.shift()); g.revision++;
  const elf = await pageFor(g.players[1].id);
  await elf.getByRole('button', { name: 'Mobilizacja i wkłady', exact: true }).click();
  const deadline = g.raid.dueTurn;
  await elf.getByRole('button', { name: 'Kamienne Echo · opóźnij o 1 turę', exact: true }).click();
  assert.equal(g.raid.dueTurn, deadline + 1);
  assert.equal(await elf.getByRole('button', { name: 'Kamienne Echo · opóźnij o 1 turę', exact: true }).isDisabled(), true);
  assert.deepEqual(errors.filter(e => !e.includes('favicon')), []);
  writeFileSync('../artifacts/aetherii-browser-results.json', JSON.stringify({ result: 'passed', tests: ['raid monitor', 'dwarven donation via real controls', 'public armor', 'resource subtraction', 'stone echo', 'one-use echo', 'four distinct watchtowers match scoreboard and board', 'five fantasy icons loaded', 'all terrain images loaded', '320/393/1440px no overflow', 'mobile title and room tools separated'], errors }, null, 2));
  console.log('Aetherii browser checks passed: mobilization, armor, echo, assets and responsive layout.');
} finally { await browser.close(); }
