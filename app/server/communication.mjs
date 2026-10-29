import { message, source, LocalizedError, localizedResponse } from '../i18n/server.mjs';
import { WebSocketServer } from 'ws';
import { randomBytes, randomUUID, createHmac } from 'node:crypto';
import { createChatStore } from './chat-store.mjs';
export function createCommunication({server,basePath,dataDir,getRoom,accounts,mutateRoom,json,readBody,env}) {
  const store=createChatStore(`${dataDir}/chat.sqlite`), tickets=new Map(), clients=new Set(), queues=new Map(), attempts=new Map(), textLimits=new Map();
  const enabled=env.AETHERII_CHAT_ENABLED!=='false';
  const voice=enabled&&env.AETHERII_VOICE_ENABLED!=='false'&&Boolean(env.TURN_URLS&&env.TURN_SECRET);
  const sessionKey=req=>(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('aetherii_session='))||'';
  const wss=new WebSocketServer({noServer:true,maxPayload:24000,perMessageDeflate:false});
  function auth(req,g,token) {const user=accounts.session(req);return g?.players.find(p=>!p.bot&&p.token===token&&(!p.accountId||p.accountId===user?.id));}
  function allowed(req,g,token) { const p=auth(req,g,token); return p&&p.communicationBlocked!==true&&g.communicationApproved===true&&!g.ai?p:null; }
  function send(c,event) {if(c.readyState===1){if(c.bufferedAmount>128000)c.close(1013,'Wolny odbiorca');else c.send(JSON.stringify(localizedResponse(event)));}}
  function broadcast(code,event) {for(const c of clients)if(c.code===code&&valid(c))send(c,event);}
  function valid(c){return Boolean(allowed(c.req,getRoom(c.code),c.token));}
  function presence(code){broadcast(code,{type:'presence.changed',players:[...clients].filter(c=>c.code===code&&valid(c)).map(c=>({playerId:c.playerId,voice:c.voice,mic:c.mic}))});}
  function serial(code,fn){const p=(queues.get(code)||Promise.resolve()).catch(()=>{}).then(fn);queues.set(code,p);p.finally(()=>{if(queues.get(code)===p)queues.delete(code);}).catch(()=>{});return p;}
  const timer=setInterval(()=>{const now=Date.now();for(const [k,t] of tickets)if(t.expires<now)tickets.delete(k);attempts.clear();for(const [k,v]of textLimits)if(!v.some(t=>t>now-10000))textLimits.delete(k); for(const c of clients){if(!valid(c)||!c.alive){c.terminate();continue;}c.alive=false;c.ping();}},15000);timer.unref();
  server.on('upgrade',(req,socket,head)=>{
    if(!req.url?.startsWith(`${basePath}/api/rooms/`))return;
    const match=req.url.slice(basePath.length).match(/^\/api\/rooms\/([A-Z0-9]{6})\/communication$/);
    const expected=env.PUBLIC_URL?new URL(env.PUBLIC_URL).origin:`http://${req.headers.host}`;
    const ip=req.socket.remoteAddress,n=(attempts.get(ip)||0)+1;attempts.set(ip,n);
    if(!enabled||!match||req.headers.origin!==expected||n>40||wss.clients.size>=200){socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');return;}
    wss.handleUpgrade(req,socket,head,c=>{
      c.req=req;c.code=match[1];c.alive=true;c.voice=false;c.mic=false;c.messages=[];c.signals=[];c.frames=[];c.queued=0;
      const timeout=setTimeout(()=>c.close(1008,'Brak autoryzacji'),5000);
      c.on('pong',()=>c.alive=true);
      c.on('error',()=>{});
      c.on('close',()=>{clearTimeout(timeout);clients.delete(c);presence(c.code);});
      c.on('message',raw=>{
        const now=Date.now();c.frames=c.frames.filter(t=>t>now-10000);
        if(c.frames.length>=300||c.queued>=100){c.close(1008,'Za dużo żądań');return;}c.frames.push(now);c.queued++;
        // One queue for room writes, access revocation and initial snapshot.
        serial(c.code,async()=>{
          const e=JSON.parse(raw.toString());
          if(!c.token){
            const t=tickets.get(e.ticket);tickets.delete(e.ticket);
            if(e.type!=='auth'||!t||t.code!==c.code||t.expires<Date.now()||t.cookie!==sessionKey(req)||!allowed(req,getRoom(c.code),t.token))throw new LocalizedError(message("errors.no_access_to_chat"));
            c.token=t.token;c.playerId=auth(req,getRoom(c.code),t.token).id;
            if([...clients].filter(x=>x.code===c.code&&x.playerId===c.playerId).length>=3)throw new LocalizedError(message("errors.too_many_open_tabs"));
            clearTimeout(timeout);clients.add(c);
            const snapshot=await store.run('history',{room:c.code,player:c.playerId});if(!valid(c)){c.close(1008);return;}c.initialized=true;send(c,{type:'chat.snapshot',...snapshot});presence(c.code);return;
          }
          if(!valid(c)){c.close(1008,'Dostęp odebrany');return;}
          const g=getRoom(c.code),now=Date.now();
          if(e.type==='chat.send'){
            const key=`${c.code}:${c.playerId}`;const limit=(textLimits.get(key)||[]).filter(t=>t>now-10000);if(limit.length>=5)throw new LocalizedError(message("errors.wait_a_moment_before_sending_another_message"));limit.push(now);textLimits.set(key,limit);
            const roomKey=`room:${c.code}`,roomLimit=(textLimits.get(roomKey)||[]).filter(t=>t>now-10000);if(roomLimit.length>=20)throw new LocalizedError(message("errors.chat_is_busy"));roomLimit.push(now);textLimits.set(roomKey,roomLimit);
            if(g.communicationClosed)throw new LocalizedError(message("errors.the_host_closed_the_chat"));
            if(typeof e.text!=='string'||!e.text.trim()||e.text.length>2000||typeof e.clientMessageId!=='string'||!/^[a-zA-Z0-9-]{8,80}$/.test(e.clientMessageId))throw new LocalizedError(message("errors.invalid_message"));
            const result=await store.run('send',{room:c.code,player:c.playerId,client:e.clientMessageId,text:e.text.trim(),id:randomUUID(),version:e.version});
            send(c,{type:'chat.ack',...result});if(!result.duplicate)broadcast(c.code,{type:'chat.message',...result});
          }else if(e.type==='chat.read'){
            if(!Number.isSafeInteger(e.sequence)||e.sequence<0)throw new LocalizedError(message("errors.invalid_cursor"));
            const receipt=await store.run('read',{room:c.code,player:c.playerId,sequence:e.sequence});for(const x of clients)if(x.code===c.code&&x.playerId===c.playerId)send(x,{type:'chat.read',...receipt});
          }else if(e.type==='voice.join'){
            if(!voice||g.communicationClosed)throw new LocalizedError(message("errors.voice_chat_is_unavailable"));
            for(const x of clients)if(x!==c&&x.code===c.code&&x.playerId===c.playerId&&x.voice){x.voice=false;x.mic=false;send(x,{type:'voice.replaced'});}
            c.voice=true;presence(c.code);
          }else if(e.type==='voice.leave'){c.voice=false;c.mic=false;presence(c.code);
          }else if(e.type==='voice.mic'){c.mic=c.voice&&e.enabled===true;presence(c.code);
          }else if(e.type==='voice.signal'){
            c.signals=c.signals.filter(t=>t>now-10000);if(c.signals.length>=250)throw new LocalizedError(message("errors.too_many_signals"));c.signals.push(now);
            if(!c.voice||!e.signal||typeof e.to!=='string')throw new LocalizedError(message("errors.invalid_signal"));
            for(const x of clients)if(x!==c&&x.code===c.code&&x.playerId===e.to&&x.voice&&valid(x))send(x,{type:'voice.signal',from:c.playerId,signal:e.signal});
          }else throw new LocalizedError(message("errors.unknown_event"));
        }).catch(()=>{send(c,{type:'error',error:source("errors.chat_operation_failed_check_access_and_message_length_then_wait_a"),clientMessageId:(()=>{try{return JSON.parse(raw).clientMessageId;}catch{return undefined;}})()});if(!c.initialized)c.close(1008);}).finally(()=>{c.queued--;});
      });
    });
  });
  return {
    ready:()=>store.ready(),
    flags(g,p){return {enabled:enabled&&!g.ai&&g.communicationApproved===true&&p.communicationBlocked!==true,approved:g.communicationApproved===true,voice,closed:g.communicationClosed===true};},
    async route(req,res,url,g,p,endpoint){
      if(!['communication-ticket','messages','voice-credentials','communication-settings'].includes(endpoint))return false;
      if(!enabled)throw Object.assign(new LocalizedError(message("errors.communication_is_disabled")),{status:503});
      if(endpoint==='communication-settings'&&req.method==='POST'){
        if(g.host!==p.id)throw Object.assign(new LocalizedError(message("errors.only_the_host_can_change_access")),{status:403});
        const b=await readBody(req);await serial(g.code,async()=>{const verified=auth(req,getRoom(g.code),req.headers.authorization?.replace(/^Bearer /,''));if(!verified||verified.id!==getRoom(g.code).host)throw new LocalizedError(message("errors.host_permissions_required"));const current=structuredClone(getRoom(g.code));if(b.approved===true)current.communicationApproved=true;if(typeof b.closed==='boolean')current.communicationClosed=b.closed;
          if(b.playerId){const target=current.players.find(x=>x.id===b.playerId&&!x.bot);if(!target||target.id===current.host)throw new LocalizedError(message("errors.invalid_participant"));target.communicationBlocked=b.blocked===true;}
          mutateRoom(g.code,next=>{next.communicationApproved=current.communicationApproved;next.communicationClosed=current.communicationClosed;next.players=current.players;});for(const c of clients)if(c.code===g.code&&(!valid(c)||current.communicationClosed)){if(!valid(c)){send(c,{type:'access.revoked'});c.close(1008);}else{c.voice=false;c.mic=false;send(c,{type:'voice.replaced'});}}presence(g.code);
          if(b.clear===true){const result=await store.run('clear',{room:g.code});broadcast(g.code,{type:'chat.cleared',...result});}
        });json(res,200,{ok:true});return true;
      }
      const token=req.headers.authorization?.replace(/^Bearer /,'');if(!allowed(req,g,token))throw Object.assign(new LocalizedError(message("errors.no_access_to_chat")),{status:403});
      if(endpoint==='messages'&&req.method==='GET'){
        const before=url.searchParams.get('before');if(before&&(!/^\d+$/.test(before)||!Number.isSafeInteger(Number(before))))throw new LocalizedError(message("errors.invalid_cursor"));
        const history=await serial(g.code,()=>store.run('history',{room:g.code,player:p.id,before:Number(before)||undefined}));if(!allowed(req,getRoom(g.code),token))throw Object.assign(new LocalizedError(message("errors.access_denied")),{status:403});json(res,200,history);return true;
      }
      if(endpoint==='communication-ticket'&&req.method==='POST'){
        if(tickets.size>=1000)throw new LocalizedError(message("errors.too_many_connections"));const ticket=randomBytes(24).toString('base64url');tickets.set(ticket,{code:g.code,token,cookie:sessionKey(req),expires:Date.now()+30000});json(res,200,{ticket});return true;
      }
      if(endpoint==='voice-credentials'&&req.method==='POST'){
        if(!voice||g.communicationClosed)throw new LocalizedError(message("errors.voice_requires_turn_configuration_by_the_administrator"));const username=`${Math.floor(Date.now()/1000)+3600}:${p.id}`;
        json(res,200,{iceServers:[{urls:env.TURN_URLS.split(',').map(s=>s.trim()),username,credential:createHmac('sha1',env.TURN_SECRET).update(username).digest('base64')}],iceTransportPolicy:'relay',expiresAt:Date.now()+3600000});return true;
      }
      throw Object.assign(new LocalizedError(message("errors.method_not_allowed")),{status:405});
    },
    close(){clearInterval(timer);for(const c of wss.clients)c.terminate();wss.close();store.close();}
  };
}
