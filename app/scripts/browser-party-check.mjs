import { rollUntilNoDouble } from './browser-rolls.mjs';
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const base = process.env.CATAN_URL || 'http://127.0.0.1:4175';
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/opt/google/chrome/chrome', headless: true, args: ['--no-sandbox'] });
const errors = [], results = [];
mkdirSync('../artifacts', { recursive: true });
async function pageFor() {
  const context = await browser.newContext({ viewport: { width: 393, height: 852 } });
  const page = await context.newPage(); page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); }); return page;
}
async function snapshot(page, code) {
  return page.evaluate(async code => { const response = await fetch(`/api/rooms/${code}`, { headers: { Authorization: `Bearer ${localStorage.getItem(`catan:${code}`)}` } }); return response.json(); }, code);
}
async function dismiss(page) { const b = page.getByRole('button', { name: 'Zamknij powiadomienie', exact: true }); if (await b.count()) await b.click(); }
try {
  for (const [bots, size] of [[1, 19], [2, 23], [3, 25]]) {
    const host = await pageFor(); await host.goto(base);
    await host.getByLabel('Twoje imię', { exact: true }).fill(`Ala ${size}`);
    await host.getByRole('combobox', { name: 'Wielkość planszy', exact: true }).selectOption(`${size}`);
    await host.getByRole('combobox', { name: 'Obsada pokoju', exact: true }).selectOption(`${bots}`);
    await host.getByRole('button', { name: 'Stwórz pokój', exact: true }).click();
    await host.getByRole('heading', { name: 'Zbierz obrońców krainy' }).waitFor();
    const code = new URL(host.url()).searchParams.get('room'), humans = [host];
    assert.equal(await host.locator('.hex-tile').count(), size); assert.equal(await host.locator('.bot-seat').count(), bots);
    assert.equal(await host.locator('.hex-tile img[src="/game/aetherii/desert.webp"]').count(), 1);
    assert.equal(await host.locator('.number-token').count(), size - 1);
    assert.equal(await host.locator('.number-token.frequent[title*="5/36"]').count(), size === 19 ? 4 : 6);
    const start = host.getByRole('button', { name: /Rozpocznij grę/ }); assert.equal(await start.isDisabled(), bots !== 3);
    // The host can change the board while remaining in the same lobby.
    await host.getByRole('combobox', { name: 'Wielkość planszy', exact: true }).selectOption(size === 25 ? '23' : '25');
    await host.waitForFunction(n => document.querySelectorAll('.hex-tile').length === n, size === 25 ? 23 : 25);
    await host.getByRole('combobox', { name: 'Wielkość planszy', exact: true }).selectOption(`${size}`);
    await host.waitForFunction(n => document.querySelectorAll('.hex-tile').length === n, size);
    for (let i = 1; i < 4 - bots; i++) {
      const page = await pageFor(); humans.push(page); await page.goto(`${base}/?room=${code}`);
      await page.getByLabel('Twoje imię', { exact: true }).fill(`Znajomy ${i}`);
      await page.getByRole('button', { name: `Dołącz do pokoju ${code}`, exact: true }).click();
      await page.getByRole('heading', { name: 'Zbierz obrońców krainy' }).waitFor();
      assert.equal(await page.getByRole('combobox', { name: 'Wielkość planszy', exact: true }).count(), 0);
    }
    await host.waitForFunction(() => !document.querySelector('.lobby-actions button.secondary')?.disabled);
    await start.click();
    let state;
    for (let step = 0; step < 180; step++) {
      state = await snapshot(host, code); if (!state.phase.startsWith('setup')) break;
      for (const page of humans) {
        if (!await page.locator('.legal-vertex').count()) continue;
        await dismiss(page); await page.locator('.legal-vertex').first().click();
        await page.getByRole('button', { name: 'Potwierdź budowę', exact: true }).click();
        await page.locator('.legal-road').first().click(); await page.getByRole('button', { name: 'Potwierdź budowę', exact: true }).click();
      }
      await host.waitForTimeout(150);
    }
    assert.equal(state.phase, 'roll'); assert.equal(state.players.filter(p => p.bot).length, bots);
    assert.equal(state.board.vertices.filter(v => v.owner).length, 8);
    await dismiss(host); await rollUntilNoDouble(host);
    await host.locator('.roll-gains').waitFor();
    state = await snapshot(host, code);
    const production = state.log.find(e => e.text.startsWith('Produkcja po rzucie'));
    assert.ok(production); for (const p of state.players) assert.ok(production.text.includes(`${p.name}: +`));
    const gained = Object.values(state.lastRoll.resources).reduce((a, b) => a + b, 0);
    assert.ok(production.text.includes(`${state.players[0].name}: +${gained} surowców`));
    await host.getByRole('button', { name: 'Dziennik', exact: true }).click();
    await host.getByRole('heading', { name: 'Dziennik wyprawy', exact: true }).waitFor();
    assert.ok((await host.locator('.game-log').innerText()).includes(production.text));
    await host.screenshot({ path: `../artifacts/party-log-${size}.png`, fullPage: true });
    await host.getByRole('button', { name: 'Zamknij panel', exact: true }).click();
    await host.reload(); await host.locator('.roll-gains').waitFor(); await dismiss(host);
    assert.equal(await host.locator('.hex-tile').count(), size);
    for (const width of [320, 1440]) {
      await host.setViewportSize({ width, height: width === 1440 ? 1000 : 852 });
      await host.evaluate(() => window.scrollTo(0, 0));
      await host.waitForFunction(() => [...document.querySelectorAll('.hex-tile img,.watchtower-art')].every(i => i.complete && i.naturalWidth > 0));
      assert.equal(await host.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, JSON.stringify(await host.evaluate(() => [...document.querySelectorAll('body *')].filter(el => el.getBoundingClientRect().right > innerWidth + 1 && !el.closest('.board-viewport')).map(el => [el.tagName, el.className, Math.round(el.getBoundingClientRect().right)]).slice(0, 10))));
      if (size > 19) assert.equal(await host.evaluate(() => {
        const tokens = [...document.querySelectorAll('.number-token')].map(el => el.getBoundingClientRect());
        return [...document.querySelectorAll('.port')].every(el => { const p = el.getBoundingClientRect(); return tokens.every(t => p.right <= t.left || p.left >= t.right || p.bottom <= t.top || p.top >= t.bottom); });
      }), true, 'Ports must leave production numbers readable');
      await host.screenshot({ path: `../artifacts/party-${size}-${width}.png`, fullPage: true });
    }
    results.push({ size, bots, humans: 4 - bots, setup: 'passed', productionLog: 'passed', reload: 'passed' });
  }
  assert.deepEqual(errors.filter(e => !e.includes('favicon')), []);
  writeFileSync('../artifacts/party-browser-results.json', JSON.stringify({ result: 'passed', results, errors }, null, 2));
  console.log('Party browser checks passed: all board sizes, three mixed parties, pointer setup, production logs, reload and responsive layouts.');
} finally { await browser.close(); }
