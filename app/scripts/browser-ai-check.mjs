import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';

mkdirSync('../artifacts', { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/opt/google/chrome/chrome', headless: true, args: ['--no-sandbox'] });
const errors = [];
try {
  const page = await browser.newPage({ viewport: { width: 393, height: 852 } });
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(process.env.CATAN_URL || 'http://127.0.0.1:4173');
  await page.getByLabel('Twoje imię', { exact: true }).fill('Ala');
  await page.getByRole('combobox', { name: 'Tryb rozgrywki', exact: true }).selectOption('ai');
  await page.screenshot({ path: '../artifacts/ai-mode-mobile.png', fullPage: true });
  await page.getByRole('button', { name: 'Zagraj z AI', exact: true }).click();
  await page.getByText('Komputer', { exact: false }).first().waitFor();
  assert.equal(await page.locator('.players .player').count(), 2);
  for (let i = 0; i < 4; i++) {
    // Between the two human placements, the server performs both AI pairs.
    await page.locator('.legal-vertex').first().click();
    await page.getByRole('button', { name: 'Potwierdź budowę', exact: true }).click();
    await page.locator('.legal-road').first().click();
    await page.getByRole('button', { name: 'Potwierdź budowę', exact: true }).click();
  }
  await page.getByRole('button', { name: 'Rzuć kośćmi', exact: true }).waitFor();
  await page.reload();
  await page.getByRole('button', { name: 'Rzuć kośćmi', exact: true }).click();
  await page.locator('.roll-gains').waitFor();
  assert.match(await page.locator('.roll-gains').innerText(), /Zdobyte surowce:|żadnych surowców/);
  await page.waitForTimeout(1500);
  if (await page.locator('.hex-tile.selectable').count()) {
    await page.locator('.hex-tile.selectable').first().click(); await page.waitForTimeout(500);
    if (await page.getByRole('heading', { name: 'Wybierz gracza', exact: true }).count()) await page.locator('.game-sheet .secondary').first().click();
  }
  await page.getByRole('button', { name: 'Zakończ turę', exact: true }).click();
  await page.getByRole('button', { name: 'Rzuć kośćmi', exact: true }).waitFor();
  await page.locator('.roll-gains').waitFor();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: '../artifacts/ai-game-mobile.png', fullPage: true });
  if (await page.getByRole('button', { name: 'Zamknij powiadomienie', exact: true }).count()) await page.getByRole('button', { name: 'Zamknij powiadomienie', exact: true }).click();
  await page.getByRole('button', { name: 'Dziennik gry z AI', exact: true }).click();
  await page.getByRole('heading', { name: 'Dziennik wyprawy', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Zamknij panel', exact: true }).click();
  await page.setViewportSize({ width: 320, height: 740 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  assert.deepEqual(errors.filter(e => !e.includes('favicon') && !e.includes('ERR_CERT_AUTHORITY_INVALID')), []);
  writeFileSync('../artifacts/ai-browser-results.json', JSON.stringify({ result: 'passed', players: 2, tests: ['AI mode selection', 'human pointer setup', 'automatic AI setup', 'reload identity', 'human roll', 'automatic AI turn', 'history', '320px overflow'], errors }, null, 2));
  console.log('AI browser checks passed: two players, setup, reload, automatic turn and mobile.');
} finally { await browser.close(); }
