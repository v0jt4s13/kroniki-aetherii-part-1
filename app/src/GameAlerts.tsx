import { useEffect, useRef, useState } from 'react';
import { Cross2Icon, BellIcon } from '@radix-ui/react-icons';
import { labels, resources, type State } from './game-types';

type Alert = { id: string; type: 'turn' | 'trade'; title: string; text: string };
export default function GameAlerts({ state, trade }: { state: State | null; trade: () => void }) {
  const previous = useRef<State | null>(null), seen = useRef(new Set<string>());
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const notify = (a: Alert) => {
    if (seen.current.has(a.id)) return; seen.current.add(a.id);
    setAlerts(xs => [...xs, a].slice(-5));
    if (document.hidden && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      try { const n = new Notification(a.title, { body: a.text, tag: a.id }); n.onclick = () => { window.focus(); n.close(); }; } catch { /* In-game popup remains available on unsupported browsers. */ }
    }
  };
  useEffect(() => {
    const old = previous.current; previous.current = state;
    if (!state) { setAlerts([]); seen.current.clear(); return; }
    if (old && old.code !== state.code) { setAlerts([]); seen.current.clear(); }
    const myTurn = state.players[state.active].id === state.me;
    if (myTurn && ['roll', 'main', 'free-roads', 'robber', 'setup-settlement'].includes(state.phase) && (!old || old.code !== state.code || old.players[old.active].id !== old.me || (old.phase.startsWith('setup') && state.phase === 'roll'))) {
      notify({ id: `${state.code}:turn:${state.turn}:${state.phase.startsWith('setup') ? state.revision : ''}`, type: 'turn', title: 'Twój ruch', text: state.phase.startsWith('setup') ? 'Wybierz miejsce dla osady i drogi.' : 'Wyspa czeka na Ciebie. Możesz wykonać swój ruch.' });
    }
    const present = new Set(state.offers.map(o => `${state.code}:offer:${o.id}`));
    setAlerts(xs => xs.filter(a => a.type === 'trade' ? present.has(a.id) : myTurn));
    for (const o of state.offers) if (o.from !== state.me && (!o.to || o.to === state.me)) {
      const describe = (bag: typeof o.give) => resources.filter(r => bag[r]).map(r => `${bag[r]} ${labels[r].toLowerCase()}`).join(', ');
      notify({ id: `${state.code}:offer:${o.id}`, type: 'trade', title: 'Propozycja handlu', text: `${state.players.find(p => p.id === o.from)?.name} oferuje ${describe(o.give)} za ${describe(o.want)}.` });
    }
  }, [state]);
  useEffect(() => {
    const original = document.title;
    if (!alerts.length) return;
    const updateTitle = () => { document.title = document.hidden ? `${alerts.at(-1)!.title} · Kroniki Aetherii` : original; };
    updateTitle(); document.addEventListener('visibilitychange', updateTitle);
    return () => { document.title = original; document.removeEventListener('visibilitychange', updateTitle); };
  }, [alerts]);
  return <>
    <div className="game-alerts" aria-label="Powiadomienia gry">{alerts.slice(-1).map(a => <section key={a.id} className="game-alert" role="alert" aria-label={a.title}>
      <BellIcon aria-hidden="true"/><div><strong>{a.title}</strong><p>{a.text}</p><button className="text-button" onClick={() => { setAlerts(xs => xs.filter(x => x.id !== a.id)); if (a.type === 'trade') trade(); else document.querySelector('.turn-panel')?.scrollIntoView({ behavior: 'smooth', block: 'center' }); }}>{a.type === 'trade' ? 'Zobacz ofertę' : 'Przejdź do ruchu'}</button></div><button className="dismiss-alert" aria-label="Zamknij powiadomienie" onClick={() => setAlerts(xs => xs.filter(x => x.id !== a.id))}><Cross2Icon/></button>
    </section>)}</div>

  </>;
}

export function NotificationSettings() {
  const [permission, setPermission] = useState(() => typeof Notification === 'undefined' ? 'unavailable' : Notification.permission);
  async function enable() {
    try { setPermission(await Notification.requestPermission()); } catch { setPermission('unavailable'); }
  }
  return <div className="notification-setting">{permission === 'default' ? <button className="text-button" onClick={enable}><BellIcon/>Włącz powiadomienia poza kartą gry</button> : <small>{permission === 'granted' ? 'Powiadomienia przeglądarki włączone' : 'Powiadomienia pojawiają się w oknie gry'}</small>}</div>;
}
