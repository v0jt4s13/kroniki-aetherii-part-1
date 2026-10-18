import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, mkdirSync } from 'node:fs';
import assert from 'node:assert/strict';
import { createRoom, player, view, FACTIONS } from '../server/engine.mjs';

const data = mkdtempSync('/tmp/aetherii-raid-'), base = 'http://127.0.0.1:14296/kroniki-aetherii';
const proc = spawn(process.execPath, ['server/start.mjs', '--production', '--host', '127.0.0.1', '--port', '14296'], { env: { ...process.env, AETHERII_DATA_DIR: data, PUBLIC_URL: base }, stdio: 'pipe' });
let browser;
function fixture() {
  const g = createRoom('QA1234', 'Ala');
  ['Bartek', 'Celina', 'Dawid'].forEach((name, i) => g.players.push(player(name, i + 1)));
  g.players.forEach((p, i) => { p.faction = FACTIONS[i]; });
  g.phase = 'main'; g.turn = 1; return g;
}
function raid(g, turn) {
  g.turn = turn; g.threat = 20; g.revision++;
  g.raid = { started: turn, dueTurn: turn + 3, delayed: false, contributions: Object.fromEntries(g.players.map(p => [p.id, { armor: 0, resources: { wood: 0, brick: 0, sheep: 0, wheat: 0, ore: 0 }, rewarded: false }])) };
}
function battle(g, won, turn) {
  g.raid = null; g.threat = won ? 0 : 20; g.turn = turn + 1; g.revision++;
  g.lastBattle = { won, strength: won ? 12 : 6, required: 12, turn, heroes: [], punished: [] };
}
async function pageFor(g, width, reducedMotion = 'no-preference') {
  const page = await browser.newPage({ viewport: { width, height: width === 1440 ? 1000 : 852 }, reducedMotion }); page.setDefaultTimeout(12000);
  await page.addInitScript(() => localStorage.setItem('aetherii:QA1234', 'fixture-token'));
  await page.route('**/api/rooms/QA1234', route => route.fulfill({ json: view(g, g.host) }));
  await page.goto(base + '/?room=QA1234', { waitUntil: 'networkidle' });
  const alert = page.getByRole('button', { name: 'Zamknij powiadomienie', exact: true }); if (await alert.count()) await alert.click();
  await page.locator('.board-viewport').scrollIntoViewIfNeeded(); return page;
}
try {
  await new Promise((resolve, reject) => { proc.stdout.on('data', c => { if (c.toString().includes('Kroniki Aetherii:')) resolve(); }); proc.once('error', reject); proc.once('exit', c => reject(new Error('Server exit ' + c))); });
  browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/opt/google/chrome/chrome', headless: true, args: ['--no-sandbox'] });
  mkdirSync('../artifacts', { recursive: true });
  for (const width of [320, 393, 1440]) {
    const g = fixture(), page = await pageFor(g, width); const errors = []; page.on('pageerror', e => errors.push(e.message));
    if (width === 393) { await page.getByRole('button', { name: 'Włącz ciemny motyw', exact: true }).click(); await page.locator('.board-viewport').scrollIntoViewIfNeeded(); }
    assert.equal(await page.locator('.raid-effects').count(), 0);
    raid(g, 1); await page.locator('.raid-dragon--arrival img').waitFor();
    await page.waitForFunction(() => document.querySelector('.raid-dragon img')?.naturalWidth > 0);
    const dragon = await page.locator('.raid-dragon--arrival').elementHandle();
    const origin = await dragon.evaluate(el => {
      const animation = el.getAnimations()[0]; animation.pause(); animation.currentTime = 0;
      const rect = el.getBoundingClientRect();
      const source = document.querySelector('.realm-defense .threat-heading').getBoundingClientRect();
      const board = document.querySelector('.board-viewport').getBoundingClientRect();
      return { dx: Math.abs(rect.x + rect.width / 2 - source.x - source.width / 2), dy: Math.abs(rect.y + rect.height / 2 - source.y - source.height / 2), below: source.y > board.bottom, beside: source.x > board.right };
    });
    assert.ok(origin.dx < 2 && origin.dy < 2, 'dragon starts at the threat heading');
    assert.ok(width === 1440 ? origin.beside : origin.below, 'flight follows the responsive threat panel position');
    assert.equal(await page.locator('.raid-flight-layer').evaluate(el => getComputedStyle(el).pointerEvents), 'none');
    await page.screenshot({ path: `../artifacts/dragon-origin-${width}.png` });
    await dragon.evaluate(el => el.getAnimations()[0].play());
    assert.equal(await page.locator('.raid-effects').evaluate(el => getComputedStyle(el).pointerEvents), 'none');
    await page.getByRole('button', { name: 'Powiększ planszę', exact: true }).click();
    assert.match(await page.locator('.board-world').getAttribute('style'), /scale\(1.2\)/);
    await page.getByRole('button', { name: 'Wyśrodkuj planszę', exact: true }).click();
    await page.locator('.raid-dragon').evaluate(el => Promise.all(el.getAnimations().map(a => a.finished)));
    await page.screenshot({ path: `../artifacts/dragon-raid-${width}.png` });
    g.threat = 40; g.revision++;
    await page.waitForResponse(r => r.url().includes('/api/rooms/QA1234'));
    await page.waitForFunction(() => document.querySelector('progress[aria-label="Zagrożenie Krainy"]')?.value === 40);
    assert.ok(await dragon.evaluate(el => el.isConnected), 'another seven keeps the same arriving dragon');
    await page.locator('.turn-panel').scrollIntoViewIfNeeded();
    battle(g, true, 4); await page.locator('.battle-outcome--victory').waitFor();
    const resultRect = await page.locator('.battle-outcome').boundingBox();
    assert.ok(resultRect.y >= 0 && resultRect.y + resultRect.height <= page.viewportSize().height, 'battle result remains visible after scrolling away from the board');
    await page.waitForTimeout(350); await page.screenshot({ path: `../artifacts/dragon-victory-${width}.png` });
    assert.match(await page.locator('.battle-outcome').innerText(), /Pancerz 12\/12/);
    await page.reload({ waitUntil: 'networkidle' });
    assert.equal(await page.locator('.battle-outcome').count(), 0, 'reloading an old battle does not replay its animation');
    raid(g, 5); await page.locator('.raid-dragon--arrival').waitFor();
    battle(g, false, 8); await page.locator('.battle-outcome--defeat').waitFor();
    await page.waitForTimeout(350); await page.screenshot({ path: `../artifacts/dragon-defeat-${width}.png` });
    assert.match(await page.locator('.battle-outcome').innerText(), /Pancerz 6\/12/);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    if (width === 320) { await page.waitForTimeout(4900); assert.equal(await page.locator('.battle-outcome').count(), 0); }
    assert.deepEqual(errors, []); console.log(`PASS ${width}px: arrival, controls, victory, defeat, no replay and prefix asset path`); await page.close();
  }
  const g = fixture(); raid(g, 1); const page = await pageFor(g, 393, 'reduce');
  assert.equal(await page.locator('.raid-dragon').evaluate(el => getComputedStyle(el).animationName), 'none');
  battle(g, true, 4); await page.locator('.battle-outcome--victory').waitFor();
  assert.equal(await page.locator('.battle-outcome').evaluate(el => getComputedStyle(el).animationName), 'none');
  assert.equal(await page.locator('.battle-sparks').evaluate(el => getComputedStyle(el).display), 'none');
  console.log('PASS reduced motion: readable result, no movement/flashes'); await page.close();
} finally {
  await browser?.close();
  if (proc.exitCode === null) await new Promise(resolve => { proc.once('exit', resolve); proc.kill('SIGTERM'); });
  rmSync(data, { recursive: true, force: true });
}
