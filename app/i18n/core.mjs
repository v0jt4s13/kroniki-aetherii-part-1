import pl from './pl.json' with { type: 'json' };
import en from './en.json' with { type: 'json' };
import cs from './cs.json' with { type: 'json' };

// Add a language here and its dictionary alongside the existing files.
export const locales = Object.freeze({
  pl: { name: 'Polski', region: 'pl-PL', domains: ['kroniki-aetherii.online'] },
  en: { name: 'English', region: 'en-GB', domains: ['aetheria.online', 'aetheria.gg'] },
  cs: { name: 'Čeština', region: 'cs-CZ', domains: ['kroniky-aetheria.online'] },
});
export const catalogs = { pl, en, cs };
export const LANGUAGE_STORAGE_KEY = 'aetherii:language';
export const isLocale = value => typeof value === 'string' && Object.hasOwn(locales, value);
export function chooseLocale({ saved, hostname = '', languages = [] } = {}) {
  if (isLocale(saved)) return saved;
  const host = hostname.toLowerCase().replace(/^www\./, '').replace(/\.$/, '');
  for (const [locale, config] of Object.entries(locales)) if (config.domains.includes(host)) return locale;
  for (const language of languages) {
    const locale = String(language).toLowerCase().split(/[-_]/)[0];
    if (isLocale(locale)) return locale;
  }
  return 'pl';
}
// Parameters are values, not HTML. Nested messages let one event be rendered
// differently by every player without translating names or chat messages.
export function translate(locale, key, args = []) {
  const dictionary = catalogs[isLocale(locale) ? locale : 'pl'];
  const text = Object.hasOwn(dictionary, key) ? dictionary[key] : Object.hasOwn(pl, key) ? pl[key] : key;
  const format = value => Array.isArray(value) ? value.map(format).join('; ')
    : value && typeof value === 'object' && typeof value.key === 'string'
      ? translate(locale, value.key, value.args) : String(value ?? '');
  return text.replace(/\{(\d+)\}/g, (placeholder, index) => Number(index) < args.length ? format(args[Number(index)]) : placeholder);
}
const messageKeys = new Map();
for (const catalog of Object.values(catalogs)) for (const [key, value] of Object.entries(catalog)) {
  if (!/\{\d+\}/.test(value)) messageKeys.set(value, key);
}
// Compatibility for existing server error strings. Exact lookup only, never
// applied to player content and never a request to a translation service.
export function translateSystemText(locale, text) {
  const key = messageKeys.get(text);
  return key ? translate(locale, key) : text;
}
