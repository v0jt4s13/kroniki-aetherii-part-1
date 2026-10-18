import { useEffect, useState } from 'react';
import { appPath } from './app-path';

type Report = { online: number; unique30d: number };
export default function TrafficReport() {
  const [report, setReport] = useState<Report | null>(null);
  useEffect(() => {
    // randomUUID exists only in secure contexts; plain http on a LAN address needs the fallback.
    const tab = crypto.randomUUID?.() ?? Array.from(crypto.getRandomValues(new Uint8Array(16)), b => b.toString(16).padStart(2, '0')).join('');
    let stopped = false;
    let running = false;
    let visited = false;
    const send = async () => {
      if (running || stopped || document.visibilityState !== 'visible') return;
      running = true;
      try {
        const response = await fetch(appPath('/api/traffic'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tab, type: visited ? 'pulse' : 'visit' }), signal: AbortSignal.timeout(10000) });
        if (response.ok) { visited = true; if (!stopped) setReport(await response.json()); }
      } catch { /* Telemetry must never interrupt the game. */ }
      finally { running = false; }
    };
    const leave = () => { if (!visited) return; navigator.sendBeacon(appPath('/api/traffic'), new Blob([JSON.stringify({ tab, type: 'leave' })], { type: 'application/json' })); };
    const visibility = () => { if (document.visibilityState === 'visible') void send(); else leave(); };
    // Deferral avoids counting React StrictMode's discarded effect as a second visit.
    const start = setTimeout(() => void send(), 0);
    const timer = setInterval(() => void send(), 30000);
    document.addEventListener('visibilitychange', visibility);
    window.addEventListener('pagehide', leave);
    return () => { stopped = true; clearTimeout(start); clearInterval(timer); document.removeEventListener('visibilitychange', visibility); window.removeEventListener('pagehide', leave); };
  }, []);
  return <div className="traffic-report" aria-label="Statystyki odwiedzin" title="Przybliżone statystyki przeglądarek. Aktywność: widoczna karta w ostatniej minucie. Bez zapisu IP i danych kont; retencja 30 dni.">{report ? <>Aktualnie jest <strong>{report.online}</strong> osób. Przez ostatnie 30 dni było <strong>{report.unique30d}</strong> unikatowych osób.</> : 'Wczytuję statystyki odwiedzin…'}</div>;
}
