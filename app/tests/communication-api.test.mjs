import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtempSync,readFileSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {WebSocket} from 'ws';
import {inviteCookie} from './invite-helper.mjs';

test('private invitations, durable chat, isolation, revocation, voice signaling and history reset', {timeout:30000},async()=>{
 const dir=mkdtempSync(join(tmpdir(),'aetherii-chat-')),base='http://127.0.0.1:14289',prefix='/kroniki-aetherii';let proc,logs='';const sockets=[];
 const start=async()=>{proc=spawn(process.execPath,['server/start.mjs','--production','--port','14289','--host','127.0.0.1'],{env:{...process.env,PUBLIC_URL:base+prefix,AETHERII_DATA_DIR:dir,TURN_URLS:'turn:localhost:3478',TURN_SECRET:'test-secret'},stdio:'pipe'});proc.stderr.on('data',b=>logs+=b);await new Promise((resolve,reject)=>{proc.stdout.on('data',b=>{if(b.toString().includes('Kroniki Aetherii:'))resolve();});proc.once('error',reject);proc.once('exit',c=>reject(Error(`exit ${c}: ${logs}`)));});};
 const stop=async()=>{for(const s of sockets)s.terminate();await new Promise(r=>{proc.once('exit',r);proc.kill('SIGTERM');});};
 const req=async(path,body,token,cookie)=>{const r=await fetch(base+prefix+path,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`} :{}),...(cookie?{Cookie:cookie}:{})},body:body===undefined?undefined:JSON.stringify(body)});return {status:r.status,body:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};};
 async function socket(path,token,cookie){const ticket=await req(path+'/communication-ticket',{},token,cookie);assert.equal(ticket.status,200);const s=new WebSocket(base.replace('http','ws')+prefix+path+'/communication',{headers:{Origin:base,...(cookie?{Cookie:cookie}:{})}});s.events=[];s.wait=(type,predicate=()=>true)=>new Promise((resolve,reject)=>{const old=s.events.find(x=>x.type===type&&predicate(x));if(old)return resolve(old);const timer=setTimeout(()=>{s.off('message',on);reject(Error('Missing '+type));},3000);function on(b){const e=JSON.parse(b);if(e.type===type&&predicate(e)){clearTimeout(timer);s.off('message',on);resolve(e);}}s.on('message',on);});s.on('message',b=>s.events.push(JSON.parse(b)));await new Promise((r,j)=>{s.once('open',r);s.once('error',j);});s.send(JSON.stringify({type:'auth',ticket:ticket.body.ticket}));const snap=await s.wait('chat.snapshot');s.tx=e=>s.send(JSON.stringify(e));sockets.push(s);return {s,snap,ticket:ticket.body.ticket};}
 await start();
 try{
  const a=(await req('/api/rooms',{name:'Ala'})).body,path='/api/rooms/'+a.state.code;
  assert.equal((await req(path+'/join',{name:'Intruz'})).status,403);
  assert.equal((await req(path+'/messages')).status,401);
  const cookie=await inviteCookie(base+prefix,path,a.token);
  const b=await req(path+'/join',{name:'Bartek'},undefined,cookie);assert.equal(b.status,201);
  const repeat=await req(path+'/join',{name:'Bartek'},undefined,cookie);assert.equal(repeat.body.token,b.body.token);
  assert.equal((await req(path+'/join',{name:'Inny'})).status,403);
  const other=(await req('/api/rooms',{name:'Obcy'})).body;
  assert.equal((await req(path+'/communication-ticket',{},other.token)).status,401);
  assert.equal((await req(path+'/invitations',{},b.body.token)).status,403);
  const inv=(await req(path+'/invitations',{},a.token)).body;
  await req(path+'/invitations',{revoke:inv.id},a.token);
  assert.equal((await req(path+'/invitation-context',{secret:inv.secret})).status,403);
  const forbidden=new WebSocket(base.replace('http','ws')+prefix+path+'/communication',{headers:{Origin:'https://outside.example'}});
  assert.equal(await new Promise((resolve,reject)=>{forbidden.once('unexpected-response',(_req,res)=>{resolve(res.statusCode);res.resume();forbidden.terminate();});forbidden.on('error',()=>{});forbidden.once('open',()=>reject(Error('Cross-origin WS accepted')));}),403);
  const {s:sa,snap,ticket:usedTicket}=await socket(path,a.token),{s:sb}=await socket(path,b.body.token),{s:sc}=await socket('/api/rooms/'+other.state.code,other.token);
  const replay=new WebSocket(base.replace('http','ws')+prefix+path+'/communication',{headers:{Origin:base}});sockets.push(replay);
  await new Promise((resolve,reject)=>{replay.once('open',()=>replay.send(JSON.stringify({type:'auth',ticket:usedTicket})));replay.once('close',code=>{assert.equal(code,1008);resolve();});replay.once('error',reject);});
  assert.equal(snap.messages.length,0);
  sa.tx({type:'chat.send',clientMessageId:'message-0001',text:'<script>alert(1)</script>',version:snap.version});
  const received=await sb.wait('chat.message');assert.equal(received.message.text,'<script>alert(1)</script>');assert.equal(received.message.playerId,a.state.me);
  sa.tx({type:'chat.send',clientMessageId:'message-0001',text:'different',version:snap.version});await sa.wait('chat.ack',e=>e.duplicate);assert.equal((await req(path+'/messages',undefined,a.token)).body.messages.length,1);
  assert.equal(sc.events.filter(e=>e.type==='chat.message').length,0);
  sa.tx({type:'voice.join'});sb.tx({type:'voice.join'});await sa.wait('presence.changed',e=>e.players.filter(p=>p.voice).length===2);
  sa.tx({type:'voice.signal',to:b.body.state.me,signal:{description:{type:'offer',sdp:'test'}}});assert.equal((await sb.wait('voice.signal')).from,a.state.me);
  sa.tx({type:'voice.signal',to:other.state.me,signal:{description:{type:'offer',sdp:'private'}}});await new Promise(r=>setTimeout(r,40));assert.equal(sc.events.filter(e=>e.type==='voice.signal').length,0);
  assert.equal((await req(path+'/voice-credentials',{},a.token)).body.iceTransportPolicy,'relay');
  await req(path+'/communication-settings',{playerId:b.body.state.me,blocked:true},a.token);await sb.wait('access.revoked');assert.equal((await req(path+'/messages',undefined,b.body.token)).status,403);
  await req(path+'/communication-settings',{clear:true},a.token);const cleared=await sa.wait('chat.cleared');assert.equal(cleared.version,2);
  sa.tx({type:'chat.send',clientMessageId:'old-message-1',text:'old',version:1});await sa.wait('error');
  sa.tx({type:'chat.send',clientMessageId:'new-message-2',text:'saved',version:2});await sa.wait('chat.ack',e=>e.message.text==='saved');
  const revision=(await req(path,undefined,a.token)).body.revision;assert.equal(revision,b.body.state.revision);
  await stop();await start();
  const history=(await req(path+'/messages',undefined,a.token)).body;assert.equal(history.messages.length,1);assert.equal(history.messages[0].text,'saved');assert.equal(history.version,2);
  assert.equal((await req(path+'/communication-ticket',{},b.body.token)).status,403);
  assert.ok(readFileSync(join(dir,'chat.sqlite')).subarray(0,15).toString().startsWith('SQLite format 3'));
  assert.equal(logs,'');
 }finally{await stop();}
});

test('account-bound invitation rejects another account and survives login/resume', {timeout:15000},async()=>{
 const dir=mkdtempSync(join(tmpdir(),'aetherii-invite-account-')),base='http://127.0.0.1:14290';
 const proc=spawn(process.execPath,['server/start.mjs','--production','--port','14290','--host','127.0.0.1'],{env:{...process.env,PUBLIC_URL:base,AETHERII_DATA_DIR:dir},stdio:'pipe'});
 await new Promise((r,j)=>{proc.stdout.on('data',b=>{if(b.toString().includes('Kroniki Aetherii:'))r();});proc.once('error',j);});
 const req=async(path,body,token,cookie)=>{const r=await fetch(base+path,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`} :{}),...(cookie?{Cookie:cookie}:{})},body:body===undefined?undefined:JSON.stringify(body)});return {status:r.status,body:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};};
 try{
 const owner=await req('/api/auth/register',{email:'owner@example.com',name:'Owner',password:'long-password'}),target=await req('/api/auth/register',{email:'target@example.com',name:'Target',password:'long-password'});
 const a=(await req('/api/rooms',{name:'Owner'},undefined,owner.cookie)).body,path='/api/rooms/'+a.state.code;
 const inv=(await req(path+'/invitations',{accountId:target.body.user.id},a.token,owner.cookie)).body;
 const staged=await req(path+'/invitation-context',{secret:inv.secret});
 const stranger=await req('/api/auth/register',{email:'stranger@example.com',name:'Stranger',password:'long-password'});
 assert.equal((await req(path+'/join',{},undefined,staged.cookie+'; '+stranger.cookie)).status,403);
 const joined=await req(path+'/join',{},undefined,staged.cookie+'; '+target.cookie);assert.equal(joined.status,201);assert.equal(joined.body.state.accountLinked,true);
 const resumed=await req('/api/account/resume',{code:a.state.code},undefined,target.cookie);assert.equal(resumed.body.token,joined.body.token);
 assert.equal((await req(path+'/messages',undefined,joined.body.token)).status,401);
 const ticket=await req(path+'/communication-ticket',{},joined.body.token,target.cookie);
 const ws=new WebSocket(base.replace('http','ws')+path+'/communication',{headers:{Origin:base,Cookie:target.cookie}});
 await new Promise((resolve,reject)=>{ws.once('open',()=>ws.send(JSON.stringify({type:'auth',ticket:ticket.body.ticket})));ws.on('message',data=>{if(JSON.parse(data).type==='chat.snapshot')resolve();});ws.once('error',reject);});
 await req('/api/auth/logout',{},undefined,target.cookie);
 const closed=new Promise(resolve=>ws.once('close',resolve));ws.send(JSON.stringify({type:'voice.join'}));await closed;
 assert.equal((await req(path+'/messages',undefined,joined.body.token,target.cookie)).status,401);
 }finally{await new Promise(r=>{proc.once('exit',r);proc.kill('SIGTERM');});}
});
