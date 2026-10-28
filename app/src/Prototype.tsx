import { useCommunication } from './useCommunication';
import { appPath } from './app-path';
import { useEffect, useRef, useState, type CSSProperties, type FormEvent } from 'react';
import { CardStackIcon, CheckIcon, ChevronRightIcon, CopyIcon, Cross2Icon, HomeIcon, InfoCircledIcon, LayersIcon, MinusIcon, PlusIcon, ReloadIcon, Share2Icon, ShuffleIcon, TimerIcon } from '@radix-ui/react-icons';
import { GameSheet as BottomSheet, GameInput as KeyboardInput, GameTextarea, GameScroll as MobileScroll, useGameKeyboard as useKeyboard } from './GameShell';
import Board from './Board';
import AccountPanel, { type Account } from './AccountPanel';
import GameAlerts, { NotificationSettings } from './GameAlerts';
import RulesPanel from './RulesPanel';
import { watchtowerImage, factions, type Faction, blankBag, cardNames, cardDescriptions, costs, labels, shortLabels, resources, type Bag, type Card, type Resource, type State } from './game-types';
import './prototype.css';
import TrafficReport from './TrafficReport';
import ThemeSwitch from './ThemeSwitch';

type Panel = 'chat' | 'account' | 'invite' | 'join' | 'trade' | 'build' | 'cards' | 'history' | 'rules' | 'discard' | 'winner' | 'confirm' | 'defense' | null;
const costText = (cost: Partial<Bag>) => resources.filter(r => cost[r]).map(r => `${cost[r]} ${labels[r].toLowerCase()}`).join(' · ');
const total = (bag: Partial<Bag>) => Object.values(bag).reduce((a, b) => a + (b || 0), 0);
const partyOptions = [{ bots: 0, name: 'Tylko ludzie (2–4 osoby)' }, { bots: 3, name: '1 człowiek + 3 SI' }, { bots: 2, name: '2 ludzi + 2 SI' }, { bots: 1, name: '3 ludzi + 1 SI' }];
const names: Record<string, string> = { road: 'Trakt Handlowy', settlement: 'Strażnica', city: 'Cytadela', development: 'Karta Magii' };

function BagPicker({ value, onChange, limits, title }: { value: Bag; onChange: (v: Bag) => void; limits?: Bag; title: string }) {
  return <fieldset className="bag-picker"><legend>{title}</legend>{resources.map(r => <div key={r}><span>{labels[r]}{limits && <small> / {limits[r]}</small>}</span><button aria-label={`Odejmij: ${title}, ${labels[r]}`} disabled={!value[r]} onClick={() => onChange({ ...value, [r]: value[r] - 1 })}><MinusIcon/></button><b>{value[r]}</b><button aria-label={`Dodaj: ${title}, ${labels[r]}`} disabled={value[r] >= (limits?.[r] ?? 19)} onClick={() => onChange({ ...value, [r]: value[r] + 1 })}><PlusIcon/></button></div>)}</fieldset>;
}
// Room refresh interval; every open tab hits /api/rooms/<code> this often.
const POLL_MS = 3000;
export default function Prototype() {
  const keyboard = useKeyboard();
  const initialCode = new URLSearchParams(location.search).get('room')?.toUpperCase() || '';
  const [code, setCode] = useState(initialCode);
  const [token, setToken] = useState(() => initialCode ? localStorage.getItem(`aetherii:${initialCode}`) || '' : '');
  const [state, setState] = useState<State | null>(null), [preview, setPreview] = useState<State | null>(null);
  const [name, setName] = useState(localStorage.getItem('aetherii:name') || '');
  const [account, setAccount] = useState<Account>({ user: null, rooms: [], googleEnabled: false });
  const [faction, setFaction] = useState<Faction>('dwarves');
  const [ai, setAI] = useState(false);
  const [aiCount, setAiCount] = useState(1);
  const [boardSize, setBoardSize] = useState(19), [botCount, setBotCount] = useState(0);
  const [practice, setPractice] = useState(false), [busy, setBusy] = useState(false), [connected, setConnected] = useState(true);
  const [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [panel, setPanel] = useState<Panel>(null), [mode, setMode] = useState<string | null>(null);
  const [target, setTarget] = useState<{ type: string; id: number } | null>(null);
  const [give, setGive] = useState<Resource>('wood'), [want, setWant] = useState<Resource>('brick');
  const [offerGive, setOfferGive] = useState(blankBag), [offerWant, setOfferWant] = useState(blankBag);
  const [chosen, setChosen] = useState(blankBag), [selectedCard, setSelectedCard] = useState<Card | null>(null);
  const stateRef = useRef(state), busyRef = useRef(false);
  const [copied, setCopied] = useState(false);
  const [inviteReady,setInviteReady]=useState(false),[inviteLink,setInviteLink]=useState(''),[invitationId,setInvitationId]=useState(''),[targetAccount,setTargetAccount]=useState('');
  const [invitations,setInvitations]=useState<{id:string;expires:number;accountId:string|null}[]>([]);
  const [draft,setDraft]=useState('');
  const chatScroll=useRef<HTMLDivElement>(null);
  const [chatAtEnd,setChatAtEnd]=useState(true);

  stateRef.current = state;
  function update(next: State) { setState(old => !old || old.code !== next.code || next.revision >= old.revision ? next : old); }
  async function api(path: string, data?: unknown, auth = token) {
    const response = await fetch(appPath(path), { method: data === undefined ? 'GET' : 'POST', headers: { ...(data === undefined ? {} : { 'Content-Type': 'application/json' }), ...(auth ? { Authorization: `Bearer ${auth}` } : {}) }, body: data === undefined ? undefined : JSON.stringify(data), signal: AbortSignal.timeout(15000) });
    const result = await response.json();
    if (!response.ok) { if (result.state) update(result.state); throw new Error(result.error || 'Nie udało się połączyć.'); }
    return result;
  }
  useEffect(() => { api('/api/account', undefined, '').then(a => { setAccount(a); if (a.user) setName(a.user.name); }).catch(() => setError('Nie udało się wczytać konta. Spróbuj odświeżyć stronę.')); const result = new URLSearchParams(location.search).get('auth'); if (result) { setPanel('account'); setError(result === 'use-password' ? 'Ten e-mail ma konto z hasłem. Zaloguj się e-mailem.' : 'Logowanie Google anulowano. Możesz spróbować ponownie.'); } }, []);
  useEffect(() => { api('/api/preview', undefined, '').then(setPreview).catch(() => setError('Nie udało się wczytać planszy. Odśwież stronę.')); }, []);
  useEffect(() => {
    if (!token || !code) return;
    let stopped = false, timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try { const s = await api(`/api/rooms/${code}`, undefined, token); if (!stopped) { update(s); setConnected(true); } }
      catch (e) { if (!stopped) { setConnected(false); if (!stateRef.current) setError((e as Error).message); } }
      if (!stopped) timer = setTimeout(poll, POLL_MS);
    }
    poll(); return () => { stopped = true; clearTimeout(timer); };
  }, [token, code]);
  useEffect(() => { if (!notice) return; const id = setTimeout(() => setNotice(''), Math.min(15000, Math.max(4500, notice.length * 45))); return () => clearTimeout(id); }, [notice]);
  async function command(action: string, payload: unknown = {}, close = true) {
    if (busyRef.current || !stateRef.current) return false;
    busyRef.current = true; setBusy(true); setError('');
    try {
      const next = await api(`/api/rooms/${code}/action`, { action, payload, revision: stateRef.current.revision }); update(next);
      if (close) { setPanel(null); setTarget(null); setSelectedCard(null); }
      return true;
    } catch (e) { setError((e as Error).message); return false; }
    finally { busyRef.current = false; setBusy(false); }
  }
  async function enter(e: FormEvent, join = false) {
    e.preventDefault(); if (busyRef.current) return;
    keyboard.hide(); setError(''); setBusy(true); busyRef.current = true;
    try {
      if (join && !/^[A-Z0-9]{6}$/.test(code)) throw new Error('Kod pokoju ma 6 znaków.');
      const result = await api(join ? `/api/rooms/${code}/join` : '/api/rooms', { name, practice, ai, aiCount, faction, boardSize, botCount: ai || practice ? 0 : botCount }, '');
      localStorage.setItem(`aetherii:${result.state.code}`, result.token); localStorage.setItem('aetherii:name', name.trim());
      setCode(result.state.code); setToken(result.token); update(result.state); setPanel(null);
      history.replaceState({}, '', `?room=${result.state.code}`);
      setNotice(join ? 'Dołączono do pokoju.' : result.state.ai ? 'Gra z AI rozpoczęta. Wybierz pierwszą Strażnicę.' : 'Pokój gotowy. Zaproś znajomych!');
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); busyRef.current = false; }
  }
  function resumeAccount(result: { token: string; state: State }) {
    localStorage.setItem(`aetherii:${result.state.code}`, result.token);
    setCode(result.state.code); setToken(result.token); update(result.state); setPanel(null);
    history.replaceState({}, '', `?room=${result.state.code}`);
  }
  function refreshAccount(next: Account) { setAccount(next); if (next.user) setName(next.user.name); }
  function logoutAccount() {
    for (const key of Object.keys(localStorage)) if (key.startsWith('aetherii:') && key !== 'aetherii:name') localStorage.removeItem(key);
    setToken(''); setCode(''); setState(null); setName(''); setAccount(a => ({ ...a, user: null, rooms: [] }));
    setPanel(null); history.replaceState({}, '', location.pathname);
  }
  // Player tap: where the points come from and whether they can be lost (they cannot: only Roads and resources are at risk).
  function playerInfo(p: State['players'][number]) {
    const basics = `${p.name} · ${p.resourceCount} surowców · ${p.cardCount} Kart Magii · ${factions[p.faction]?.name}`;
    if (!state || state.phase === 'lobby') return basics;
    const owned = (level: number) => state.board.vertices.filter(v => v.owner === p.id && v.level === level).length;
    const watchtowers = owned(1), citadels = owned(2), chronicles = Math.max(0, p.points - watchtowers - 2 * citadels - p.heroPoints);
    const parts = [`Strażnice ${watchtowers} × 1`, `Cytadele ${citadels} × 2`, `Bohater Aetherii ${p.heroPoints} × 1 (największy wkład w obronie)`];
    if (chronicles) parts.push(`Kroniki Chwały ${chronicles} × 1`);
    const hidden = p.id !== state.me && state.phase !== 'finished' ? ' Ukryte Kroniki Chwały nie są wliczone.' : '';
    return `${basics}\n${p.points} PZ z 10: ${parts.join(' + ')} PZ.${hidden}\nPZ nie da się stracić: Strażnice, Cytadele i PZ Bohatera są trwałe, a najazd odbiera tylko Trakty lub surowce. Kataklizm kończy grę bez zwycięzcy.`;
  }
  // A room link that no longer works (expired, game already running, full): leave it and offer a fresh game.
  const roomUnavailable = Boolean(initialCode && !state && error);
  function newGame() {
    setError(''); setToken(''); setCode(''); setPanel(null);
    history.replaceState({}, '', location.pathname);
  }
  const open = (p: Panel) => { keyboard.hide(); setError(''); if (p === 'account') api('/api/account', undefined, '').then(refreshAccount).catch(e => setError(e.message)); setPanel(p); setChosen(blankBag()); setSelectedCard(null); };
  const s = state || preview, me = state?.players.find(p => p.id === state.me);
  const current = state?.players[state.active];
  const humans = state?.players.filter(p => !p.bot).length || 0;
  const canStart = Boolean(state && humans >= (state.botCount ? state.humanLimit : 2));
  const mine = Boolean(state && current?.id === state.me);
  const mandatory = state?.discard[state.me] ? 'discard' : null;
  useEffect(()=>{if(state?.phase==='finished'){keyboard.hide();setPanel('winner');}},[state?.code,state?.phase]);
  const visiblePanel = mandatory || panel;
  // During setup the player's only job is placing pieces: bring the board into view and give it focus.
  const setupStep = mine && (state?.phase === 'setup-settlement' || state?.phase === 'setup-road') ? state.phase : null;
  useEffect(() => {
    if (!setupStep) return;
    const board = document.querySelector<HTMLElement>('.board-viewport');
    if (!board) return;
    board.tabIndex = -1;
    board.focus({ preventScroll: true });
    board.scrollIntoView({ block: 'start', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }, [setupStep, state?.code]);
  const chat=useCommunication(state,token,visiblePanel==='chat',chatAtEnd);
  useEffect(()=>{setDraft('');setInviteLink('');},[state?.code,state?.me]);
  useEffect(()=>{if(chatAtEnd&&visiblePanel==='chat')chatScroll.current?.scrollTo({top:chatScroll.current.scrollHeight});},[chat.messages,visiblePanel,chatAtEnd]);
  useEffect(()=>{
    if(!initialCode)return;
    const secret=new URLSearchParams(location.hash.slice(1)).get('invite');
    const ready=secret?api(`/api/rooms/${initialCode}/invitation-context`,{secret},''):api(`/api/rooms/${initialCode}/invitation-context`,undefined,'');
    ready.then(b=>{setInviteReady(secret?true:b.ready);if(secret)history.replaceState({},'',location.pathname+location.search);}).catch(e=>setError(e.message));
  },[]);
  const effectiveMode = mine ? state?.phase === 'setup-settlement' ? 'settlement' : state?.phase === 'setup-road' || state?.phase === 'free-roads' ? 'road' : state?.phase === 'main' ? mode : null : null;
  const link = `${location.origin}${location.pathname}?room=${state?.code || code}`;
  const canAfford = (kind: string) => me?.resources && Object.entries(costs[kind]).every(([r, n]) => me.resources![r as Resource] >= n!);
  const phaseText = !state ? 'Aetheria wzywa' : state.phase === 'lobby' ? 'Zbierz obrońców krainy' : state.phase === 'finished' ? state.cataclysm ? 'Aetheria upadła' : 'Aetheria ma bohatera!'  : mine ? state.phase.startsWith('setup') ? 'Wybierz swoje miejsce' : state.phase === 'roll' ? state.bonusRoll ? 'Dublet! Rzuć ponownie' : 'Twoja tura' : state.phase === 'main' ? 'Handluj i buduj' : state.phase === 'free-roads' ? 'Zbuduj darmowe Trakty' : 'Mobilizuj obronę' : `Teraz gra ${current?.name}`;
  const hint = !state ? ai ? `Ty i ${aiCount} ${aiCount === 1 ? 'komputer' : 'komputery'} · wspólna obrona, własna droga do chwały.` : 'Zaproś znajomych. Zbudujcie własną historię.' : state.phase === 'lobby' ? `${humans}/${state.humanLimit} osób · Mniej 7 · ${state.botCount} SI · ${state.boardSize} heksów` : state.phase === 'discard' ? 'Czekamy, aż gracze odrzucą nadmiar kart.' : !mine ? current?.bot ? 'AI planuje swój ruch. Za chwilę Twoja kolej.' : 'Obserwuj planszę i planuj kolejny ruch.' : state.phase === 'setup-settlement' ? 'Wybierz podświetlone skrzyżowanie na planszy.' : state.phase === 'setup-road' ? 'Połącz nową Strażnicę z pierwszym Traktem.' : state.phase === 'roll' ? state.bonusRoll ? 'Dokończ serię rzutów. Każdy dublet daje kolejny rzut i normalną produkcję.' : 'Rzuć kośćmi, aby zebrać surowce.' : state.phase === 'main' ? state.built ? 'Buduj dalej lub zakończ turę.' : 'Wymieniaj surowce, a potem rozpocznij budowę.' : state.phase === 'free-roads' ? `Pozostało Traktów: ${state.freeRoads}. Wybierz krawędź.` : '';
  async function loadInvitations(){try{const result=await api(`/api/rooms/${state!.code}/invitations`);setInvitations(result.invitations);}catch(e){setError((e as Error).message);}}
  useEffect(()=>{if(visiblePanel==='invite'&&state?.host===state?.me)void loadInvitations();},[visiblePanel,state?.code]);
  async function generateInvitation() {
    setError('');try {const i=await api(`/api/rooms/${state!.code}/invitations`,targetAccount.trim()?{accountId:targetAccount.trim()}:{});const result=`${link}#invite=${i.secret}`;setInviteLink(result);setInvitationId(i.id);setCopied(false);void loadInvitations();return result;}catch(e){setError((e as Error).message);return '';}
  }
  async function copyLink() {
    try { await navigator.clipboard.writeText(inviteLink); setCopied(true); setTimeout(() => setCopied(false), 3000); } catch { setNotice('Zaznacz i skopiuj link poniżej.'); }
  }
  async function share() { open('invite'); }
  const title = { chat: 'Rozmowa drużyny', defense: 'Wspólna Pula Obrony', account: 'Konto gracza', invite: 'Zaproś do Aetherii', join: 'Dołącz do znajomych', trade: 'Przystań handlowa', build: 'Rozbuduj krainę', cards: 'Twoje Karty Magii', history: 'Dziennik wyprawy', rules: 'Jak grać', discard: 'Oddaj część surowców', winner: 'Koniec wyprawy', confirm: target ? `Budujesz: ${names[target.type] || 'budowla'}` : 'Potwierdź ruch' };
  const resourceChoice = (val: Resource, change: (r: Resource) => void, text: string) => <label className="select-label">{text}<select value={val} onChange={e => change(e.target.value as Resource)}>{resources.map(r => <option key={r} value={r}>{labels[r]}</option>)}</select></label>;
  const factionPicker = <fieldset className="faction-picker"><legend>Twoja frakcja</legend>{(Object.entries(factions) as [Faction, typeof factions[Faction]][]).map(([id, f]) => <label key={id} className="faction-card" data-faction={id}><input type="radio" name="faction" value={id} checked={faction === id} onChange={() => setFaction(id)}/><span className="faction-art"><img src={watchtowerImage(id)} alt="" draggable={false}/></span><span className="faction-text"><strong>{f.name}</strong><small>{f.description}</small></span><span className="faction-check" aria-hidden="true"/></label>)}</fieldset>;
  const errorBox = error && <div role="alert" className="error-message">{error}<button aria-label="Zamknij komunikat" onClick={() => setError('')}><Cross2Icon/></button></div>;
  return <>
    <MobileScroll className="aetherii-scroll">
      <main className={`aetherii-game ${state ? 'is-playing' : 'is-landing'}${state?.ai ? ' is-ai' : ''}`} aria-label="Kroniki Aetherii — Korona i Cień">
        <div className="account-bar"><span>{account.user ? `Witaj, ${account.user.name}` : 'Graj jako gość lub zapisz grę na koncie'}</span><button className="text-button" onClick={() => open('account')}>{account.user ? 'Moje konto' : 'Zaloguj / załóż konto'}</button><ThemeSwitch/></div>
        <TrafficReport/>
        <header className="game-header"><div className="brand"><h1>Kroniki Aetherii</h1><span>KORONA I CIEŃ</span></div><div className="room-tools">{state?.ai ? <button className="room-code" aria-label="Dziennik gry z AI" onClick={() => open('history')}>Ty + {state.botCount} SI<TimerIcon/></button> : state ? <><button className="room-code" aria-label="Kod pokoju i link zaproszenia" onClick={() => open('invite')}>{state.code}<CopyIcon/></button><button className="share-button" aria-label="Udostępnij grę" onClick={share}><Share2Icon/></button></> : <button className="share-button" aria-label="Zasady gry" onClick={() => open('rules')}><InfoCircledIcon/></button>}</div></header>
        <section className="players" aria-label="Gracze">{(state?.players || preview?.players || []).map(p => <button className={`player ${state && current?.id === p.id && state.phase !== 'lobby' ? 'active-player' : ''}`} key={p.id} onClick={() => setNotice(playerInfo(p))}><span className="player-crest" style={{ '--piece-color': p.color } as CSSProperties}><img src={watchtowerImage(p.faction)} alt={`Strażnica: ${factions[p.faction].name}`} draggable={false}/></span><span><strong>{p.name} {p.bot ? <small>(AI)</small> : state && p.id === state.me && <small>(Ty)</small>}</strong><small className="player-faction">{factions[p.faction]?.name}</small><b>{p.points} <small>PZ</small></b></span></button>)}{state?.phase === 'lobby' && <>{Array.from({ length: Math.max(0, state.humanLimit - humans) }, (_, i) => <button key={i} className="player vacant-player" onClick={() => open('invite')}><PlusIcon/><span>Zaproś</span></button>)}{Array.from({ length: state.botCount }, (_, i) => <div key={`bot-${i}`} className="player bot-seat"><span><strong>SI {i + 1}</strong><small>Dołączy przy starcie</small></span></div>)}</>}</section>
        {state && !state.ai && <div className="communication-entry"><button className="secondary" onClick={()=>open('chat')}>Komunikacja{chat.unread>0?` (${chat.unread})`:''}</button>{chat.joined&&<span role="status">Rozmowa trwa · {chat.mic?'Mic włączony':'Mic wyłączony'} <button className="text-button" onClick={chat.leave}>Opuść</button></span>}</div>}
        {!connected && token && <p className="connection-message" role="status"><ReloadIcon/> Ponawiam połączenie…</p>}
        {s ? <Board state={s} preview={!state} mode={effectiveMode} choose={(type, id) => { if (busy) return; setTarget({ type, id }); open('confirm'); }}/> : <div className="board-loading"><ReloadIcon/> Przygotowuję wyspę…</div>}
        <section className="turn-panel" aria-label="Twoje akcje">
          <h2>{phaseText}</h2><p>{hint}</p>
          {state && !['lobby'].includes(state.phase) && <section className={`realm-defense ${state.raid ? 'raid-active' : ''}`} aria-label="Obrona Aetherii"><div className="threat-heading"><strong>{state.raid ? 'Najazd na Aetherię' : 'Zagrożenie Krainy'}</strong><b>{state.threat}%</b></div><progress max={100} value={state.threat} aria-label="Zagrożenie Krainy"/>{state.raid ? <><p>Pancerz <strong>{Object.values(state.raid.contributions).reduce((n, c) => n + c.armor, 0)} / {state.players.length * 3}</strong> · bitwa za {Math.max(1, state.raid.dueTurn - state.turn + 1)} tur graczy</p><button className="secondary" onClick={() => open('defense')}>Mobilizacja i wkłady</button></> : <p>Każda siódemka przybliża najazd.</p>}{state.penaltyTurns > 0 && <p className="defense-warning">Kara produkcji: −1 surowiec · pozostało tur: {state.penaltyTurns}</p>}{state.lastBattle && <small>Ostatnia bitwa: {state.lastBattle.won ? 'obrona zwyciężyła' : 'porażka'} ({state.lastBattle.strength}/{state.lastBattle.required})</small>}</section>}
          {state?.dice && <div className="dice-result" aria-label={`Rzut: ${state.dice.join(' i ')}`}><b>{state.dice[0]}</b><b>{state.dice[1]}</b><span>Wynik: {state.dice[0] + state.dice[1]}</span></div>}
          {state?.lastRoll && <div className="roll-gains" role="status"><small>Ostatni rzut: {state.lastRoll.player} · {state.lastRoll.dice.reduce((a, b) => a + b, 0)} </small><p>{total(state.lastRoll.resources) ? `Zdobyte surowce: ${costText(state.lastRoll.resources)}.` : 'Ten rzut nie przyniósł Ci żadnych surowców.'}</p></div>}
          {state && state.phase !== 'lobby' && <div className="resources" aria-label="Twoje surowce">{resources.map(r => <div key={r}><img src={appPath(`/game/aetherii/icon-${r}.webp`)} alt=""/><b>{me?.resources?.[r] || 0}</b><span title={labels[r]}>{shortLabels[r]}</span></div>)}</div>}
          {!state && <form className="entry-form" onSubmit={e => enter(e, Boolean(initialCode))}><label htmlFor="player-name">Twoje imię</label><KeyboardInput id="player-name" maxLength={24} placeholder="Jak Cię nazywać?" autoComplete="nickname" value={name} onChange={e => setName(e.target.value)}/>{!initialCode && <label className="select-label">Tryb rozgrywki<select value={ai ? 'ai' : practice ? 'practice' : 'friends'} onChange={e => { setAI(e.target.value === 'ai'); setPractice(e.target.value === 'practice'); }}><option value="friends">Ze znajomymi (2–4 graczy)</option><option value="ai">Z AI (Ty + 1–3 komputery)</option><option value="practice">Szybka gra we dwoje</option></select></label>}{!initialCode && ai && <label className="select-label">Przeciwnicy SI<select value={aiCount} onChange={e => setAiCount(Number(e.target.value))}>{[1, 2, 3].map(n => <option key={n} value={n}>{n} {n === 1 ? 'komputer' : 'komputery'}</option>)}</select></label>}{!initialCode && <><label className="select-label">Wielkość planszy<select value={boardSize} onChange={e => setBoardSize(Number(e.target.value))}>{[19, 23, 25].map(n => <option key={n} value={n}>{n} heksów</option>)}</select></label>{!ai && !practice && <label className="select-label">Obsada pokoju<select value={botCount} onChange={e => setBotCount(Number(e.target.value))}>{partyOptions.map(o => <option key={o.bots} value={o.bots}>{o.name}</option>)}</select></label>}</>}{factionPicker}<button className="primary" disabled={busy || !name.trim() || Boolean(initialCode && !inviteReady)} type="submit">{busy ? 'Przygotowuję pokój…' : initialCode ? `Dołącz do pokoju ${initialCode}` : ai ? 'Zagraj z AI' : 'Stwórz pokój'}</button>{!initialCode && <button className="text-button" type="button" onClick={() => open('join')}>Mam link lub kod pokoju <Chevron/></button>}</form>}
          {state?.phase === 'lobby' && <div className="lobby-actions">{state.host === state.me ? <><label className="select-label">Wielkość planszy<select value={state.boardSize} disabled={busy} onChange={e => command('configure', { boardSize: Number(e.target.value) }, false)}>{[19, 23, 25].map(n => <option key={n} value={n}>{n} heksów</option>)}</select></label><label className="select-label">Obsada pokoju<select value={state.botCount} disabled={busy} onChange={e => command('configure', { botCount: Number(e.target.value) }, false)}>{partyOptions.map(o => <option key={o.bots} value={o.bots} disabled={humans > 4 - o.bots}>{o.name}</option>)}</select></label></> : <p>Plansza: {state.boardSize} heksów · {state.botCount} SI. Ustawienia wybiera gospodarz.</p>}<label className="select-label">Twoja frakcja<select value={me?.faction} disabled={busy} onChange={e => command('faction', { faction: e.target.value }, false)}>{Object.entries(factions).map(([id, f]) => <option key={id} value={id} disabled={state.players.some(p => p.id !== state.me && p.faction === id)}>{f.name}</option>)}</select><small>{me && factions[me.faction].description}</small></label>{humans < state.humanLimit && <button className="primary" onClick={() => open('invite')}><Share2Icon/>Zaproś znajomych</button>}{state.host === state.me ? <button className="secondary" disabled={busy || !canStart} onClick={() => command('start')}>Rozpocznij grę ({state.players.length + state.botCount}/{state.maxPlayers})</button> : <p>Gospodarz rozpocznie grę, gdy wszyscy dołączą.</p>}<span className="subtle">{state.botCount ? `Do startu potrzeba ${state.humanLimit} osób. SI zajmie pozostałe miejsca i otrzyma wolne frakcje.` : 'Link zaprasza do tego samego pokoju.'}</span></div>}
          {state && mine && state.phase === 'roll' && <button className="primary" disabled={busy || !connected} onClick={() => command('roll')}><ShuffleIcon/>{busy ? 'Rzucam…' : state.bonusRoll ? 'Rzuć ponownie' : 'Rzuć kośćmi'}</button>}
          {state && mine && state.phase === 'main' && <div className="main-actions"><button className="primary" disabled={busy} onClick={() => { if (mode) setMode(null); else open('build'); }}><HomeIcon/>{mode ? 'Anuluj wybór miejsca' : 'Buduj w Aetherii'}</button><button className="text-button" disabled={busy} onClick={() => { setMode(null); command('end'); }}>Zakończ turę <Chevron/></button></div>}
          {state && mine && effectiveMode && state.phase !== 'main' && <p className="action-nudge">{effectiveMode === 'road' ? 'Trakt' : 'Strażnica'} · wybierz miejsce na planszy</p>}
          {state && !mine && state.offers.some(o => !o.to || o.to === state.me) && <button className="secondary" onClick={() => open('trade')}>Nowa propozycja handlu</button>}
          {state?.phase === 'finished' && <button className="primary" onClick={() => open('winner')}>Zobacz wyniki</button>}
          {state && <NotificationSettings/>}
          {errorBox && !visiblePanel && errorBox}
          {roomUnavailable && !visiblePanel && <button className="primary" type="button" onClick={newGame}>Zacznij nową grę</button>}
        </section>
      </main>
    </MobileScroll>
    <GameAlerts state={state} trade={() => open('trade')}/>
    <nav className="game-nav" aria-label="Menu gry"><button className={!panel ? 'selected' : ''} onClick={() => { setPanel(null); setMode(null); }}><LayersIcon/><span>Plansza</span></button><button className={panel === 'trade' ? 'selected' : ''} disabled={!state || state.phase === 'lobby'} onClick={() => open('trade')}><ShuffleIcon/><span>Handel</span></button><button className={panel === 'build' ? 'selected' : ''} disabled={!state || state.phase === 'lobby'} onClick={() => open('build')}><HomeIcon/><span>Budowa</span></button><button className={panel === 'cards' ? 'selected' : ''} disabled={!state || state.phase === 'lobby'} onClick={() => open('cards')}><CardStackIcon/><span>Karty</span></button><button onClick={() => open(state ? 'history' : 'rules')}><TimerIcon/><span>{state ? 'Dziennik' : 'Zasady'}</span></button></nav>
    {notice && <div className="toast" role="status">{notice}</div>}
    <BottomSheet open={Boolean(visiblePanel)} onOpenChange={v => { if (!v && !mandatory) { setPanel(null); setError(''); } }} title={title[visiblePanel || 'rules']} snap={visiblePanel === 'trade' ? 0.9 : 0.78}>
      <div className={`game-sheet${visiblePanel === 'trade' ? ' trade-sheet' : ''}`}>
        {!mandatory && <button className="sheet-close" aria-label="Zamknij panel" onClick={() => { setPanel(null); setError(''); }}><Cross2Icon/></button>}
        {visiblePanel === 'chat' && state && <section className="communication-panel" aria-label="Prywatna komunikacja">
          <p className="chat-privacy">Tylko uczestnicy tej gry · wiadomości przechowywane 30 dni.</p>
          {!state.communication?.approved&&<p>Gospodarz musi potwierdzić obecny skład graczy przed otwarciem rozmowy.</p>}
          {state.host===state.me&&<details className="chat-settings"><summary>Ustawienia gospodarza</summary>{!state.communication?.approved&&<button className="secondary" onClick={()=>chat.settings({approved:true})}>Potwierdzam skład — otwórz komunikację</button>}<button className="secondary" onClick={()=>chat.settings({closed:!state.communication?.closed})}>{state.communication?.closed?'Otwórz rozmowę':'Zamknij rozmowę'}</button><button className="secondary" onClick={()=>{if(window.confirm('Usunąć całą historię rozmowy tej gry?'))void chat.settings({clear:true});}}>Wyczyść historię</button>{state.players.filter(p=>!p.bot&&p.id!==state.me).map(p=><div key={p.id}><span>{p.name}</span><button className="text-button" onClick={()=>chat.settings({playerId:p.id,blocked:true})}>Odbierz dostęp</button><button className="text-button" onClick={()=>chat.settings({playerId:p.id,blocked:false})}>Przywróć dostęp</button></div>)}</details>}
          {state.communication?.enabled?<>
          <p role="status">{chat.online?'Połączono z rozmową':'Łączenie z rozmową…'}{state.communication.closed?' · Rozmowa zamknięta':''}</p>
          <section className="voice-controls" aria-label="Rozmowa głosowa"><h3>Głos drużyny</h3>{!state.communication.voice?<p>Głos będzie dostępny po skonfigurowaniu serwera TURN.</p>:!chat.joined?<button className="secondary" disabled={!chat.online||chat.joining||state.communication.closed} onClick={chat.join}>{chat.joining?'Dołączanie…':'Dołącz do rozmowy głosowej'}</button>:<>
          <label className="select-label">Mikrofon<select value={chat.device} onChange={e=>void chat.selectDevice(e.target.value)}><option value="">Domyślny mikrofon</option>{chat.devices.filter(d=>d.deviceId!=='default').map((d,i)=><option value={d.deviceId} key={d.deviceId}>{d.label||`Mikrofon ${i+1}`}</option>)}</select></label><div className="mic-actions"><button className={`mic-button ${chat.mic?'is-live':''}`} disabled={chat.continuous} data-scroll-drag="ignore" onPointerDown={e=>{if(e.button!==0)return;e.preventDefault();e.currentTarget.setPointerCapture(e.pointerId);chat.press();}} onPointerUp={chat.release} onPointerCancel={chat.release} onLostPointerCapture={chat.release} onKeyDown={e=>{if((e.key===' '||e.key==='Enter')&&!e.repeat){e.preventDefault();chat.press();}}} onKeyUp={e=>{if(e.key===' '||e.key==='Enter'){e.preventDefault();chat.release();}}} onBlur={chat.release}>Mic — przytrzymaj i mów</button><button className="secondary" aria-pressed={chat.continuous} onClick={chat.toggleContinuous}>{chat.continuous?'Wyłącz mikrofon stały':'Mikrofon na stałe'}</button></div><p role="status">{chat.mic?'Nadajesz — mikrofon włączony':'Nie nadajesz'}</p><button className="text-button" onClick={chat.resume}>Wznów dźwięk</button><button className="text-button" onClick={chat.leave}>Opuść głos</button></>}
          <ul className="voice-members">{state.players.filter(p=>!p.bot).map(p=><li key={p.id}><span><strong>{p.name}{p.id===state.me?' (Ty)':''}</strong><small>{chat.speaking.includes(p.id)?'Mówi · ':''}{chat.presence.some(x=>x.playerId===p.id&&x.voice)?chat.presence.some(x=>x.playerId===p.id&&x.mic)?'Mikrofon włączony':'W rozmowie · Mic wyłączony':chat.presence.some(x=>x.playerId===p.id)?'Online':'Offline'}{chat.muted.includes(p.id)?' · Wyciszony dla Ciebie':''}</small></span>{p.id!==state.me&&<button className="text-button" aria-pressed={chat.muted.includes(p.id)} onClick={()=>chat.mute(p.id)}>{chat.muted.includes(p.id)?'Przywróć dźwięk':'Wycisz dla mnie'}</button>}</li>)}</ul></section>
          <div ref={chatScroll} className="chat-messages" tabIndex={0} aria-label="Wiadomości" onScroll={e=>{const el=e.currentTarget;setChatAtEnd(el.scrollHeight-el.scrollTop-el.clientHeight<40);}}>{chat.more&&<button className="text-button" onClick={chat.older}>Starsze wiadomości</button>}{!chat.messages.length&&<p>Tu zaczyna się Wasza rozmowa.</p>}{chat.messages.map(m=><article key={m.id} className={m.playerId===state.me?'chat-own':''}><div><strong>{state.players.find(p=>p.id===m.playerId)?.name||'Gracz'}</strong><time dateTime={new Date(m.createdAt).toISOString()}>{new Date(m.createdAt).toLocaleTimeString('pl-PL',{hour:'2-digit',minute:'2-digit'})}</time></div><p>{m.text}</p></article>)}{chat.pending.map(m=><article key={m.clientMessageId} className="chat-pending"><p>{m.text}</p><small>{m.failed?'Nie wysłano':'Wysyłanie…'}</small>{m.failed&&<button className="text-button" disabled={!chat.online} onClick={()=>chat.retry(m.clientMessageId)}>Ponów</button>}</article>)}</div>
          <span className="chat-announcement" role="status">{chat.unread?`${chat.unread} nowych wiadomości`:''}</span>
          <form className="chat-composer" onSubmit={e=>{e.preventDefault();if(chat.submit(draft))setDraft('');}}><label htmlFor="chat-message">Wiadomość do drużyny</label><GameTextarea id="chat-message" rows={3} maxLength={2000} value={draft} onChange={e=>setDraft(e.target.value)} placeholder="Napisz wiadomość…" onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.nativeEvent.isComposing){e.preventDefault();if(chat.submit(draft))setDraft('');}}}/><button className="primary" disabled={!chat.online||!draft.trim()||state.communication.closed}>Wyślij</button></form>
          </>:state.communication?.approved&&<p>Dostęp do komunikacji został wyłączony.</p>}
          {chat.error&&<p role="alert" className="error-message">{chat.error}<button className="text-button" onClick={()=>chat.setError('')}>Zamknij</button></p>}
        </section>}
        {visiblePanel === 'account' && account.user && <label className="select-label">Twój identyfikator konta do zaproszeń<KeyboardInput readOnly value={account.user.id} onFocus={e=>e.target.select()}/></label>}
        {visiblePanel === 'account' && <AccountPanel account={account} refresh={refreshAccount} api={api} state={state} token={token} roomCode={state?.code || code} resume={resumeAccount} logout={logoutAccount}/>}
        {visiblePanel === 'invite' && <><p>Zaproszenie jest jednorazowe, ważne 24 godziny. Sam kod pokoju nie pozwala dołączyć.</p><div className="invite-code">{state?.code}</div>{state?.host===state?.me?<><label className="select-label">Identyfikator konta zapraszanego (opcjonalnie)<KeyboardInput value={targetAccount} onChange={e=>setTargetAccount(e.target.value)} placeholder="Puste — zaproszenie dla gościa lub konta"/></label><button className="primary" onClick={generateInvitation}>Utwórz nowe zaproszenie</button>{inviteLink&&<><label className="select-label">Prywatny link zaproszenia<KeyboardInput readOnly value={inviteLink} onFocus={e=>e.target.select()}/></label><button className="primary" onClick={copyLink}>{copied?'Skopiowano':'Kopiuj zaproszenie'}</button><button className="secondary" onClick={async()=>{try{await api(`/api/rooms/${state!.code}/invitations`,{revoke:invitationId});setInviteLink('');void loadInvitations();}catch(e){setError((e as Error).message);}}}>Unieważnij to zaproszenie</button></>}{invitations.length>0&&<details><summary>Aktywne zaproszenia ({invitations.length})</summary>{invitations.map(i=><div key={i.id}><small>{i.accountId?'Dla wskazanego konta':'Dla posiadacza linku'} · do {new Date(i.expires).toLocaleString('pl-PL')}</small><button className="text-button" onClick={async()=>{try{await api(`/api/rooms/${state!.code}/invitations`,{revoke:i.id});if(i.id===invitationId)setInviteLink('');void loadInvitations();}catch(e){setError((e as Error).message);}}}>Unieważnij</button></div>)}</details>}</>:<p>Poproś gospodarza o wygenerowanie prywatnego zaproszenia.</p>}</>}
        {visiblePanel === 'join' && <form className="entry-form" onSubmit={e => enter(e, true)}><p>Nowy gracz potrzebuje prywatnego linku od gospodarza. Kod służy do wskazania gry.</p><label htmlFor="join-code">Kod pokoju</label><KeyboardInput id="join-code" value={code} maxLength={6} autoCapitalize="characters" onChange={e => setCode(e.target.value.replace(/[^a-z0-9]/gi, '').toUpperCase())} placeholder="np. A12B3C"/><label htmlFor="join-name">Twoje imię</label><KeyboardInput id="join-name" maxLength={24} value={name} onChange={e => setName(e.target.value)} autoComplete="nickname"/>{factionPicker}<button className="primary" disabled={busy || !name.trim() || code.length !== 6}>Dołącz do gry</button></form>}
        {visiblePanel === 'defense' && state && <><p>{state.raid ? `Bitwa na koniec tury ${state.raid.dueTurn}. Potrzeba ${state.players.length * 3} Pancerza.` : 'Kraina jest spokojna. Mobilizacja zacznie się przy wyniku 7.'}</p>{state.players.map(p => <div className="defense-row" key={p.id}><span><strong>{p.name}</strong><small>{factions[p.faction].name}</small></span><b>{state.raid?.contributions[p.id]?.armor || 0} Pancerza</b></div>)}{me && <p>{factions[me.faction].description}</p>}{state.raid && mine && state.phase === 'main' && !state.built ? <><BagPicker title="Wpłata do obrony" value={chosen} onChange={setChosen} limits={Object.fromEntries(resources.map(r => [r, Math.max(0, (me?.resources?.[r] || 0) - (me?.lockedReward?.[r] || 0))])) as Bag}/><p>Wpłata daje {total(chosen) + (me?.faction === 'dwarves' ? chosen.ore : 0)} Pancerza. Nie można jej cofnąć.</p>{me?.faction === 'humans' && !state.raid.contributions[state.me].rewarded && resourceChoice(want, setWant, 'Darmowy surowiec za pierwszą wpłatę')}<button className="primary" disabled={busy || !total(chosen)} onClick={async () => { if (await command('contribute', { resources: chosen, reward: want }, false)) setChosen(blankBag()); }}>Wesprzyj obronę</button>{me?.faction === 'rock-elves' && <button className="secondary" disabled={busy || state.raid.delayed} onClick={() => command('delay', {}, false)}>Kamienne Echo · opóźnij o 1 turę</button>}</> : state.raid && <p className="subtle">Wpłacisz surowce po rzucie w swojej turze, przed rozpoczęciem budowy.</p>}</>}
        {visiblePanel === 'build' && <><p>Po rozpoczęciu budowy handel w tej turze się kończy.</p><div className="build-options">{Object.entries(costs).map(([kind, cost]) => <button key={kind} className="build-option" disabled={!mine || state?.phase !== 'main' || busy || !canAfford(kind) || (kind === 'development' ? !state.deckCount : kind === 'road' ? !state.legal.roads.length : kind === 'city' ? !state.legal.cities.length : !state.legal.settlements.length)} onClick={() => { if (kind === 'development') command('buy'); else { setMode(kind); setPanel(null); } }}><span className="build-icon">{kind === 'city' ? <LayersIcon/> : kind === 'development' ? <CardStackIcon/> : kind === 'road' ? <MinusIcon/> : <HomeIcon/>}</span><span><strong>{names[kind]}</strong><small>{costText(cost)}</small>{(!mine || state?.phase !== 'main' || !canAfford(kind) || (kind === 'development' ? !state.deckCount : kind === 'road' ? !state.legal.roads.length : kind === 'city' ? !state.legal.cities.length : !state.legal.settlements.length)) && <small className="build-reason">{!mine || state?.phase !== 'main' ? 'Dostępne po rzucie w Twojej turze' : !canAfford(kind) ? 'Brakuje surowców' : kind === 'development' ? 'Talia jest pusta' : 'Brak legalnego miejsca lub limit budowli'}</small>}</span><Chevron/></button>)}</div>{(!mine || state?.phase !== 'main') && <p className="subtle">Budowa jest dostępna po rzucie kośćmi w Twojej turze.</p>}</>}
        {visiblePanel === 'confirm' && target && <><p>{state?.phase.startsWith('setup') || state?.phase === 'free-roads' ? 'Ta budowa nie kosztuje surowców.' : `Koszt: ${costText(costs[target.type])}`}</p><p>Potwierdź wybrane miejsce na planszy.</p><button className="primary" disabled={busy} onClick={async () => { if (await command('build', target)) setMode(null); }}>Potwierdź budowę</button><button className="secondary" onClick={() => setPanel(null)}>Wybierz inne miejsce</button></>}
        {visiblePanel === 'trade' && state && <><h3>Bank i porty</h3><p>Wymiana {state.rates[give]}:1 · w banku: {state.bank[want]} {labels[want].toLowerCase()}</p><div className="trade-selects">{resourceChoice(give, setGive, 'Oddajesz')}{resourceChoice(want, setWant, 'Otrzymujesz')}</div><button className="secondary" disabled={!mine || state.phase !== 'main' || state.built || busy || give === want || !me?.resources || me.resources[give] < state.rates[give] || !state.bank[want]} onClick={() => command('bank', { give, want }, false)}>Wymień {state.rates[give]} za 1</button><h3>Handel z graczami</h3>{state.offers.map(o => <div className="trade-offer" key={o.id}><strong>{state.players.find(p => p.id === o.from)?.name} proponuje</strong><p>Oddaje: {costText(o.give)}</p><p>Chce: {costText(o.want)}</p>{o.from === state.me ? <button className="secondary" disabled={busy} onClick={() => command('cancel-offer')}>Wycofaj ofertę</button> : (!o.to || o.to === state.me) && <button className="primary" disabled={busy || !me?.resources || !resources.every(r => me.resources![r] >= o.want[r])} onClick={() => command('accept', { id: o.id })}>Przyjmij ofertę</button>}</div>)}{mine && state.phase === 'main' && !state.built ? <><BagPicker title="Oferujesz" value={offerGive} onChange={setOfferGive} limits={me?.resources}/><BagPicker title="Chcesz otrzymać" value={offerWant} onChange={setOfferWant}/><button className="primary" disabled={busy || !total(offerGive) || !total(offerWant)} onClick={() => command('offer', { give: offerGive, want: offerWant }, false)}>Zaproponuj wymianę wszystkim</button></> : <p className="subtle">Ofertę składa aktywny gracz przed rozpoczęciem budowy. Pozostali mogą ją przyjąć.</p>}</>}
        {visiblePanel === 'cards' && state && <><p>Jedna karta na turę. Nową zagrasz od następnej własnej tury. Punkty zwycięstwa liczą się od razu.</p><span className="subtle">W talii: {state.deckCount}</span><details className="card-guide"><summary>Opisy wszystkich Kart Magii</summary>{Object.entries(cardDescriptions).map(([type, description]) => <div key={type}><h3>{cardNames[type]}</h3><p>{description}</p></div>)}</details>{!me?.cards?.length && <div className="empty-state"><CardStackIcon/><h3>Twoja historia dopiero się zaczyna</h3><p>Kup kartę w zakładce Budowa: 1 Eteryczne Zioła, 1 Zapasy i 1 Mitril.</p></div>}{me?.cards?.map(c => <button key={c.id} className={`development-card ${selectedCard?.id === c.id ? 'chosen-card' : ''}`} disabled={busy || c.type === 'point' || !mine || state.phase !== 'main' || (c.type === 'ward' && (!state.raid || state.built)) || state.playedCard || c.bought >= state.turn} onClick={() => { setSelectedCard(c); setChosen(blankBag()); }}><CardStackIcon/><span><strong>{cardNames[c.type]}</strong><span className="card-description">{cardDescriptions[c.type]}</span><small>{c.type === 'point' ? '+1 punkt (ukryty przed innymi)' : c.bought >= state.turn ? 'Dostępna od następnej tury' : 'Wybierz, aby zagrać'}</small></span></button>)}{selectedCard && <><h3>{cardNames[selectedCard.type]}</h3><p>{cardDescriptions[selectedCard.type]}</p>{selectedCard.type === 'plenty' && <BagPicker title="Wybierz surowce" value={chosen} onChange={setChosen} limits={state.bank}/>} {selectedCard.type === 'monopoly' && resourceChoice(want, setWant, 'Zabierz wszystkim ten surowiec')}{selectedCard.type === 'roads' && <p>Zbudujesz dwa połączone z Twoją siecią Trakty bez opłat.</p>}{selectedCard.type === 'ward' && <p>Dodasz 2 Pancerza do własnego wkładu w obronę.</p>}<button className="primary" disabled={busy || (selectedCard.type === 'plenty' && total(chosen) !== Math.min(2, total(state.bank)))} onClick={() => command('play', { id: selectedCard.id, resource: want, resources: chosen })}>Zagraj kartę</button></>}</>}
        {visiblePanel === 'discard' && state && <><p>Wypadło 7. Masz więcej niż 7 surowców, więc wybierz dokładnie <strong>{state.discard[state.me]}</strong> kart do zwrotu.</p><BagPicker title="Oddajesz do banku" value={chosen} onChange={setChosen} limits={me?.resources}/><p>Wybrano {total(chosen)} z {state.discard[state.me]}</p><button className="primary" disabled={busy || total(chosen) !== state.discard[state.me]} onClick={() => command('discard', { resources: chosen })}>Oddaj wybrane surowce</button></>}
        {visiblePanel === 'history' && <><button className="text-button" onClick={() => open('rules')}><InfoCircledIcon/>Zasady i koszty budowy</button><ol className="game-log">{state?.log.map((entry, i) => <li key={i}><small>{entry.turn ? `Tura ${entry.turn}` : 'Rozstawianie'}</small><span>{entry.text}</span></li>)}</ol>{!state?.log.length && <p>Wyprawa zacznie się, gdy gospodarz uruchomi grę.</p>}</>}
        {visiblePanel === 'rules' && <RulesPanel/>}
        {visiblePanel === 'winner' && state && <><div className="winner-heading"><h2>{state.cataclysm ? 'Kataklizm — wszyscy przegrywają' : `${state.players.find(p => p.id === state.winner)?.name} wygrywa!`}</h2><p>{state.cataclysm ? 'Kraina upadła pod naporem Cienia.' : 'Kroniki zapamiętają tę historię.'}</p></div>{[...state.players].sort((a, b) => b.points - a.points).map(p => <div key={p.id} className="result-row"><span>{p.name}</span><b>{p.points} pkt</b></div>)}<button className="primary" onClick={() => location.assign(location.pathname)}>Nowa wyprawa</button></>}
        {visiblePanel && errorBox}
      </div>
    </BottomSheet>
  </>;
}
function Chevron() { return <ChevronRightIcon aria-hidden="true"/>; }
