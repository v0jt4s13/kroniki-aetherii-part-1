import { useEffect, useRef, useState, type CSSProperties, type PointerEvent } from 'react';
import { PlusIcon, MinusIcon, Crosshair2Icon, HomeIcon, LayersIcon, PersonIcon } from '@radix-ui/react-icons';
import type { State } from './game-types';
import { labels } from './game-types';

export default function Board({ state, mode, choose, preview = false }: { state: State; mode: string | null; choose: (type: string, id: number) => void; preview?: boolean }) {
  const [zoom, setZoom] = useState(1), [pan, setPan] = useState({ x: 0, y: 0 });
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef({ x: 0, y: 0, px: 0, py: 0, distance: 0, zoom: 1, moved: false });
  const movedAt = useRef(0);
  const el = useRef<HTMLDivElement>(null);
  const world = useRef<HTMLDivElement>(null);
  const clamp = (z: number) => Math.max(0.7, Math.min(2.8, z));
  const movePan = (x: number, y: number) => {
    const viewport = el.current, content = world.current; if (!viewport || !content) return;
    const bound = (value: number, size: number, available: number, offset: number) => {
      if (size * zoom <= available) return available / 2 - offset - size / 2;
      return Math.max(available - offset - size * (1 + zoom) / 2, Math.min(-offset - size * (1 - zoom) / 2, value));
    };
    setPan({ x: bound(x, content.offsetWidth, viewport.clientWidth, content.offsetLeft), y: bound(y, content.offsetHeight, viewport.clientHeight, content.offsetTop) });
  };
  useEffect(() => {
    const observer = new ResizeObserver(() => movePan(pan.x, pan.y));
    if (el.current) observer.observe(el.current);
    movePan(pan.x, pan.y); return () => observer.disconnect();
  }, [zoom]);
  function down(e: PointerEvent) {
    if ((e.target as HTMLElement).closest('.zoom-controls')) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const pts = [...pointers.current.values()];
    gesture.current = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y, zoom, distance: pts.length === 2 ? Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y) : 0, moved: false };
  }
  function move(e: PointerEvent) {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const pts = [...pointers.current.values()], g = gesture.current;
    if (pts.length >= 2 && g.distance > 0) { setZoom(clamp(g.zoom * Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y) / g.distance)); g.moved = true; }
    else if (pts.length === 1) {
      const dx = e.clientX - g.x, dy = e.clientY - g.y;
      if (Math.hypot(dx, dy) > 5) { if (!e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.setPointerCapture(e.pointerId); movePan(g.px + dx, g.py + dy); g.moved = true; }
    }
  }
  function up(e: PointerEvent) {
    if (gesture.current.moved) movedAt.current = Date.now();
    pointers.current.delete(e.pointerId);
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    const pt = [...pointers.current.values()][0];
    if (pt) gesture.current = { x: pt.x, y: pt.y, px: pan.x, py: pan.y, distance: 0, zoom, moved: false };
  }
  const select = (type: string, id: number) => { if (Date.now() - movedAt.current > 180) choose(type, id); };
  const color = (id: string | null) => state.players.find(p => p.id === id)?.color || '#fff2d0';
  const legal = state.legal;
  return <div className="board-viewport" ref={el} data-scroll-drag="ignore" aria-label="Plansza Kroniki Aetherii. Przesuń jednym palcem, powiększ dwoma." onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onWheel={e => { if (e.ctrlKey || e.metaKey) setZoom(z => clamp(z - e.deltaY * 0.003)); }}>
    <div className="board-world" ref={world} style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}>
      {state.board.tiles.map(t => <button key={t.id} type="button" className={`hex-tile ${mode === 'robber' && legal.robber.includes(t.id) ? 'selectable' : ''}`} style={{ left: `${t.x / 540 * 100}%`, top: `${t.y / 500 * 100}%` }} aria-label={`${t.resource === 'desert' ? 'Pustynia' : labels[t.resource]}, ${t.number || 'brak produkcji'}${t.id === state.robber ? ', złodziej' : ''}`} onClick={() => mode === 'robber' && legal.robber.includes(t.id) && select('robber', t.id)} tabIndex={mode === 'robber' && legal.robber.includes(t.id) ? 0 : -1}>
        <img src={`/game/${t.resource === 'wood' ? 'forest' : t.resource}.webp`} alt="" draggable={false}/>
        {t.number > 0 && <span className={`number-token ${[6, 8].includes(t.number) ? 'frequent' : ''}`}>{t.number}<small>{'•'.repeat(6 - Math.abs(7 - t.number))}</small></span>}
        {t.id === state.robber && !preview && <span className="robber-piece"><PersonIcon/></span>}
      </button>)}
      {state.board.ports.map(port => {
        const [a, b] = port.vertices.map(id => state.board.vertices[id]);
        let x = Math.max(60, Math.min(480, 270 + ((a.x + b.x) / 2 - 270) * 1.19));
        const y = Math.max(35, Math.min(440, 250 + ((a.y + b.y) / 2 - 250) * 1.19));
        if (x > 435 && y > 310) x = 435;
        return <span key={port.id} className="port" style={{ left: `${x / 540 * 100}%`, top: `${y / 500 * 100}%` }} title={port.type === 'any' ? 'Port uniwersalny 3:1' : `Port ${labels[port.type]} 2:1`}><b>{port.type === 'any' ? '3:1' : '2:1'}</b>{port.type !== 'any' && <small>{labels[port.type]}</small>}</span>;
      })}
      {state.board.edges.map(e => {
        const a = state.board.vertices[e.a], b = state.board.vertices[e.b];
        const active = mode === 'road' && legal.roads.includes(e.id);
        if (!e.owner && !active) return null;
        return <button key={e.id} className={`road-piece ${active ? 'legal-road' : ''}`} style={{ left: `${(a.x + b.x) / 2 / 540 * 100}%`, top: `${(a.y + b.y) / 2 / 500 * 100}%`, transform: `translate(-50%,-50%) rotate(${Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI}deg)`, color: color(e.owner) }} aria-label={`Droga ${e.id}${active ? ', dostępne miejsce' : ''}`} disabled={!active} onClick={() => select('road', e.id)}><MinusIcon/></button>;
      })}
      {state.board.vertices.map(v => {
        const active = (mode === 'settlement' && legal.settlements.includes(v.id)) || (mode === 'city' && legal.cities.includes(v.id));
        if (!v.owner && !active) return null;
        return <button key={v.id} className={`settlement-piece ${active ? 'legal-vertex' : ''} ${v.owner ? 'occupied' : ''}`} style={{ left: `${v.x / 540 * 100}%`, top: `${v.y / 500 * 100}%`, '--piece-color': color(v.owner) } as CSSProperties} aria-label={`${v.level === 2 ? 'Miasto' : 'Osada'} ${v.id}${active ? ', dostępne miejsce' : ''}`} disabled={!active} onClick={() => select(mode || 'settlement', v.id)}>{v.owner ? v.level === 2 ? <LayersIcon/> : <HomeIcon/> : <PlusIcon/>}</button>;
      })}
    </div>
    <div className="zoom-controls" onPointerDown={e => e.stopPropagation()}>
      <button aria-label="Powiększ planszę" onClick={() => setZoom(z => clamp(z + 0.2))}><PlusIcon/></button>
      <button aria-label="Pomniejsz planszę" onClick={() => setZoom(z => clamp(z - 0.2))}><MinusIcon/></button>
      <button aria-label="Wyśrodkuj planszę" onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }}><Crosshair2Icon/></button>
    </div>
    {mode && <div className="board-instruction">{mode === 'road' ? 'Dotknij podświetlonej krawędzi' : mode === 'robber' ? 'Wybierz teren dla złodzieja' : mode === 'city' ? 'Wybierz swoją osadę' : 'Dotknij wolnego skrzyżowania'}</div>}
  </div>;
}
