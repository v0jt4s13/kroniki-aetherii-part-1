import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, mkdirSync } from 'node:fs';
import assert from 'node:assert/strict';

// Isolated production server: never writes to saved developer or production games.
const data = mkdtempSync('/tmp/aetherii-appearance-');
const base = 'http://127.0.0.1:14295';
const proc = spawn(process.execPath, ['server/start.mjs', '--production', '--host', '127.0.0.1', '--port', '14295'], { env: { ...process.env, AETHERII_DATA_DIR: data, PUBLIC_URL: base }, stdio: 'pipe' });
let browser;
try {
  await new Promise((resolve, reject) => { proc.stdout.on('data', c => { if (c.toString().includes('Kroniki Aetherii:')) resolve(); }); proc.once('error', reject); proc.once('exit', c => reject(new Error('Server exit ' + c))); });
  browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/opt/google/chrome/chrome', headless: true, args: ['--no-sandbox'] });
  mkdirSync('../artifacts', { recursive: true });
  for (const [width, opponents] of [[320, 1], [393, 2], [1440, 3]]) {
    const page = await browser.newPage({ viewport: { width, height: width === 1440 ? 1000 : 852 } }); page.setDefaultTimeout(15000);
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(base, { waitUntil: 'networkidle' });
    assert.equal(await page.locator('body').evaluate(el => getComputedStyle(el).backgroundColor), 'rgb(245, 237, 219)');
    await page.getByRole('button', { name: 'Włącz ciemny motyw', exact: true }).click();
    await page.waitForFunction(() => document.documentElement.dataset.aetheriiTheme === 'dark');
    assert.equal(await page.locator('body').evaluate(el => getComputedStyle(el).backgroundColor), 'rgb(20, 22, 31)');
    await page.reload({ waitUntil: 'networkidle' });
    await page.getByRole('button', { name: 'Włącz jasny motyw', exact: true }).waitFor();
    await page.getByLabel('Twoje imię', { exact: true }).fill('Tester');
    await page.locator('select').first().selectOption('ai');
    await page.getByRole('combobox', { name: /Przeciwnicy SI/ }).selectOption(String(opponents));
    const creation = page.waitForResponse(r => r.url().endsWith('/api/rooms') && r.request().method() === 'POST');
    await page.getByRole('button', { name: 'Zagraj z AI', exact: true }).click();
    const state = (await (await creation).json()).state;
    assert.equal(state.players.length, opponents + 1); assert.equal(state.botCount, opponents);
    assert.equal(new Set(state.players.map(p => p.faction)).size, opponents + 1);
    await page.locator('.legal-vertex').first().waitFor();
    const alert = page.getByRole('button', { name: 'Zamknij powiadomienie', exact: true }); if (await alert.count()) await alert.click();
    await page.locator('.legal-vertex').first().click();
    await page.getByRole('button', { name: 'Potwierdź budowę', exact: true }).click();
    await page.locator('.watchtower-art').first().waitFor();
    assert.match(await page.locator('.watchtower-art').first().evaluate(el => getComputedStyle(el).filter), /255, 255, 255/);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.screenshot({ path: `../artifacts/theme-dark-${width}.png` });
    await page.getByRole('button', { name: 'Zaloguj / załóż konto', exact: true }).click();
    assert.equal(await page.locator('.native-sheet').evaluate(el => getComputedStyle(el).backgroundColor), 'rgb(27, 30, 43)');
    assert.equal(await page.locator('.game-sheet').evaluate(el => getComputedStyle(el).fontSize), '18px');
    assert.equal(await page.locator('.game-sheet').evaluate(el => el.scrollWidth > el.clientWidth), false);
    await page.screenshot({ path: `../artifacts/theme-account-${width}.png` });
    await page.getByRole('button', { name: 'Zamknij panel', exact: true }).click();
    await page.getByRole('button', { name: 'Włącz jasny motyw', exact: true }).click();
    await page.waitForFunction(() => document.documentElement.dataset.aetheriiTheme === 'light');
    assert.equal(await page.locator('body').evaluate(el => getComputedStyle(el).backgroundColor), 'rgb(245, 237, 219)');
    assert.deepEqual(errors, []);
    console.log(`PASS ${width}px: saved theme, dark panels/shadow, ${opponents} AI opponents, construction and light-mode restoration`);
    await page.close();
  }
} finally {
  await browser?.close();
  if (proc.exitCode === null) await new Promise(resolve => { proc.once('exit', resolve); proc.kill('SIGTERM'); });
  rmSync(data, { recursive: true, force: true });
}
