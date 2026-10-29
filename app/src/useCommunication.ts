import { tr, responseError } from './i18n';
import { useEffect, useRef, useState } from 'react';
import { appPath } from './app-path';
import { VoiceSession } from './voice';
import type { State } from './game-types';
export interface ChatMessage {id:string;sequence:number;playerId:string;text:string;createdAt:number;clientMessageId:string}
type Pending = {clientMessageId:string;text:string;version:number;failed:boolean};
export function useCommunication(state:State|null, token:string, visible:boolean, atEnd:boolean) {
  const enabled=Boolean(state?.communication?.enabled),code=state?.code,me=state?.me;
  const [messages,setMessages]=useState<ChatMessage[]>([]),[pending,setPending]=useState<Pending[]>([]),[online,setOnline]=useState(false),[error,setError]=useState<string | Error>('');
  const [presence,setPresence]=useState<{playerId:string;voice:boolean;mic:boolean}[]>([]),[version,setVersion]=useState(1),[read,setRead]=useState(0),[more,setMore]=useState(false),[unread,setUnread]=useState(0);
  const [joined,setJoined]=useState(false),[mic,setMic]=useState(false),[continuous,setContinuous]=useState(false),[muted,setMuted]=useState<string[]>([]),[joining,setJoining]=useState(false),[devices,setDevices]=useState<MediaDeviceInfo[]>([]),[device,setDevice]=useState(''),[speaking,setSpeaking]=useState<string[]>([]);
  const ws=useRef<WebSocket|null>(null),voice=useRef<VoiceSession|null>(null),visibleRef=useRef(visible),pendingRef=useRef(pending),readRef=useRef(read),versionRef=useRef(version),mutedRef=useRef(muted),generation=useRef(0);
  visibleRef.current=visible;pendingRef.current=pending;readRef.current=read;versionRef.current=version;mutedRef.current=muted;
  const storageKey=`aetherii:mute:${code}:${me}`;
  async function request(path:string,data?:unknown){const r=await fetch(appPath(`/api/rooms/${code}/${path}`),{method:data===undefined?'GET':'POST',headers:{Authorization:`Bearer ${token}`,...(data!==undefined?{'Content-Type':'application/json'}:{})},body:data===undefined?undefined:JSON.stringify(data),signal:AbortSignal.timeout(15000)});const b=await r.json();if(!r.ok)throw responseError(b, tr("ui.could_not_connect_to_chat"));return b;}
  function send(e:unknown){if(ws.current?.readyState===WebSocket.OPEN){ws.current.send(JSON.stringify(e));return true;}return false;}
  function stopMic(){voice.current?.stopMic();setContinuous(false);setMic(false);}
  function leave(){generation.current++;voice.current?.close();voice.current=null;setJoined(false);setJoining(false);setContinuous(false);setMic(false);send({type:'voice.leave'});}
  useEffect(()=>{if(!visible)stopMic();},[visible]);
  useEffect(()=>{
    const stop=()=>stopMic();const hidden=()=>{if(document.hidden)stop();};window.addEventListener('blur',stop);document.addEventListener('visibilitychange',hidden);return()=>{window.removeEventListener('blur',stop);document.removeEventListener('visibilitychange',hidden);};
  },[]);
  useEffect(()=>{
    setMessages([]);setPending([]);setRead(0);setUnread(0);setError('');setPresence([]);
    try{const saved=JSON.parse(localStorage.getItem(storageKey)||'[]');setMuted(Array.isArray(saved)?saved.filter(x=>typeof x==='string'):[]);}catch{setMuted([]);}
    if(!enabled||!code||!me)return;
    let disposed=false,timer:ReturnType<typeof setTimeout>,socket:WebSocket|null=null,attempt=0;
    const append=(m:ChatMessage)=>setMessages(old=>old.some(x=>x.id===m.id)?old:[...old,m].sort((a,b)=>a.sequence-b.sequence));
    async function connect(){
      try{
        const {ticket}=await request('communication-ticket',{});if(disposed)return;
        const u=new URL(appPath(`/api/rooms/${code}/communication`));u.protocol=u.protocol==='https:'?'wss:':'ws:';socket=new WebSocket(u);ws.current=socket;
        socket.onopen=()=>socket!.send(JSON.stringify({type:'auth',ticket}));
        socket.onmessage=e=>{
          if(disposed)return;const b=JSON.parse(e.data);
          if(b.type==='chat.snapshot'){
            attempt=0;setOnline(true);setVersion(b.version);versionRef.current=b.version;setRead(b.lastRead);readRef.current=b.lastRead;setMore(b.hasMore);setUnread(b.unreadCount||0);
            // Replace with a contiguous recent page; older pages remain available via pagination.
            setMessages(b.messages);
            for(const p of pendingRef.current)if(!p.failed&&p.version===b.version)send({type:'chat.send',...p});else if(p.version!==b.version)setPending(old=>old.filter(x=>x.clientMessageId!==p.clientMessageId));
          }else if(b.type==='chat.message'||b.type==='chat.ack'){
            if(b.version<versionRef.current)return;append(b.message);if(b.type==='chat.message'&&b.message.playerId!==me)setUnread(n=>n+1);setPending(old=>old.filter(p=>p.clientMessageId!==b.message.clientMessageId));
          }else if(b.type==='chat.read'){setRead(old=>Math.max(old,b.sequence));setUnread(b.unreadCount||0);
          }else if(b.type==='chat.cleared'){setMessages([]);setPending([]);setVersion(b.version);versionRef.current=b.version;setRead(0);setUnread(0);setMore(false);
          }else if(b.type==='presence.changed'){
            setPresence(b.players);voice.current?.members(b.players.filter((p:{voice:boolean})=>p.voice).map((p:{playerId:string})=>p.playerId));
          }else if(b.type==='voice.signal'){voice.current?.receive(b.from,b.signal);
          }else if(b.type==='voice.replaced'){leave();
          }else if(b.type==='access.revoked'){setMessages([]);setPending([]);leave();setError(tr("ui.the_host_revoked_your_chat_access"));
          }else if(b.type==='error'){setError(responseError(b));if(b.clientMessageId)setPending(old=>old.map(p=>p.clientMessageId===b.clientMessageId?{...p,failed:true}:p));}
        };
        socket.onclose=()=>{if(disposed)return;setOnline(false);setPresence([]);setMore(false);leave();if(!disposed){timer=setTimeout(connect,Math.min(30000,1000*2**attempt++));}};
        socket.onerror=()=>socket?.close();
      }catch(e){if(!disposed){setError(e as Error);timer=setTimeout(connect,Math.min(30000,1000*2**attempt++));}}
    }
    void connect();
    return()=>{disposed=true;clearTimeout(timer);socket?.close();ws.current=null;leave();setOnline(false);};
  },[enabled,code,me,token]);
  useEffect(()=>{if(!visible||!atEnd||!online||document.hidden)return;const last=messages.at(-1)?.sequence||0;if(last>readRef.current){setRead(last);setUnread(0);readRef.current=last;send({type:'chat.read',sequence:last});}},[messages,visible,atEnd,online]);
  async function refreshDevices(){try{setDevices((await navigator.mediaDevices.enumerateDevices()).filter(d=>d.kind==='audioinput'));}catch{/* default microphone remains available */}}
  async function join(){
    if(joining||joined)return;const g=++generation.current;setJoining(true);setError('');
    try{
      if(!window.isSecureContext||!navigator.mediaDevices)throw Error(tr("ui.voice_requires_https_and_a_browser_that_supports_microphones"));
      const cfg=await request('voice-credentials',{});if(g!==generation.current||!visibleRef.current)return;
      const session=new VoiceSession(me!,cfg,(to,signal)=>send({type:'voice.signal',to,signal}),mutedRef.current,text=>{setError(tr(text));setContinuous(false);},on=>{setMic(on);if(on)void refreshDevices();send({type:'voice.mic',enabled:on});},()=>request('voice-credentials',{}),setSpeaking);
      voice.current=session;setJoined(true);void refreshDevices();send({type:'voice.join'});
    }catch(e){setError(e as Error);}finally{if(g===generation.current)setJoining(false);}
  }
  function mute(id:string){const next=muted.includes(id)?muted.filter(x=>x!==id):[...muted,id];setMuted(next);mutedRef.current=next;voice.current?.mute(id,next.includes(id));try{localStorage.setItem(storageKey,JSON.stringify(next));}catch{/* memory still works */}}
  function submit(text:string){if(!online||state?.communication?.closed||!text.trim())return false;const p={clientMessageId:crypto.randomUUID(),text:text.trim(),version,failed:false};setPending(old=>[...old,p]);send({type:'chat.send',...p});return true;}
  function retry(id:string){const p=pending.find(x=>x.clientMessageId===id);if(p&&online){setPending(old=>old.map(x=>x.clientMessageId===id?{...x,failed:false}:x));send({type:'chat.send',...p});}}
  async function older(){try{const b=await request(`messages?before=${messages[0]?.sequence||Number.MAX_SAFE_INTEGER}`);if(b.version<versionRef.current)return;if(b.version!==versionRef.current){setMessages(b.messages);setVersion(b.version);}else setMessages(old=>[...new Map([...b.messages,...old].map((m:ChatMessage)=>[m.id,m])).values()].sort((a,b)=>a.sequence-b.sequence));setMore(b.hasMore);}catch(e){setError(e as Error);}}
  return {messages,pending,online,error,setError,presence,more,older,joined,joining,mic,continuous,muted,mute,join,leave,submit,retry,devices,device,speaking,selectDevice:async(id:string)=>{stopMic();setDevice(id);await voice.current?.selectDevice(id);},unread,
    press:()=>{if(!continuous&&visibleRef.current)void voice.current?.startMic();},release:()=>{if(!continuous)voice.current?.stopMic();},
    toggleContinuous:()=>{if(continuous){stopMic();}else if(visibleRef.current){setContinuous(true);void voice.current?.startMic();}},resume:()=>voice.current?.resume(),
    settings:async(data:unknown)=>{try{await request('communication-settings',data);}catch(e){setError(e as Error);}}
  };
}
