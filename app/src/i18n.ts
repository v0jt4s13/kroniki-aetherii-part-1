import { useSyncExternalStore } from 'react';
import { chooseLocale, isLocale, LANGUAGE_STORAGE_KEY, locales, translate, translateSystemText, type Locale, type MessageKey, type Message } from '../i18n/core.mjs';
export { locales, type Locale };
function savedLanguage() { try { return localStorage.getItem(LANGUAGE_STORAGE_KEY); } catch { return null; } }
let locale = chooseLocale({ saved: savedLanguage(), hostname: location.hostname, languages: navigator.languages });
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
export const getLocale = () => locale;
export const getRegion = () => locales[locale].region;
export const tr = (key: MessageKey, args?: readonly unknown[]) => translate(locale, key, args);
export const systemText = (value: string | Error) => {
  const descriptor = typeof value === 'string' ? undefined : (value as Error & { messageDescriptor?: Message }).messageDescriptor;
  return descriptor ? translate(locale, descriptor.key, descriptor.args) : translateSystemText(locale, typeof value === 'string' ? value : value.message);
};
export const responseError = (body: { error?: string; errorMessage?: Message }, fallback = tr('ui.could_not_connect')) => Object.assign(new Error(body.error || fallback), { messageDescriptor: body.errorMessage });
export const eventText = (entry: { text: string; message?: Message }) => entry.message ? translate(locale, entry.message.key, entry.message.args) : entry.text;
function updateDocument() {
  document.documentElement.lang = locale;
  document.title = tr('ui.chronicles_of_aetheria_crown_and_shadow');
}
function apply(next: Locale) {
  if (next === locale) return;
  locale = next; updateDocument(); listeners.forEach(listener => listener());
}
export function setLocale(next: Locale) {
  if (!isLocale(next)) return;
  try { localStorage.setItem(LANGUAGE_STORAGE_KEY, next); } catch { /* Works in memory if storage is unavailable. */ }
  apply(next);
}
export const useLocale = () => useSyncExternalStore(subscribe, getLocale, () => 'pl' as Locale);
window.addEventListener('storage', event => {
  if (event.key === LANGUAGE_STORAGE_KEY || event.key === null) apply(chooseLocale({ saved: savedLanguage(), hostname: location.hostname, languages: navigator.languages }));
});
updateDocument();
