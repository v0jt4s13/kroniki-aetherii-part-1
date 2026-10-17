import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';

mkdirSync('../artifacts', { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/opt/google/chrome/chrome', headless: true, args: ['--no-sandbox'] });
const errors = [];
const contexts = [];
const base = process.env.AETHERII_URL || 'http://127.0.0.1:4173';
async function pageFor(width = 393, height = 852) {
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 }); contexts.push(context);
  const page = await context.newPage();
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', msg => { if (msg.type() === 'error') errors.push(`${msg.text()} ${msg.location().url}`); });
  return page;
}
try {
  const host = await pageFor(); await host.goto(base); await host.locator('.hex-tile img').first().waitFor();
  await host.screenshot({ path: '../artifacts/landing-mobile.png', fullPage: true });
  await host.getByLabel('Twoje imię', { exact: true }).fill('Ala');
  await host.getByRole('button', { name: 'Stwórz pokój', exact: true }).click();
  await host.getByRole('heading', { name: 'Zbierz swoją załogę' }).waitFor();
  const code = new URL(host.url()).searchParams.get('room'); assert.match(code, /^[A-Z0-9]{6}$/);
  await host.getByRole('button', { name: 'Zaproś znajomych', exact: true }).click();
  assert.ok((await host.getByLabel('Link zaproszenia', { exact: true }).inputValue()).includes(code));
  await host.getByRole('button', { name: 'Zamknij panel', exact: true }).click();
  const pages = [host];
  for (const name of ['Bartek', 'Celina', 'Dawid']) {
    const page = await pageFor(); pages.push(page); await page.goto(`${base}/?room=${code}`);
    await page.getByLabel('Twoje imię', { exact: true }).fill(name);
    await page.getByRole('button', { name: `Dołącz do pokoju ${code}` }).click();
    await page.getByRole('heading', { name: 'Zbierz swoją załogę' }).waitFor();
  }
  await host.getByRole('button', { name: 'Rozpocznij grę (4/4)', exact: true }).waitFor();
  await host.getByRole('button', { name: 'Rozpocznij grę (4/4)', exact: true }).click();
  // Perform all setup placements through real pointer clicks and confirmations.
  for (const i of [0, 1, 2, 3, 3, 2, 1, 0]) {
    const page = pages[i];
    await page.locator('.legal-vertex').first().waitFor();
    await page.locator('.legal-vertex').first().click();
    await page.getByRole('button', { name: 'Potwierdź budowę', exact: true }).click();
    await page.locator('.legal-road').first().waitFor();
    await page.locator('.legal-road').first().click();
    await page.getByRole('button', { name: 'Potwierdź budowę', exact: true }).click();
  }
  await host.getByRole('button', { name: 'Rzuć kośćmi', exact: true }).waitFor();
  await host.evaluate(() => window.scrollTo(0, 0));
  await host.evaluate(() => document.fonts.ready);
  await host.screenshot({ path: '../artifacts/game-mobile.png' });
  const world = host.locator('.board-world'); const before = await world.getAttribute('style');
  await host.getByRole('button', { name: 'Powiększ planszę', exact: true }).click();
  assert.notEqual(await world.getAttribute('style'), before);
  await host.getByRole('button', { name: 'Wyśrodkuj planszę', exact: true }).click();
  const cdp = await host.context().newCDPSession(host);
  const boardBox = await host.locator('.board-viewport').boundingBox();
  const touchY = boardBox.y + 170;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 160, y: touchY }, { x: 230, y: touchY }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 130, y: touchY }, { x: 260, y: touchY }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  assert.notEqual(await world.getAttribute('style'), before, 'Pinch should change board zoom');
  await host.getByRole('button', { name: 'Wyśrodkuj planszę', exact: true }).click();
  assert.equal(await world.getAttribute('style'), before);
  await host.mouse.move(boardBox.x + 100, boardBox.y + 100); await host.mouse.down(); await host.mouse.move(boardBox.x + 140, boardBox.y + 115, { steps: 5 }); await host.mouse.up();
  assert.notEqual(await world.getAttribute('style'), before);
  await host.getByRole('button', { name: 'Wyśrodkuj planszę', exact: true }).click();
  await host.getByRole('button', { name: 'Karty', exact: true }).click();
  await host.getByRole('heading', { name: 'Twoje karty rozwoju' }).waitFor();
  await host.getByRole('button', { name: 'Zamknij panel', exact: true }).click();
  await host.reload(); await host.getByRole('button', { name: 'Rzuć kośćmi', exact: true }).waitFor();
  await host.getByRole('button', { name: 'Rzuć kośćmi', exact: true }).click();
  // A 7 may require a robber move before turn completion.
  await host.waitForTimeout(1500);
  if (await host.locator('.hex-tile.selectable').count()) {
    await host.locator('.hex-tile.selectable').first().click(); await host.waitForTimeout(500);
    if (await host.getByRole('heading', { name: 'Wybierz gracza', exact: true }).count()) await host.locator('.game-sheet .secondary').first().click();
  }
  await host.getByRole('button', { name: 'Zakończ turę', exact: true }).click();
  await pages[1].getByRole('button', { name: 'Rzuć kośćmi', exact: true }).waitFor();
  // Capture desktop and native small phone, and preserved mobile prototype shell.
  await host.setViewportSize({ width: 1440, height: 1000 }); await host.screenshot({ path: '../artifacts/game-desktop.png', fullPage: true });
  await host.setViewportSize({ width: 320, height: 740 });
  assert.equal(await host.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await host.screenshot({ path: '../artifacts/game-small-mobile.png', fullPage: true });
  const preview = await pageFor(1400, 1200); await preview.goto(`${base}/?preview=1`);
  await preview.locator('.hex-tile img').first().waitFor();
  const box = await preview.getByTestId('device-screen').boundingBox();
  assert.equal(Math.round(box.width), 393); assert.equal(Math.round(box.height), 852);
  await preview.getByTestId('device-screen').screenshot({ path: '../artifacts/template-mobile.png' });
  // Missing favicon requests are harmless; all actual JS errors are a failure.
  const actualErrors = errors.filter(e => !e.includes('favicon') && !e.includes('ERR_CERT_AUTHORITY_INVALID'));
  assert.deepEqual(actualErrors, []);
  writeFileSync('../artifacts/browser-results.json', JSON.stringify({ result: 'passed', players: 4, code, tests: ['create room', 'invite link', 'join 4 independent contexts', 'snake setup via pointer', 'zoom', 'pan', 'touch pinch', 'cards panel', 'reload resumes identity', 'roll dice', 'turn sync', '320px overflow', 'desktop', 'preserved template'], errors }, null, 2));
  console.log('Browser checks passed: 4 players, pointer setup, reconnect, pan/zoom, roll, turn sync, mobile/desktop.');
} finally { await browser.close(); }
