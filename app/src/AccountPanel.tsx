import { tr, systemText } from './i18n';
import { appPath } from './app-path';
import { useState, type FormEvent } from 'react';
import { GameInput } from './GameShell';
import type { State } from './game-types';

export interface Account { user: { id: string; name: string; email: string; google: boolean } | null; googleEnabled: boolean; rooms: { code: string; ai: boolean; phase: string; players: string[] }[] }
type Request = (path: string, body?: unknown, auth?: string) => Promise<any>;

export default function AccountPanel({ account, refresh, api, state, token, roomCode, resume, logout }: { account: Account; refresh: (a: Account) => void; api: Request; state: State | null; token: string; roomCode: string; resume: (r: { token: string; state: State }) => void; logout: () => void }) {
  const [register, setRegister] = useState(false), [email, setEmail] = useState(''), [name, setName] = useState(''), [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false), [error, setError] = useState<string | Error>('');
  async function perform(work: () => Promise<void>) {
    if (busy) return; setBusy(true); setError('');
    try { await work(); } catch (e) { setError(e as Error); } finally { setBusy(false); }
  }
  function submit(e: FormEvent) {
    e.preventDefault(); perform(async () => { refresh(await api(`/api/auth/${register ? 'register' : 'login'}`, { email, name, password }, '')); setPassword(''); });
  }
  return <div className="account-panel">
    {error && <p role="alert" className="error-message">{systemText(error)}</p>}
    {account.user ? <>
      <p>{tr("ui.signed_in_as")}{' '}<strong>{account.user.name}</strong><br/>{account.user.email}</p>
      <p>{tr("ui.your_games_are_also_available_on_another_device_when_you_sign_in")}</p>
      {account.googleEnabled && !account.user.google && <a className="secondary google-login" href={appPath(`/api/auth/google${roomCode ? `?room=${roomCode}` : ''}`)}>{tr("ui.link_your_google_account")}</a>}
      {state && !state.accountLinked && <button className="secondary" disabled={busy} onClick={() => perform(async () => { const r = await api('/api/account/link', { code: state.code, token }); resume(r); })}>{tr("ui.save_this_game_to_your_account")}</button>}
      <h3>{tr("ui.your_games")}</h3>
      {!account.rooms.length && <p>{tr("ui.create_a_game_or_join_a_room_we_will_save_it_to_your_account")}</p>}
      {account.rooms.map(r => <button key={r.code} className="account-room secondary" disabled={busy} onClick={() => perform(async () => resume(await api('/api/account/resume', { code: r.code })))}><strong>{r.code} {r.ai ? tr("ui.with_ai") : ''}</strong><span>{r.players.join(', ')} · {r.phase === 'finished' ? tr("ui.finished") : r.phase === 'lobby' ? tr("ui.waiting") : tr("ui.in_progress")}</span></button>)}
      <button className="text-button" disabled={busy} onClick={() => perform(async () => { await api('/api/auth/logout', {}); logout(); })}>{tr("ui.sign_out")}</button>
    </> : <>
      {account.googleEnabled ? <a className="secondary google-login" href={appPath(`/api/auth/google${roomCode ? `?room=${roomCode}` : ''}`)}>{tr("ui.continue_with_google")}</a> : <><button className="secondary" disabled>{tr("ui.continue_with_google")}</button><p className="subtle">{tr("ui.google_sign_in_will_be_available_once_the_server_administrator_co")}</p></>}
      <div className="account-tabs"><button type="button" aria-pressed={!register} onClick={() => { setRegister(false); setError(''); }}>{tr("ui.sign_in_with_email")}</button><button type="button" aria-pressed={register} onClick={() => { setRegister(true); setError(''); }}>{tr("ui.create_an_account")}</button></div>
      <form className="entry-form" onSubmit={submit}>
        {register && <><label htmlFor="account-name">{tr("ui.player_name")}</label><GameInput id="account-name" autoComplete="nickname" required maxLength={24} value={name} onChange={e => setName(e.target.value)}/></>}
        <label htmlFor="account-email">{tr("ui.email_address")}</label><GameInput id="account-email" type="email" autoComplete="email" required maxLength={254} value={email} onChange={e => setEmail(e.target.value)}/>
        <label htmlFor="account-password">{tr("ui.password")}</label><GameInput id="account-password" type="password" autoComplete={register ? 'new-password' : 'current-password'} minLength={register ? 10 : undefined} maxLength={128} required value={password} onChange={e => setPassword(e.target.value)}/>
        {register && <p className="subtle">{tr("ui.at_least_10_characters_email_is_used_to_sign_in_we_do_not_send_me")}</p>}
        <button className="primary" disabled={busy}>{busy ? tr("ui.one_moment") : register ? tr("ui.create_account") : tr("ui.sign_in")}</button>
      </form>
    </>}
  </div>;
}
