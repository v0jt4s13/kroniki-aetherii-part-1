import { tr } from './i18n';
import { useEffect, useState } from 'react';
import { MoonIcon, SunIcon } from '@radix-ui/react-icons';
import './theme.css';

type Theme = 'light' | 'dark';
export default function ThemeSwitch() {
  const [theme, setTheme] = useState<Theme>(() => {
    try { return localStorage.getItem('aetherii:theme') === 'dark' ? 'dark' : 'light'; }
    catch { return 'light'; }
  });
  useEffect(() => {
    document.documentElement.dataset.aetheriiTheme = theme;
    document.querySelector<HTMLMetaElement>('meta[name=theme-color]')?.setAttribute('content', theme === 'dark' ? '#14161f' : '#f5eddb');
    try { localStorage.setItem('aetherii:theme', theme); } catch { /* Switching also works without storage. */ }
  }, [theme]);
  const label = theme === 'dark' ? tr("ui.switch_to_light_theme") : tr("ui.switch_to_dark_theme");
  return <button type="button" className="theme-toggle" aria-pressed={theme === 'dark'} aria-label={label} title={label} onClick={() => setTheme(t => t === 'dark' ? 'light' : 'dark')}>{theme === 'dark' ? <SunIcon/> : <MoonIcon/>}</button>;
}
