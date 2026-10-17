import { useState, type FormEvent } from 'react';
import { GameInput } from './GameShell';
import type { State } from './game-types';

export interface Account { user: { id: string; name: string; email: string; google: boolean } | null; googleEnabled: boolean; rooms: { code: string; ai: boolean; phase: string; players: string[] }[] }
type Request = (path: string, body?: unknown, auth?: string) => Promise<any>;

export default function AccountPanel({ account, refresh, api, state, token, roomCode, resume, logout }: { account: Account; refresh: (a: Account) => void; api: Request; state: State | null; token: string; roomCode: string; resume: (r: { token: string; state: State }) => void; logout: () => void }) {
  const [register, setRegister] = useState(false), [email, setEmail] = useState(''), [name, setName] = useState(''), [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  async function perform(work: () => Promise<void>) {
    if (busy) return; setBusy(true); setError('');
    try { await work(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  function submit(e: FormEvent) {
    e.preventDefault(); perform(async () => { refresh(await api(`./api/auth/${register ? 'register' : 'login'}`, { email, name, password }, '')); setPassword(''); });
  }
  return <div className="account-panel">
    {error && <p role="alert" className="error-message">{error}</p>}
    {account.user ? <>
      <p>Zalogowano jako <strong>{account.user.name}</strong><br/>{account.user.email}</p>
      <p>Twoje gry są dostępne po zalogowaniu także na innym urządzeniu.</p>
      {account.googleEnabled && !account.user.google && <a className="secondary google-login" href={`./api/auth/google${roomCode ? `?room=${roomCode}` : ''}`}>Połącz konto z Google</a>}
      {state && !state.accountLinked && <button className="secondary" disabled={busy} onClick={() => perform(async () => { const r = await api('./api/account/link', { code: state.code, token }); resume(r); })}>Zapisz tę grę na koncie</button>}
      <h3>Twoje rozgrywki</h3>
      {!account.rooms.length && <p>Stwórz grę lub dołącz do pokoju. Zapiszemy ją na Twoim koncie.</p>}
      {account.rooms.map(r => <button key={r.code} className="account-room secondary" disabled={busy} onClick={() => perform(async () => resume(await api('./api/account/resume', { code: r.code })))}><strong>{r.code} {r.ai ? '· z AI' : ''}</strong><span>{r.players.join(', ')} · {r.phase === 'finished' ? 'zakończona' : r.phase === 'lobby' ? 'oczekiwanie' : 'w toku'}</span></button>)}
      <button className="text-button" disabled={busy} onClick={() => perform(async () => { await api('./api/auth/logout', {}); logout(); })}>Wyloguj się</button>
    </> : <>
      {account.googleEnabled ? <a className="secondary google-login" href={`./api/auth/google${roomCode ? `?room=${roomCode}` : ''}`}>Kontynuuj z Google</a> : <><button className="secondary" disabled>Kontynuuj z Google</button><p className="subtle">Logowanie Google będzie dostępne po skonfigurowaniu aplikacji przez gospodarza serwera.</p></>}
      <div className="account-tabs"><button type="button" aria-pressed={!register} onClick={() => { setRegister(false); setError(''); }}>Zaloguj e-mailem</button><button type="button" aria-pressed={register} onClick={() => { setRegister(true); setError(''); }}>Załóż konto</button></div>
      <form className="entry-form" onSubmit={submit}>
        {register && <><label htmlFor="account-name">Imię gracza</label><GameInput id="account-name" autoComplete="nickname" required maxLength={24} value={name} onChange={e => setName(e.target.value)}/></>}
        <label htmlFor="account-email">Adres e-mail</label><GameInput id="account-email" type="email" autoComplete="email" required maxLength={254} value={email} onChange={e => setEmail(e.target.value)}/>
        <label htmlFor="account-password">Hasło</label><GameInput id="account-password" type="password" autoComplete={register ? 'new-password' : 'current-password'} minLength={register ? 10 : undefined} maxLength={128} required value={password} onChange={e => setPassword(e.target.value)}/>
        {register && <p className="subtle">Co najmniej 10 znaków. E-mail służy do logowania; nie wysyłamy wiadomości ani linków resetowania hasła.</p>}
        <button className="primary" disabled={busy}>{busy ? 'Chwila…' : register ? 'Utwórz konto' : 'Zaloguj się'}</button>
      </form>
    </>}
  </div>;
}
