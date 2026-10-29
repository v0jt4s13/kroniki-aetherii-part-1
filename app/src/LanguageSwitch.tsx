import { locales, setLocale, tr, useLocale, type Locale } from './i18n';

export default function LanguageSwitch() {
  const language = useLocale();
  return <label className="language-switch"><svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c5 5 5 13 0 18-5-5-5-13 0-18Z"/></svg><span className="language-label">{tr('language.label')}</span><select aria-label={tr('language.label')} value={language} onChange={event => setLocale(event.target.value as Locale)}>{Object.entries(locales).map(([id, config]) => <option key={id} value={id} lang={id}>{config.name}</option>)}</select></label>;
}
