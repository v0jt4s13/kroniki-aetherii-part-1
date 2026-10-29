import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { catalogs, locales } from '../i18n/core.mjs';

export function checkCatalogs() {
  const reference = Object.keys(catalogs.pl).sort();
  const placeholders = text => [...text.matchAll(/\{(\d+)\}/g)].map(match => match[1]).sort().join(',');
  for (const locale of Object.keys(locales)) {
    const catalog = catalogs[locale];
    if (JSON.stringify(Object.keys(catalog).sort()) !== JSON.stringify(reference)) throw Error(`Dictionary keys differ: ${locale}`);
    for (const key of reference) {
      if (typeof catalog[key] !== 'string' || !catalog[key].trim()) throw Error(`Empty translation: ${locale}/${key}`);
      if (placeholders(catalog[key]) !== placeholders(catalogs.pl[key])) throw Error(`Parameters differ: ${locale}/${key}`);
    }
  }
  const app = fileURLToPath(new URL('../', import.meta.url));
  // Check literal references without a compiler dependency; dynamic references
  // are typed in TypeScript or validated through the dictionary parity check.
  for (const dir of ['src', 'server']) for (const name of readdirSync(app + dir)) {
    if (!/\.(tsx?|mjs)$/.test(name)) continue;
    const source = readFileSync(`${app}${dir}/${name}`, 'utf8');
    for (const match of source.matchAll(/\b(?:tr|message|source)\(\s*['"]([^'"]+)['"]/g)) {
      if (!Object.hasOwn(catalogs.pl, match[1])) throw Error(`Unknown translation key: ${dir}/${name}: ${match[1]}`);
    }
  }
  return reference.length;
}
if (process.argv[1] === fileURLToPath(import.meta.url)) console.log(`I18n check passed: ${checkCatalogs()} messages, ${Object.keys(locales).length} languages.`);
