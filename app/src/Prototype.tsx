import { useEffect, useRef, useState, type FormEvent } from 'react';
import { BackpackIcon, CardStackIcon, CheckIcon, ChevronRightIcon, CopyIcon, Cross2Icon, DrawingPinIcon, HomeIcon, InfoCircledIcon, LayersIcon, MinusIcon, PlusIcon, ReloadIcon, Share2Icon, ShuffleIcon, TimerIcon } from '@radix-ui/react-icons';
import { GameSheet as BottomSheet, GameInput as KeyboardInput, GameScroll as MobileScroll, useGameKeyboard as useKeyboard } from './GameShell';
import Board from './Board';
import AccountPanel, { type Account } from './AccountPanel';
import GameAlerts, { NotificationSettings } from './GameAlerts';
import { blankBag, cardNames, cardDescriptions, costs, labels, resources, type Bag, type Card, type Resource, type State } from './game-types';
import './prototype.css';

type Panel = 'account' | 'invite' | 'join' | 'trade' | 'build' | 'cards' | 'history' | 'rules' | 'discard' | 'steal' | 'winner' | 'confirm' | null;
const costText = (cost: Partial<Bag>) => resources.filter(r => cost[r]).map(r => `${cost[r]} ${labels[r].toLowerCase()}`).join(' · ');
const total = (bag: Partial<Bag>) => Object.values(bag).reduce((a, b) => a + (b || 0), 0);
const names: Record<string, string> = { road: 'Droga', settlement: 'Osada', city: 'Miasto', development: 'Karta rozwoju' };

function BagPicker({ value, onChange, limits, title }: { value: Bag; onChange: (v: Bag) => void; limits?: Bag; title: string }) {
  return <fieldset className="bag-picker"><legend>{title}</legend>{resources.map(r => <div key={r}><span>{labels[r]}{limits && <small> / {limits[r]}</small>}</span><button aria-label={`Odejmij: ${title}, ${labels[r]}`} disabled={!value[r]} onClick={() => onChange({ ...value, [r]: value[r] - 1 })}><MinusIcon/></button><b>{value[r]}</b><button aria-label={`Dodaj: ${title}, ${labels[r]}`} disabled={value[r] >= (limits?.[r] ?? 19)} onClick={() => onChange({ ...value, [r]: value[r] + 1 })}><PlusIcon/></button></div>)}</fieldset>;
}
export default function Prototype() {
  const keyboard = useKeyboard();
  const initialCode = new URLSearchParams(location.search).get('room')?.toUpperCase() || '';
  const [code, setCode] = useState(initialCode);
  const [token, setToken] = useState(() => initialCode ? localStorage.getItem(`aetherii:${initialCode}`) || '' : '');
  const [state, setState] = useState<State | null>(null), [preview, setPreview] = useState<State | null>(null);
  const [name, setName] = useState(localStorage.getItem('aetherii:name') || '');
  const [account, setAccount] = useState<Account>({ user: null, rooms: [], googleEnabled: false });
  const [ai, setAI] = useState(false);
  const [practice, setPractice] = useState(false), [busy, setBusy] = useState(false), [connected, setConnected] = useState(true);
  const [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [panel, setPanel] = useState<Panel>(null), [mode, setMode] = useState<string | null>(null);
  const [target, setTarget] = useState<{ type: string; id: number } | null>(null);
  const [give, setGive] = useState<Resource>('wood'), [want, setWant] = useState<Resource>('brick');
  const [offerGive, setOfferGive] = useState(blankBag), [offerWant, setOfferWant] = useState(blankBag);
  const [chosen, setChosen] = useState(blankBag), [selectedCard, setSelectedCard] = useState<Card | null>(null);
  const stateRef = useRef(state), busyRef = useRef(false);
  const [copied, setCopied] = useState(false);
  stateRef.current = state;
  function update(next: State) { setState(old => !old || old.code !== next.code || next.revision >= old.revision ? next : old); }
  async function api(path: string, data?: unknown, auth = token) {
    const response = await fetch(path, { method: data === undefined ? 'GET' : 'POST', headers: { ...(data === undefined ? {} : { 'Content-Type': 'application/json' }), ...(auth ? { Authorization: `Bearer ${auth}` } : {}) }, body: data === undefined ? undefined : JSON.stringify(data), signal: AbortSignal.timeout(15000) });
    const result = await response.json();
    if (!response.ok) { if (result.state) update(result.state); throw new Error(result.error || 'Nie udało się połączyć.'); }
    return result;
  }
  useEffect(() => { api('./api/account', undefined, '').then(a => { setAccount(a); if (a.user) setName(a.user.name); }).catch(() => setError('Nie udało się wczytać konta. Spróbuj odświeżyć stronę.')); const result = new URLSearchParams(location.search).get('auth'); if (result) { setPanel('account'); setError(result === 'use-password' ? 'Ten e-mail ma konto z hasłem. Zaloguj się e-mailem.' : 'Logowanie Google anulowano. Możesz spróbować ponownie.'); } }, []);
  useEffect(() => { api('./api/preview', undefined, '').then(setPreview).catch(() => setError('Nie udało się wczytać planszy. Odśwież stronę.')); }, []);
  useEffect(() => {
    if (!token || !code) return;
    let stopped = false, timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try { const s = await api(`./api/rooms/${code}`, undefined, token); if (!stopped) { update(s); setConnected(true); } }
      catch (e) { if (!stopped) { setConnected(false); if (!stateRef.current) setError((e as Error).message); } }
      if (!stopped) timer = setTimeout(poll, 1200);
    }
    poll(); return () => { stopped = true; clearTimeout(timer); };
  }, [token, code]);
  useEffect(() => { if (!notice) return; const id = setTimeout(() => setNotice(''), 4500); return () => clearTimeout(id); }, [notice]);
  async function command(action: string, payload: unknown = {}, close = true) {
    if (busyRef.current || !stateRef.current) return false;
    busyRef.current = true; setBusy(true); setError('');
    try {
      const next = await api(`./api/rooms/${code}/action`, { action, payload, revision: stateRef.current.revision }); update(next);
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
      const result = await api(join ? `./api/rooms/${code}/join` : './api/rooms', { name, practice, ai }, '');
      localStorage.setItem(`aetherii:${result.state.code}`, result.token); localStorage.setItem('aetherii:name', name.trim());
      setCode(result.state.code); setToken(result.token); update(result.state); setPanel(null);
      history.replaceState({}, '', `?room=${result.state.code}`);
      setNotice(join ? 'Dołączono do pokoju.' : result.state.ai ? 'Gra z AI rozpoczęta. Wybierz pierwszą osadę.' : 'Pokój gotowy. Zaproś znajomych!');
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
  const open = (p: Panel) => { keyboard.hide(); setError(''); if (p === 'account') api('./api/account', undefined, '').then(refreshAccount).catch(e => setError(e.message)); setPanel(p); setChosen(blankBag()); setSelectedCard(null); };
  const s = state || preview, me = state?.players.find(p => p.id === state.me);
  const current = state?.players[state.active];
  const mine = Boolean(state && current?.id === state.me);
  const mandatory = state?.discard[state.me] ? 'discard' : mine && state?.phase === 'steal' ? 'steal' : state?.phase === 'finished' ? 'winner' : null;
  const visiblePanel = mandatory || panel;
  const effectiveMode = mine ? state?.phase === 'setup-settlement' ? 'settlement' : state?.phase === 'setup-road' || state?.phase === 'free-roads' ? 'road' : state?.phase === 'robber' ? 'robber' : state?.phase === 'main' ? mode : null : null;
  const link = `${location.origin}${location.pathname}?room=${state?.code || code}`;
  const canAfford = (kind: string) => me?.resources && Object.entries(costs[kind]).every(([r, n]) => me.resources![r as Resource] >= n!);
  const phaseText = !state ? 'Twoja wyspa czeka' : state.phase === 'lobby' ? 'Zbierz swoją załogę' : state.phase === 'finished' ? 'Wyspa ma zwycięzcę!' : mine ? state.phase.startsWith('setup') ? 'Wybierz swoje miejsce' : state.phase === 'roll' ? 'Twoja tura' : state.phase === 'main' ? 'Handluj i buduj' : state.phase === 'free-roads' ? 'Zbuduj darmowe drogi' : 'Złodziej na wyspie' : `Teraz gra ${current?.name}`;
  const hint = !state ? ai ? 'Ty kontra komputer · trening dla dwóch graczy.' : 'Zaproś znajomych. Zbudujcie własną historię.' : state.phase === 'lobby' ? `${state.players.length}/${state.maxPlayers} graczy · ${state.ai ? 'Ty kontra AI' : state.practice ? 'wariant treningowy od 2 osób' : 'gra dla 3–4 osób'}` : state.phase === 'discard' ? 'Czekamy, aż gracze odrzucą nadmiar kart.' : !mine ? current?.bot ? 'AI planuje swój ruch. Za chwilę Twoja kolej.' : 'Obserwuj planszę i planuj kolejny ruch.' : state.phase === 'setup-settlement' ? 'Wybierz podświetlone skrzyżowanie na planszy.' : state.phase === 'setup-road' ? 'Połącz nową osadę z pierwszą drogą.' : state.phase === 'roll' ? 'Rzuć kośćmi, aby zebrać surowce.' : state.phase === 'main' ? state.built ? 'Buduj dalej lub zakończ turę.' : 'Wymieniaj surowce, a potem rozpocznij budowę.' : state.phase === 'robber' ? 'Dotknij terenu, na który przeniesiesz złodzieja.' : state.phase === 'free-roads' ? `Pozostało dróg: ${state.freeRoads}. Wybierz krawędź.` : '';
  async function copyLink() {
    try { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 3000); } catch { setNotice('Zaznacz i skopiuj link poniżej.'); }
  }
  async function share() {
    if (navigator.share) { try { await navigator.share({ title: 'Kroniki Aetherii · Korona i Cień', text: 'Dołącz do naszej gry!', url: link }); } catch { open('invite'); } }
    else open('invite');
  }
  const title = { account: 'Konto gracza', invite: 'Zaproś na wyspę', join: 'Dołącz do znajomych', trade: 'Przystań handlowa', build: 'Rozbuduj swoją wyspę', cards: 'Twoje karty rozwoju', history: 'Dziennik wyprawy', rules: 'Jak grać', discard: 'Oddaj część surowców', steal: 'Wybierz gracza', winner: 'Koniec wyprawy', confirm: target ? `Budujesz: ${names[target.type] || 'złodziej'}` : 'Potwierdź ruch' };
  const resourceChoice = (val: Resource, change: (r: Resource) => void, text: string) => <label className="select-label">{text}<select value={val} onChange={e => change(e.target.value as Resource)}>{resources.map(r => <option key={r} value={r}>{labels[r]}</option>)}</select></label>;
  const errorBox = error && <div role="alert" className="error-message">{error}<button aria-label="Zamknij komunikat" onClick={() => setError('')}><Cross2Icon/></button></div>;
  return <>
    <MobileScroll className="aetherii-scroll">
      <main className={`aetherii-game ${state ? 'is-playing' : 'is-landing'}${state?.ai ? ' is-ai' : ''}`} aria-label="Kroniki Aetherii — Korona i Cień">
        <div className="account-bar"><span>{account.user ? `Witaj, ${account.user.name}` : 'Graj jako gość lub zapisz grę na koncie'}</span><button className="text-button" onClick={() => open('account')}>{account.user ? 'Moje konto' : 'Zaloguj / załóż konto'}</button></div>
        <header className="game-header"><div className="brand"><h1>Kroniki Aetherii</h1><span>KORONA I CIEŃ</span></div><div className="room-tools">{state?.ai ? <button className="room-code" aria-label="Dziennik gry z AI" onClick={() => open('history')}>Ty + AI<TimerIcon/></button> : state ? <><button className="room-code" aria-label="Kod pokoju i link zaproszenia" onClick={() => open('invite')}>{state.code}<CopyIcon/></button><button className="share-button" aria-label="Udostępnij grę" onClick={share}><Share2Icon/></button></> : <button className="share-button" aria-label="Zasady gry" onClick={() => open('rules')}><InfoCircledIcon/></button>}</div></header>
        <section className="players" aria-label="Gracze">{(state?.players || preview?.players || []).map(p => <button className={`player ${state && current?.id === p.id && state.phase !== 'lobby' ? 'active-player' : ''}`} key={p.id} onClick={() => { setNotice(`${p.name} · ${p.resourceCount} surowców · ${p.cardCount} kart rozwoju · droga ${p.roadLength} · rycerze ${p.knights}`); }}><i style={{ backgroundColor: p.color }}/><span><strong>{p.name} {p.bot ? <small>(AI)</small> : state && p.id === state.me && <small>(Ty)</small>}</strong><b>{p.points} <small>pkt</small></b></span>{state?.longest === p.id && <DrawingPinIcon aria-label="Najdłuższa droga"/>}{state?.army === p.id && <BackpackIcon aria-label="Największa armia"/>}</button>)}{state?.phase === 'lobby' && Array.from({ length: state.maxPlayers - state.players.length }, (_, i) => <button key={i} className="player vacant-player" onClick={() => open('invite')}><PlusIcon/><span>Zaproś</span></button>)}</section>
        {!connected && token && <p className="connection-message" role="status"><ReloadIcon/> Ponawiam połączenie…</p>}
        {s ? <Board state={s} preview={!state} mode={effectiveMode} choose={(type, id) => { if (busy) return; if (type === 'robber') command('robber', { id }); else { setTarget({ type, id }); open('confirm'); } }}/> : <div className="board-loading"><ReloadIcon/> Przygotowuję wyspę…</div>}
        <section className="turn-panel" aria-label="Twoje akcje">
          <h2>{phaseText}</h2><p>{hint}</p>
          {state?.dice && <div className="dice-result" aria-label={`Rzut: ${state.dice.join(' i ')}`}><b>{state.dice[0]}</b><b>{state.dice[1]}</b><span>Wynik: {state.dice[0] + state.dice[1]}</span></div>}
          {state?.lastRoll && <div className="roll-gains" role="status"><small>Ostatni rzut: {state.lastRoll.player} · {state.lastRoll.dice.reduce((a, b) => a + b, 0)} </small><p>{total(state.lastRoll.resources) ? `Zdobyte surowce: ${costText(state.lastRoll.resources)}.` : 'Ten rzut nie przyniósł Ci żadnych surowców.'}</p></div>}
          {state && state.phase !== 'lobby' && <div className="resources" aria-label="Twoje surowce">{resources.map(r => <div key={r}><img src={`./game/icon-${r}.webp`} alt=""/><b>{me?.resources?.[r] || 0}</b><span>{labels[r]}</span></div>)}</div>}
          {!state && <form className="entry-form" onSubmit={e => enter(e, Boolean(initialCode))}><label htmlFor="player-name">Twoje imię</label><KeyboardInput id="player-name" maxLength={24} placeholder="Jak Cię nazywać?" autoComplete="nickname" value={name} onChange={e => setName(e.target.value)}/>{!initialCode && <label className="select-label">Tryb rozgrywki<select value={ai ? 'ai' : practice ? 'practice' : 'friends'} onChange={e => { setAI(e.target.value === 'ai'); setPractice(e.target.value === 'practice'); }}><option value="friends">Ze znajomymi (3–4 graczy)</option><option value="ai">Z AI (Ty + komputer)</option><option value="practice">Trening ze znajomym (2 graczy)</option></select></label>}<button className="primary" disabled={busy || !name.trim()} type="submit">{busy ? 'Przygotowuję pokój…' : initialCode ? `Dołącz do pokoju ${initialCode}` : ai ? 'Zagraj z AI' : 'Stwórz pokój'}</button>{!initialCode && <button className="text-button" type="button" onClick={() => open('join')}>Mam już kod pokoju <Chevron/></button>}</form>}
          {state?.phase === 'lobby' && <div className="lobby-actions"><button className="primary" onClick={() => open('invite')}><Share2Icon/>Zaproś znajomych</button>{state.host === state.me ? <button className="secondary" disabled={busy || state.players.length < (state.practice ? 2 : 3)} onClick={() => command('start')}>Rozpocznij grę ({state.players.length}/{state.maxPlayers})</button> : <p>Gospodarz rozpocznie grę, gdy wszyscy dołączą.</p>}<span className="subtle">Link zaprasza do tego samego pokoju.</span></div>}
          {state && mine && state.phase === 'roll' && <button className="primary" disabled={busy || !connected} onClick={() => command('roll')}><ShuffleIcon/>{busy ? 'Rzucam…' : 'Rzuć kośćmi'}</button>}
          {state && mine && state.phase === 'main' && <div className="main-actions"><button className="primary" disabled={busy} onClick={() => { if (mode) setMode(null); else open('build'); }}><HomeIcon/>{mode ? 'Anuluj wybór miejsca' : 'Buduj na wyspie'}</button><button className="text-button" disabled={busy} onClick={() => { setMode(null); command('end'); }}>Zakończ turę <Chevron/></button></div>}
          {state && mine && effectiveMode && state.phase !== 'main' && <p className="action-nudge">{effectiveMode === 'road' ? 'Droga' : effectiveMode === 'robber' ? 'Złodziej' : 'Osada'} · wybierz miejsce na planszy</p>}
          {state && !mine && state.offers.some(o => !o.to || o.to === state.me) && <button className="secondary" onClick={() => open('trade')}>Nowa propozycja handlu</button>}
          {state?.phase === 'finished' && <button className="primary" onClick={() => open('winner')}>Zobacz wyniki</button>}
          {state && <NotificationSettings/>}
          {errorBox && !visiblePanel && errorBox}
        </section>
      </main>
    </MobileScroll>
    <GameAlerts state={state} trade={() => open('trade')}/>
    <nav className="game-nav" aria-label="Menu gry"><button className={!panel ? 'selected' : ''} onClick={() => { setPanel(null); setMode(null); }}><LayersIcon/><span>Plansza</span></button><button className={panel === 'trade' ? 'selected' : ''} disabled={!state || state.phase === 'lobby'} onClick={() => open('trade')}><ShuffleIcon/><span>Handel</span></button><button className={panel === 'build' ? 'selected' : ''} disabled={!state || state.phase === 'lobby'} onClick={() => open('build')}><HomeIcon/><span>Budowa</span></button><button className={panel === 'cards' ? 'selected' : ''} disabled={!state || state.phase === 'lobby'} onClick={() => open('cards')}><CardStackIcon/><span>Karty</span></button><button onClick={() => open(state ? 'history' : 'rules')}><TimerIcon/><span>{state ? 'Dziennik' : 'Zasady'}</span></button></nav>
    {notice && <div className="toast" role="status">{notice}</div>}
    <BottomSheet open={Boolean(visiblePanel)} onOpenChange={v => { if (!v && !mandatory) { setPanel(null); setError(''); } }} title={title[visiblePanel || 'rules']} snap={visiblePanel === 'trade' ? 0.9 : 0.78}>
      <div className="game-sheet">
        {!mandatory && <button className="sheet-close" aria-label="Zamknij panel" onClick={() => { setPanel(null); setError(''); }}><Cross2Icon/></button>}
        {visiblePanel === 'account' && <AccountPanel account={account} refresh={refreshAccount} api={api} state={state} token={token} roomCode={state?.code || code} resume={resumeAccount} logout={logoutAccount}/>}
        {visiblePanel === 'invite' && <><p>Wyślij link znajomym. Do pokoju dołączą na swoim telefonie lub komputerze.</p><div className="invite-code">{state?.code}</div><label className="select-label">Link do pokoju<KeyboardInput readOnly value={link} onFocus={e => e.target.select()} aria-label="Link zaproszenia"/></label><button className="primary" onClick={copyLink}>{copied ? <CheckIcon/> : <CopyIcon/>}{copied ? 'Skopiowano link' : 'Kopiuj link'}</button><p className="subtle">Jeśli serwer działa tylko lokalnie, znajomi muszą być w tej samej sieci i otworzyć adres sieciowy serwera.</p></>}
        {visiblePanel === 'join' && <form className="entry-form" onSubmit={e => enter(e, true)}><label htmlFor="join-code">Kod pokoju</label><KeyboardInput id="join-code" value={code} maxLength={6} autoCapitalize="characters" onChange={e => setCode(e.target.value.replace(/[^a-z0-9]/gi, '').toUpperCase())} placeholder="np. A12B3C"/><label htmlFor="join-name">Twoje imię</label><KeyboardInput id="join-name" maxLength={24} value={name} onChange={e => setName(e.target.value)} autoComplete="nickname"/><button className="primary" disabled={busy || !name.trim() || code.length !== 6}>Dołącz do gry</button></form>}
        {visiblePanel === 'build' && <><p>Po rozpoczęciu budowy handel w tej turze się kończy.</p><div className="build-options">{Object.entries(costs).map(([kind, cost]) => <button key={kind} className="build-option" disabled={!mine || state?.phase !== 'main' || busy || !canAfford(kind) || (kind === 'development' ? !state.deckCount : kind === 'road' ? !state.legal.roads.length : kind === 'city' ? !state.legal.cities.length : !state.legal.settlements.length)} onClick={() => { if (kind === 'development') command('buy'); else { setMode(kind); setPanel(null); } }}><span className="build-icon">{kind === 'city' ? <LayersIcon/> : kind === 'development' ? <CardStackIcon/> : kind === 'road' ? <MinusIcon/> : <HomeIcon/>}</span><span><strong>{names[kind]}</strong><small>{costText(cost)}</small>{(!mine || state?.phase !== 'main' || !canAfford(kind) || (kind === 'development' ? !state.deckCount : kind === 'road' ? !state.legal.roads.length : kind === 'city' ? !state.legal.cities.length : !state.legal.settlements.length)) && <small className="build-reason">{!mine || state?.phase !== 'main' ? 'Dostępne po rzucie w Twojej turze' : !canAfford(kind) ? 'Brakuje surowców' : kind === 'development' ? 'Talia jest pusta' : 'Brak legalnego miejsca lub limit budowli'}</small>}</span><Chevron/></button>)}</div>{(!mine || state?.phase !== 'main') && <p className="subtle">Budowa jest dostępna po rzucie kośćmi w Twojej turze.</p>}</>}
        {visiblePanel === 'confirm' && target && <><p>{state?.phase.startsWith('setup') || state?.phase === 'free-roads' ? 'Ta budowa nie kosztuje surowców.' : `Koszt: ${costText(costs[target.type])}`}</p><p>Potwierdź wybrane miejsce na planszy.</p><button className="primary" disabled={busy} onClick={async () => { if (await command('build', target)) setMode(null); }}>Potwierdź budowę</button><button className="secondary" onClick={() => setPanel(null)}>Wybierz inne miejsce</button></>}
        {visiblePanel === 'trade' && state && <><h3>Bank i porty</h3><p>Wymiana {state.rates[give]}:1 · w banku: {state.bank[want]} {labels[want].toLowerCase()}</p><div className="trade-selects">{resourceChoice(give, setGive, 'Oddajesz')}{resourceChoice(want, setWant, 'Otrzymujesz')}</div><button className="secondary" disabled={!mine || state.phase !== 'main' || state.built || busy || give === want || !me?.resources || me.resources[give] < state.rates[give] || !state.bank[want]} onClick={() => command('bank', { give, want }, false)}>Wymień {state.rates[give]} za 1</button><h3>Handel z graczami</h3>{state.offers.map(o => <div className="trade-offer" key={o.id}><strong>{state.players.find(p => p.id === o.from)?.name} proponuje</strong><p>Oddaje: {costText(o.give)}</p><p>Chce: {costText(o.want)}</p>{o.from === state.me ? <button className="secondary" disabled={busy} onClick={() => command('cancel-offer')}>Wycofaj ofertę</button> : (!o.to || o.to === state.me) && <button className="primary" disabled={busy || !me?.resources || !resources.every(r => me.resources![r] >= o.want[r])} onClick={() => command('accept', { id: o.id })}>Przyjmij ofertę</button>}</div>)}{mine && state.phase === 'main' && !state.built ? <><BagPicker title="Oferujesz" value={offerGive} onChange={setOfferGive} limits={me?.resources}/><BagPicker title="Chcesz otrzymać" value={offerWant} onChange={setOfferWant}/><button className="primary" disabled={busy || !total(offerGive) || !total(offerWant)} onClick={() => command('offer', { give: offerGive, want: offerWant }, false)}>Zaproponuj wymianę wszystkim</button></> : <p className="subtle">Ofertę składa aktywny gracz przed rozpoczęciem budowy. Pozostali mogą ją przyjąć.</p>}</>}
        {visiblePanel === 'cards' && state && <><p>Jedna karta na turę. Nową zagrasz od następnej własnej tury. Punkty zwycięstwa liczą się od razu.</p><span className="subtle">W talii: {state.deckCount} · zagrani rycerze: {me?.knights || 0}</span><details className="card-guide"><summary>Opisy wszystkich kart rozwoju</summary>{Object.entries(cardDescriptions).map(([type, description]) => <div key={type}><h3>{cardNames[type]}</h3><p>{description}</p></div>)}</details>{!me?.cards?.length && <div className="empty-state"><CardStackIcon/><h3>Twoja historia dopiero się zaczyna</h3><p>Kup kartę w zakładce Budowa: 1 wełna, 1 zboże i 1 ruda.</p></div>}{me?.cards?.map(c => <button key={c.id} className={`development-card ${selectedCard?.id === c.id ? 'chosen-card' : ''}`} disabled={busy || c.type === 'point' || !mine || !['main', 'roll'].includes(state.phase) || state.playedCard || c.bought >= state.turn} onClick={() => { setSelectedCard(c); setChosen(blankBag()); }}><CardStackIcon/><span><strong>{cardNames[c.type]}</strong><span className="card-description">{cardDescriptions[c.type]}</span><small>{c.type === 'point' ? '+1 punkt (ukryty przed innymi)' : c.bought >= state.turn ? 'Dostępna od następnej tury' : 'Wybierz, aby zagrać'}</small></span></button>)}{selectedCard && <><h3>{cardNames[selectedCard.type]}</h3><p>{cardDescriptions[selectedCard.type]}</p>{selectedCard.type === 'plenty' && <BagPicker title="Wybierz surowce" value={chosen} onChange={setChosen} limits={state.bank}/>} {selectedCard.type === 'monopoly' && resourceChoice(want, setWant, 'Zabierz wszystkim ten surowiec')}{selectedCard.type === 'roads' && <p>Zbudujesz dwie połączone z Twoją siecią drogi bez opłat.</p>}{selectedCard.type === 'knight' && <p>Przesuniesz złodzieja i zabierzesz losową kartę sąsiadowi.</p>}<button className="primary" disabled={busy || (selectedCard.type === 'plenty' && total(chosen) !== Math.min(2, total(state.bank)))} onClick={() => command('play', { id: selectedCard.id, resource: want, resources: chosen })}>Zagraj kartę</button></>}</>}
        {visiblePanel === 'discard' && state && <><p>Wypadło 7. Masz więcej niż 7 surowców, więc wybierz dokładnie <strong>{state.discard[state.me]}</strong> kart do zwrotu.</p><BagPicker title="Oddajesz do banku" value={chosen} onChange={setChosen} limits={me?.resources}/><p>Wybrano {total(chosen)} z {state.discard[state.me]}</p><button className="primary" disabled={busy || total(chosen) !== state.discard[state.me]} onClick={() => command('discard', { resources: chosen })}>Oddaj wybrane surowce</button></>}
        {visiblePanel === 'steal' && state && <><p>Wybierz sąsiada złodzieja. Zabierzesz mu jedną losową kartę surowca.</p>{state.players.filter(p => state.victims.includes(p.id)).map(p => <button key={p.id} className="secondary" disabled={busy} onClick={() => command('steal', { player: p.id })}>{p.name} · {p.resourceCount} kart</button>)}</>}
        {visiblePanel === 'history' && <><button className="text-button" onClick={() => open('rules')}><InfoCircledIcon/>Zasady i koszty budowy</button><ol className="game-log">{state?.log.map((entry, i) => <li key={i}><small>{entry.turn ? `Tura ${entry.turn}` : 'Rozstawianie'}</small><span>{entry.text}</span></li>)}</ol>{!state?.log.length && <p>Wyprawa zacznie się, gdy gospodarz uruchomi grę.</p>}</>}
        {visiblePanel === 'rules' && <div className="rules"><p>Cel: zdobyć 10 punktów w swojej turze. Podstawowa rozgrywka jest przeznaczona dla 3–4 graczy; trening dla dwóch osób, także przeciwko AI, jest dodatkowym wariantem z czterema osadami na start. AI samodzielnie wykonuje swoje ruchy i może przyjąć korzystną ofertę handlu.</p><h3>Początek wyprawy</h3><p>Każdy stawia osadę i drogę, potem kolejną parę w odwrotnej kolejności. Dla 3–4 graczy są to po 2 osady i drogi. Dla 2 graczy powtarzamy rozstawianie: każdy zaczyna z 4 osadami i 4 drogami. Surowce startowe daje ostatnia osada z sąsiednich terenów.</p><h3>Twoja tura</h3><p>Rzuć kośćmi. Tereny z tym wynikiem dają surowce wszystkim sąsiadującym osadom (1) i miastom (2). Następnie handluj i buduj. Po pierwszej budowie nie można już handlować w tej turze.</p><h3>Budowanie</h3>{Object.entries(costs).map(([k, v]) => <p key={k}><strong>{names[k]}:</strong> {costText(v)}.</p>)}<p>Osady wymagają własnej drogi i co najmniej dwóch krawędzi odstępu od innych budynków. Limit pionków: 15 dróg, 5 osad i 4 miasta.</p><h3>Złodziej</h3><p>Przy wyniku 7 każdy z ponad 7 surowcami oddaje połowę, zaokrąglając w dół. Aktywny gracz przenosi złodzieja na inny teren produkcyjny i wybiera sąsiada, któremu zabiera losową kartę. Złodziej blokuje produkcję.</p><h3>Handel i punkty</h3><p>Bank wymienia 4:1, port uniwersalny 3:1, specjalistyczny 2:1. Osada daje 1 punkt, miasto 2. Najdłuższa ciągła droga (min. 5) i największa armia (min. 3 zagranych rycerzy) dają po 2 punkty. Remis pozostawia wyróżnienie u aktualnego właściciela.</p><h3>Karty</h3><p>Rycerz przesuwa złodzieja; Budowa dróg daje dwie drogi; Rok urodzaju daje dwa surowce; Monopol zabiera wybrany surowiec innym. Karty punktów są ukryte i liczą się automatycznie. Można zagrać jedną kartę akcji na turę, także przed rzutem; nie w turze zakupu.</p><a href="https://files.rebel.pl/files/instrukcje/Settlers-of-Catan.pdf" target="_blank" rel="noreferrer">Otwórz instrukcję źródłową REBEL</a></div>}
        {visiblePanel === 'winner' && state && <><div className="winner-heading"><h2>{state.players.find(p => p.id === state.winner)?.name} wygrywa!</h2><p>Na wyspie zapisano nową historię.</p></div>{[...state.players].sort((a, b) => b.points - a.points).map(p => <div key={p.id} className="result-row"><span>{p.name}</span><b>{p.points} pkt</b></div>)}<button className="primary" onClick={() => location.assign(location.pathname)}>Nowa wyprawa</button></>}
        {visiblePanel && errorBox}
      </div>
    </BottomSheet>
  </>;
}
function Chevron() { return <ChevronRightIcon aria-hidden="true"/>; }
