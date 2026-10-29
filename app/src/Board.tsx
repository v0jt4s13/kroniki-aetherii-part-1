import { tr } from './i18n';
import { appPath } from './app-path';
import RaidEffects from './RaidEffects';
import { useEffect, useRef, useState, type CSSProperties, type PointerEvent } from 'react';
import { PlusIcon, MinusIcon, Crosshair2Icon, LayersIcon, PersonIcon } from '@radix-ui/react-icons';
import type { State } from './game-types';
import { labels, shortLabels, factions, watchtowerImage } from './game-types';

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
  const portSpot = (port: State['board']['ports'][number]) => {
        const [a, b] = port.vertices.map(id => state.board.vertices[id]);
        const expanded = state.board.tiles.length > 19;
        const midX = (a.x + b.x) / 2, midY = (a.y + b.y) / 2;
        let x = 270 + (midX - 270) * 1.19, y = 250 + (midY - 250) * 1.19;
        if (expanded) {
          const tile = state.board.tiles.find(t => t.vertices.includes(a.id) && t.vertices.includes(b.id))!;
          const distance = Math.hypot(midX - tile.x, midY - tile.y), offset = (state.board.hexRadius || 38) * 0.7;
          // Push straight out from the coast, including the bays between added hexes.
          x = midX + (midX - tile.x) / distance * offset;
          y = midY + (midY - tile.y) / distance * offset;
        }
        x = Math.max(60, Math.min(480, x));
        y = Math.max(expanded ? 20 : 35, Math.min(expanded ? 480 : 440, y));
        if (!expanded && x > 435 && y > 310) x = 435;
        return { x, y };
  };
  return <div className={`board-viewport${state.board.tiles.length > 19 ? ' expanded-board' : ''}`} ref={el} data-scroll-drag="ignore" aria-label={tr("ui.chronicles_of_aetheria_board_drag_with_one_finger_pinch_with_two")} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onWheel={e => { if (e.ctrlKey || e.metaKey) setZoom(z => clamp(z - e.deltaY * 0.003)); }}>
    <div className="board-world" ref={world} style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}>
      {state.board.tiles.map(t => <button key={t.id} type="button" className={`hex-tile ${mode === 'robber' && legal.robber.includes(t.id) ? 'selectable' : ''}`} style={{ left: `${t.x / 540 * 100}%`, top: `${t.y / 500 * 100}%`, width: `${Math.sqrt(3) * (state.board.hexRadius || 48) / 540 * 100}%` }} aria-label={`${t.resource === 'desert' ? tr("ui.wasteland_empty_tile") : labels[t.resource]}, ${t.number || tr("ui.no_production")}${t.id === state.robber ? tr("ui.robber") : ''}`} onClick={() => mode === 'robber' && legal.robber.includes(t.id) && select('robber', t.id)} tabIndex={mode === 'robber' && legal.robber.includes(t.id) ? 0 : -1}>
        <img src={appPath(`/game/aetherii/${t.resource === 'wood' ? 'forest' : t.resource}.webp`)} alt="" draggable={false}/>
        {t.number > 0 && <span className={`number-token ${[6, 8].includes(t.number) ? 'frequent' : ''}`} title={tr("ui.chance_of_rolling_0_1_36", [t.number, 6 - Math.abs(7 - t.number)])}>{t.number}<small>{'•'.repeat(6 - Math.abs(7 - t.number))}</small></span>}
        {t.id === state.robber && !preview && <span className="robber-piece"><PersonIcon/></span>}
      </button>)}
      <svg className="port-piers" viewBox="0 0 540 500" aria-hidden="true">{state.board.ports.map(port => {
        const spot = portSpot(port);
        return <g key={port.id}>{port.vertices.map(id => { const v = state.board.vertices[id]; return <g key={id}>
          <line x1={v.x} y1={v.y} x2={spot.x} y2={spot.y} className="pier-edge"/><line x1={v.x} y1={v.y} x2={spot.x} y2={spot.y} className="pier-plank"/>
          <circle cx={v.x} cy={v.y} r="9" className="port-ring-edge"/><circle cx={v.x} cy={v.y} r="9" className="port-ring"/></g>; })}</g>;
      })}</svg>
      {state.board.ports.map(port => {
        const { x, y } = portSpot(port);
        return <span key={port.id} className={`port${port.type === 'any' ? ' port-any' : ''}`} style={{ left: `${x / 540 * 100}%`, top: `${y / 500 * 100}%` }} title={port.type === 'any' ? tr("ui.general_port_3_1") : tr("ui.0_port_2_1", [labels[port.type]])}>{port.type === 'any' ? <svg className="port-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2v13M12 4l7 9h-7M12 6L6 13h6M3 17c3 3 6 3 9 0 3 3 6 3 9 0v3c-3 3-6 3-9 0-3 3-6 3-9 0z"/></svg> : <img className="port-icon" src={appPath(`/game/aetherii/icon-${port.type}.webp`)} alt="" draggable={false}/>}<b>{port.type === 'any' ? '3:1' : '2:1'}</b>{port.type !== 'any' && <small>{shortLabels[port.type]}</small>}</span>;
      })}
      {state.board.edges.map(e => {
        const a = state.board.vertices[e.a], b = state.board.vertices[e.b];
        const active = mode === 'road' && legal.roads.includes(e.id);
        if (!e.owner && !active) return null;
        return <button key={e.id} className={`road-piece ${active ? 'legal-road' : ''}`} style={{ left: `${(a.x + b.x) / 2 / 540 * 100}%`, top: `${(a.y + b.y) / 2 / 500 * 100}%`, transform: `translate(-50%,-50%) rotate(${Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI}deg)`, color: color(e.owner) }} aria-label={tr("ui.trade_route_0_1", [e.id, active ? tr("ui.available_location") : ''])} disabled={!active} onClick={() => select('road', e.id)}><MinusIcon/></button>;
      })}
      {state.board.vertices.map(v => {
        const active = (mode === 'settlement' && legal.settlements.includes(v.id)) || (mode === 'city' && legal.cities.includes(v.id));
        if (!v.owner && !active) return null;
        const owner = state.players.find(p => p.id === v.owner);
        const watchtower = owner && v.level === 1;
        return <button key={v.id} className={`settlement-piece ${active ? 'legal-vertex' : ''} ${v.owner ? 'occupied' : ''} ${watchtower ? 'watchtower-piece' : ''}`} style={{ left: `${v.x / 540 * 100}%`, top: `${v.y / 500 * 100}%`, '--piece-color': color(v.owner) } as CSSProperties} aria-label={`${v.level === 2 ? tr("ui.citadel") : tr("ui.watchtower")} ${v.id}${owner ? ` · ${owner.name} · ${factions[owner.faction].name}` : ''}${active ? tr("ui.available_location") : ''}`} disabled={!active} onClick={() => select(mode || 'settlement', v.id)}>{watchtower ? <img className="watchtower-art" src={watchtowerImage(owner.faction)} alt="" draggable={false}/> : v.owner ? <LayersIcon/> : <PlusIcon/>}</button>;
      })}
    </div>
    <RaidEffects state={state} preview={preview}/>
    <div className="zoom-controls" onPointerDown={e => e.stopPropagation()}>
      <button aria-label={tr("ui.zoom_in")} onClick={() => setZoom(z => clamp(z + 0.2))}><PlusIcon/></button>
      <button aria-label={tr("ui.zoom_out")} onClick={() => setZoom(z => clamp(z - 0.2))}><MinusIcon/></button>
      <button aria-label={tr("ui.center_the_board")} onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }}><Crosshair2Icon/></button>
    </div>
    {mode && <div className="board-instruction">{mode === 'road' ? tr("ui.tap_a_highlighted_edge") : mode === 'robber' ? tr("ui.choose_a_tile_for_the_robber") : mode === 'city' ? tr("ui.choose_your_watchtower") : tr("ui.tap_an_empty_intersection")}</div>}
  </div>;
}
