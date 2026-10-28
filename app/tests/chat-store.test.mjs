import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,renameSync,readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import initSqlJs from 'sql.js';
import {createChatStore} from '../server/chat-store.mjs';
import {createInvitations} from '../server/invitations.mjs';

test('chat history pagination, read cursors, reset, failed write rollback and startup retention',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'aetherii-store-')),path=join(dir,'chat.sqlite');let store=createChatStore(path);
 try{
  for(let i=0;i<55;i++)await store.run('send',{room:'ABC123',player:i%2?'a':'b',client:`message-${i}`,id:`id-${i}`,text:`text-${i}`,version:1});
  const page=await store.run('history',{room:'ABC123',player:'a'});assert.equal(page.messages.length,50);assert.equal(page.hasMore,true);assert.equal(page.unreadCount,28);
  const old=await store.run('history',{room:'ABC123',player:'a',before:page.messages[0].sequence});assert.equal(old.messages.length,5);assert.equal(old.hasMore,false);
  await store.run('read',{room:'ABC123',player:'a',sequence:page.cursor});assert.equal((await store.run('history',{room:'ABC123',player:'a'})).unreadCount,0);
  const other=await store.run('history',{room:'ZZZ999',player:'a'});assert.deepEqual(other.messages,[]);
  renameSync(dir,dir+'-away');
  await assert.rejects(store.run('send',{room:'ABC123',player:'a',client:'failed-message',id:'failed',text:'must rollback',version:1}));
  renameSync(dir+'-away',dir);
  assert.equal((await store.run('history',{room:'ABC123',player:'a'})).messages.some(m=>m.id==='failed'),false);
  await store.close();
  const SQL=await initSqlJs(),db=new SQL.Database(readFileSync(path));db.run('UPDATE messages SET created=?',[Date.now()-31*86400000]);writeFileSync(path,Buffer.from(db.export()));db.close();
  store=createChatStore(path);assert.equal((await store.run('history',{room:'ABC123',player:'a'})).messages.length,0);
  await store.run('clear',{room:'ABC123'});
  await assert.rejects(store.run('send',{room:'ABC123',player:'a',client:'old-generation',id:'old',text:'old',version:1}));
 }finally{await store.close();}
});

test('invitation expiration, revocation and switching invitation contexts do not grant another identity',()=>{
 const inv=createInvitations({basePath:'/game',secure:true}),g={phase:'lobby',players:[]},headers={};const res={setHeader:(k,v)=>headers[k]=v};
 const first=inv.create(g);inv.stage({headers:{}},res,g,first.secret);const req={headers:{cookie:headers['Set-Cookie'].split(';')[0]}};
 g.invitations[0].expires=Date.now()-1;assert.throws(()=>inv.inspect(req,g));
 const second=inv.create(g,'target-account');inv.stage(req,res,g,second.secret);
 assert.throws(()=>inv.inspect(req,g,{id:'wrong-account'}));assert.equal(g.invitations[0].used,undefined);
 const joined={id:'new-player',accountId:'target-account',token:'private'};inv.inspect(req,g,{id:'target-account'}).consume(joined);g.players.push(joined);
 assert.equal(inv.inspect(req,g,{id:'target-account'}).existing,joined);
 assert.throws(()=>inv.inspect({headers:{cookie:'aetherii_invite=another-browser'}},g,{id:'target-account'}));
 assert.match(headers['Set-Cookie'],/HttpOnly; SameSite=Lax/);assert.match(headers['Set-Cookie'],/Secure/);
});
