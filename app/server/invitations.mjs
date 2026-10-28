import { randomBytes, createHash } from 'node:crypto';
export const digest = value => createHash('sha256').update(value).digest('hex');
const fail=(message,status=403)=>{throw Object.assign(Error(message),{status});};
export function createInvitations({basePath,secure}) {
  const cookieName='aetherii_invite';
  const cookie=req=>{const v=(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(cookieName+'='));return v?.slice(cookieName.length+1);};
  const context=(req,g)=>g.inviteContexts?.find(c=>c.hash===digest(cookie(req)||'')&&c.expires>Date.now());
  return {
    create(g,accountId) {
      if(g.phase!=='lobby'||g.ai)fail('Zapraszanie jest dostępne tylko w lobby.',409);
      const secret=randomBytes(24).toString('base64url'), id=randomBytes(12).toString('hex');
      g.invitations=(g.invitations||[]).filter(x=>x.expires>Date.now());
      if(g.invitations.filter(x=>!x.used).length>=12)fail('Najpierw unieważnij wcześniejsze zaproszenia.',429);
      g.invitations.push({id,hash:digest(secret),expires:Date.now()+86400000,accountId:accountId||null});return {id,secret,expires:Date.now()+86400000};
    },
    stage(req,res,g,secret) {
      if(typeof secret!=='string'||secret.length>128)fail('Nieprawidłowe zaproszenie.');
      const invite=g.invitations?.find(x=>x.hash===digest(secret)&&x.expires>Date.now()&&!x.used);
      if(!invite)fail('Zaproszenie wygasło lub zostało wykorzystane.');
      const raw=cookie(req)||randomBytes(32).toString('hex');
      const existing=context(req,g);
      if(!existing||existing.invitation!==invite.id) {
        g.inviteContexts=(g.inviteContexts||[]).filter(x=>x.expires>Date.now()&&x.hash!==digest(raw));
        if(g.inviteContexts.length>=100)fail('Zbyt wiele otwartych zaproszeń.',429);
        g.inviteContexts.push({hash:digest(raw),invitation:invite.id,expires:Math.min(invite.expires,Date.now()+3600000)});
      }
      res.setHeader('Set-Cookie',`${cookieName}=${raw}; Path=${basePath||''}/; HttpOnly; SameSite=Lax; Max-Age=3600${secure?'; Secure':''}`);
      return {ok:true};
    },
    inspect(req,g,user) {
      const c=context(req,g); if(!c)fail('Otwórz ważny link zaproszenia od gospodarza.');
      const i=g.invitations?.find(x=>x.id===c.invitation&&x.expires>Date.now());
      if(!i||i.revoked)fail('Zaproszenie jest nieważne.');
      if(i.accountId&&i.accountId!==user?.id)fail('Zaproszenie jest przypisane do innego konta. Zaloguj się na właściwe konto.');
      if(c.playerId) { const p=g.players.find(x=>x.id===c.playerId&&(!x.accountId||x.accountId===user?.id)); if(p)return {existing:p}; }
      if(i.used)fail('Zaproszenie zostało już wykorzystane.');
      return {consume(p){i.used=true;c.playerId=p.id;}};
    },
    context(req,g){return Boolean(context(req,g));}
  };
}
