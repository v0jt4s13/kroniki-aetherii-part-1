import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkCatalogs } from '../scripts/check-i18n.mjs';
import { catalogs, chooseLocale, isLocale, translate, translateSystemText } from '../i18n/core.mjs';
import { localizedResponse } from '../i18n/server.mjs';
import { createRoom, player, act, view } from '../server/engine.mjs';

test('all languages have identical message keys and interpolation parameters; source references exist', () => {
  assert.ok(checkCatalogs() > 500);
});
test('an explicit choice overrides the domain; domain overrides browser; invalid values are ignored', () => {
  for (const hostname of ['aetheria.online', 'www.aetheria.gg', 'AETHERIA.GG.']) assert.equal(chooseLocale({ hostname, languages: ['pl-PL'] }), 'en');
  assert.equal(chooseLocale({ hostname: 'kroniky-aetheria.online', languages: ['en-US'] }), 'cs');
  assert.equal(chooseLocale({ hostname: 'kroniki-aetherii.online', languages: ['cs-CZ'] }), 'pl');
  assert.equal(chooseLocale({ saved: 'cs', hostname: 'aetheria.gg', languages: ['pl'] }), 'cs');
  assert.equal(chooseLocale({ saved: '__proto__', hostname: 'aetheria.gg' }), 'en');
  assert.equal(chooseLocale({ hostname: 'aetheria.gg.attacker.test', languages: ['de', 'cs-CZ'] }), 'cs');
  assert.equal(chooseLocale({ languages: ['de', 'en-US'] }), 'en');
  assert.equal(chooseLocale({ saved: 'xx', languages: ['de'] }), 'pl');
  assert.equal(isLocale('toString'), false);
});
test('interpolation keeps player content literal, supports nested messages and never translates free text', () => {
  const name = 'Witaj, {0} <img>';
  assert.equal(translate('en', 'ui.welcome_0', [name]), `Welcome, ${name}`);
  assert.equal(translateSystemText('cs', 'not a known server message'), 'not a known server message');
  const nested = { key: 'events.0_1_resources', args: [name, 3] };
  assert.equal(translate('en', 'events.production_after_rolling_0_1', [8, [nested]]), `Production after rolling 8: ${name}: +3 resources.`);
  assert.equal(translate('cs', 'ui.watchtower'), 'Strážní věž');
  assert.equal(translate('en', 'missing.key'), 'missing.key');
  assert.equal(translate('en', '__proto__'), '__proto__');
});
test('one persisted game event renders in three languages while preserving the Polish API field', () => {
  const g = createRoom('ABC123', 'Ala'); g.players.push(player('Bob', 1));
  act(g, g.host, 'start');
  const event = JSON.parse(JSON.stringify(view(g, g.host).log[0]));
  assert.equal(event.text, 'Rozstawianie: wybierz pierwszą Strażnicę i Trakt.');
  assert.equal(translate('pl', event.message.key, event.message.args), event.text);
  assert.match(translate('en', event.message.key, event.message.args), /Watchtower/);
  assert.match(translate('cs', event.message.key, event.message.args), /Strážní věž/);
});
test('parameterized rule errors and fixed HTTP errors expose stable descriptors without changing compatibility text', () => {
  const g = createRoom('ABC123', 'Ala');
  g.botCount = 2;
  assert.throws(() => act(g, g.host, 'start'), error => {
    assert.match(error.message, /Poczekaj na 2/);
    assert.equal(translate('en', error.messageDescriptor.key, error.messageDescriptor.args), 'Wait for 2 human players.');
    return true;
  });
  const result = localizedResponse({ error: 'Pokój jest pełny.' });
  assert.equal(result.error, 'Pokój jest pełny.');
  assert.equal(translate('cs', result.errorMessage.key, result.errorMessage.args), 'Místnost je plná.');
});
test('browser language store changes document and labels without reload; storage failures and cross-tab changes work', async () => {
  // Execute the real store without a browser or a DOM dependency.
  const storage = new Map(); const events = new Map();
  const saved = Object.fromEntries(['localStorage','location','navigator','document','window'].map(k => [k, Object.getOwnPropertyDescriptor(globalThis, k)]));
  const setGlobal = (key, value) => Object.defineProperty(globalThis, key, { configurable: true, value, writable: true });
  try {
    setGlobal('localStorage', { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) });
    setGlobal('location', { hostname: 'aetheria.gg' });
    setGlobal('navigator', { languages: ['pl-PL'] });
    setGlobal('document', { documentElement: { lang: '' }, title: '' });
    setGlobal('window', { addEventListener: (type, listener) => events.set(type, listener) });
    const output = mkdtempSync(join(tmpdir(), 'aetherii-locale-test-'));
    let code;
    try {
      execFileSync(process.execPath, [fileURLToPath(new URL('../node_modules/typescript/bin/tsc', import.meta.url)), '--ignoreConfig', '--target', 'es2022', '--module', 'esnext', '--moduleResolution', 'bundler', '--resolveJsonModule', '--esModuleInterop', '--skipLibCheck', '--rootDir', fileURLToPath(new URL('../', import.meta.url)), '--outDir', output, fileURLToPath(new URL('../src/i18n.ts', import.meta.url))]);
      code = readFileSync(join(output, 'src/i18n.js'), 'utf8');
    } finally { rmSync(output, { recursive: true, force: true }); }
    code = code.replace("from 'react'", `from '${new URL('../node_modules/react/index.js', import.meta.url).href}'`)
      .replace("from '../i18n/core.mjs'", `from '${new URL('../i18n/core.mjs', import.meta.url).href}'`);
    const store = await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));
    assert.equal(store.getLocale(), 'en'); assert.equal(document.documentElement.lang, 'en');
    const error = store.responseError({ error: 'Poczekaj na 2 graczy ludzkich.', errorMessage: { key: 'errors.wait_for_0_human_players', args: [2] } });
    assert.equal(store.systemText(error), 'Wait for 2 human players.');
    store.setLocale('cs'); assert.equal(storage.get('aetherii:language'), 'cs');
    assert.equal(store.systemText(error), 'Počkejte na 2 lidských hráčů.');
    assert.equal(store.tr('ui.watchtower'), 'Strážní věž'); assert.equal(store.getRegion(), 'cs-CZ');
    assert.match(document.title, /Kroniky/);
    storage.set('aetherii:language','pl'); events.get('storage')({ key:'aetherii:language' });
    assert.equal(store.getLocale(), 'pl');
    localStorage.setItem = () => { throw Error('blocked'); };
    store.setLocale('en'); assert.equal(store.getLocale(), 'en');
    store.setLocale('xx'); assert.equal(store.getLocale(), 'en');
  } finally {
    for (const [key, descriptor] of Object.entries(saved)) if (descriptor) Object.defineProperty(globalThis,key,descriptor); else delete globalThis[key];
  }
});
