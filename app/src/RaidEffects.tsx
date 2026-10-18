import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { CheckCircledIcon, CrossCircledIcon } from '@radix-ui/react-icons';
import { appPath } from './app-path';
import { createPortal } from 'react-dom';
import type { Battle, State } from './game-types';
import './raid-effects.css';

type Flight = { host: HTMLElement; style: CSSProperties };
type Outcome = { room: string; battle: Battle; cataclysm: boolean };
export default function RaidEffects({ state, preview }: { state: State; preview: boolean }) {
  const scene = useRef<HTMLDivElement>(null);
  const [flight, setFlight] = useState<Flight | null>(null);
  const previous = useRef({ room: state.code, battle: state.lastBattle?.turn });
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  useEffect(() => {
    const before = previous.current;
    previous.current = { room: state.code, battle: state.lastBattle?.turn };
    if (preview || before.room !== state.code) { setOutcome(null); return; }
    // Loading a saved room establishes a baseline; only a new battle gets a celebration.
    if (!state.lastBattle || before.battle === state.lastBattle.turn) return;
    setOutcome({ room: state.code, battle: state.lastBattle, cataclysm: state.cataclysm });
    const timer = setTimeout(() => setOutcome(null), 4800);
    return () => clearTimeout(timer);
  }, [state.code, state.lastBattle?.turn, preview]);

  const result = !state.raid && outcome?.room === state.code ? outcome : null;
  useLayoutEffect(() => {
    if (preview) return;
    const board = scene.current?.closest<HTMLElement>('.board-viewport');
    const host = board?.closest<HTMLElement>('.catan-game');
    const source = host?.querySelector<HTMLElement>('.realm-defense .threat-heading');
    if (!board || !host || !source) return;
    const measure = () => {
      const island = board.getBoundingClientRect(), game = host.getBoundingClientRect(), threat = source.getBoundingClientRect();
      // Account for the scaled device preview as well as the native page layout.
      const scaleX = game.width / host.offsetWidth || 1, scaleY = game.height / host.offsetHeight || 1;
      const size = Math.max(70, Math.min(100, board.clientWidth * .18));
      const left = (island.left - game.left) / scaleX + 8, top = (island.top - game.top) / scaleY + 8;
      setFlight({ host, style: {
        left: `${left}px`, top: `${top}px`, width: `${size}px`,
        '--dragon-from-x': `${(threat.left + threat.width / 2 - game.left) / scaleX - left - size / 2}px`,
        '--dragon-from-y': `${(threat.top + threat.height / 2 - game.top) / scaleY - top - size / 2}px`,
      } as CSSProperties });
    };
    measure();
    const observer = new ResizeObserver(measure);
    [board, host, source].forEach(el => observer.observe(el));
    return () => observer.disconnect();
  }, [state.code, state.raid?.started, result?.battle.turn, preview]);
  if (preview || (!state.raid && !result)) return null;
  const variant = result ? result.battle.won ? 'victory' : 'defeat' : 'arrival';
  const resultLayer = result && <div className="battle-result-layer">
      <div className={`battle-outcome battle-outcome--${variant}`} role="status" aria-live="polite" key={`${result.room}:${result.battle.turn}`}>
        <span className="battle-symbol" aria-hidden="true">{result.battle.won ? <CheckCircledIcon/> : <CrossCircledIcon/>}</span>
        <strong>{result.battle.won ? 'Najazd odparty!' : result.cataclysm ? 'Kataklizm! Aetheria upada' : 'Obrona przełamana'}</strong>
        <span>Pancerz {result.battle.strength}/{result.battle.required}</span>
        <small>{result.battle.won ? 'Smok wycofuje się znad wyspy.' : result.cataclysm ? 'Wszyscy obrońcy przegrywają.' : 'Kraina ponosi straty. Odbudujcie obronę.'}</small>
        {result.battle.won && <span className="battle-sparks" aria-hidden="true">{Array.from({ length: 8 }, (_, i) => <i key={i} style={{ '--spark-x': `${Math.cos(i * Math.PI / 4) * 115}px`, '--spark-y': `${Math.sin(i * Math.PI / 4) * 100}px`, '--spark-delay': `${i * 45}ms` } as CSSProperties}/>)}</span>}
      </div>
  </div>;
  const viewport = document.querySelector('.native-game #root');
  return <>
    <div ref={scene} className={`raid-effects raid-effects--${variant}`}>
      {state.raid && <span className="raid-announcement" role="status">Smok nadlatuje. Przygotujcie obronę!</span>}
      {result && <div className={`battle-aura battle-aura--${variant}`} aria-hidden="true"/>}
    </div>
    {flight && createPortal(<div className="raid-flight-layer" data-source="realm-defense">
      <div style={flight.style} className={`raid-dragon raid-dragon--${variant}`} key={state.raid ? `${state.code}:${state.raid.started}` : `${result?.room}:battle:${result?.battle.turn}`} aria-hidden="true">
        <div className="dragon-hover"><span className="dragon-shadow"/><img src={appPath('/game/aetherii/dragon.webp')} alt="" draggable={false}/></div>
      </div>
    </div>, flight.host)}
    {resultLayer && (viewport ? createPortal(resultLayer, viewport) : resultLayer)}
  </>;
}
