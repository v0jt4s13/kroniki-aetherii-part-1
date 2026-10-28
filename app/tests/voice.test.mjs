import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,rmSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
const output=mkdtempSync(join(tmpdir(),'aetherii-voice-test-'));
execFileSync(process.execPath,[fileURLToPath(new URL('../node_modules/typescript/bin/tsc',import.meta.url)),'--ignoreConfig','--target','es2022','--module','es2022','--skipLibCheck','--outDir',output,fileURLToPath(new URL('../src/voice.ts',import.meta.url))]);
const source=readFileSync(join(output,'voice.js'),'utf8');
rmSync(output,{recursive:true,force:true});
const {VoiceSession}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
test('push-to-talk never starts after release or close while permission is pending; mute survives peer replacement',async()=>{
 const audios=[],pcs=[],track={enabled:true,stop(){this.stopped=true;}},stream={getAudioTracks:()=>[track],getTracks:()=>[track]};let permission;
 const saved={Audio:globalThis.Audio,RTCPeerConnection:globalThis.RTCPeerConnection,navigator:globalThis.navigator,MediaStream:globalThis.MediaStream};
 globalThis.Audio=class{constructor(){audios.push(this);}play(){return Promise.resolve();}pause(){}};
 globalThis.RTCPeerConnection=class{constructor(){this.signalingState='stable';this.sender={replaceTrack:async()=>{}};pcs.push(this);}addTransceiver(){} getSenders(){return [this.sender];}close(){this.signalingState='closed';}setConfiguration(){}};
 globalThis.MediaStream=class{};
 Object.defineProperty(globalThis,'navigator',{configurable:true,value:{mediaDevices:{getUserMedia:()=>new Promise(r=>permission=r)}}});
 const sessions=[];
 try{
  const states=[];const s=new VoiceSession('a',{},()=>{},['b'],()=>{},v=>states.push(v),async()=>({iceServers:[]}));sessions.push(s);
  s.members(['a','b']);assert.equal(audios[0].muted,true);
  const start=s.startMic();s.stopMic();permission(stream);await start;assert.equal(track.enabled,false);assert.ok(!states.includes(true));
  await s.startMic();assert.equal(track.enabled,true);s.stopMic();assert.equal(track.enabled,false);
  s.members(['a']);s.members(['a','b']);assert.equal(audios[1].muted,true);s.mute('b',false);assert.equal(audios[1].muted,false);
  s.close();assert.equal(track.stopped,true);
  track.stopped=false;const late=new VoiceSession('a',{},()=>{},[],()=>{},()=>{},async()=>({iceServers:[]}));sessions.push(late);
  const pending=late.startMic();late.close();permission(stream);await pending;assert.equal(track.stopped,true);assert.equal(track.enabled,false);
 }finally{for(const s of sessions)s.close();for(const [k,v]of Object.entries(saved))Object.defineProperty(globalThis,k,{configurable:true,writable:true,value:v});}
});
