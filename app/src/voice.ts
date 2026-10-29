type VoiceErrorKey = "ui.could_not_renew_the_voice_connection_leave_and_rejoin_voice_chat" | "ui.your_browser_paused_audio_press_resume_audio" | "ui.could_not_establish_voice_chat_try_joining_again" | "ui.voice_connection_interrupted_try_joining_again" | "ui.cannot_play_audio_check_your_browser_settings" | "ui.microphone_disconnected_connect_it_and_try_again" | "ui.cannot_enable_the_microphone_check_permission_and_the_selected_de";
type Peer = { pc: RTCPeerConnection; making: boolean; ignore: boolean; settingAnswer: boolean; audio: HTMLAudioElement; pending: RTCIceCandidateInit[]; chain: Promise<void> };
export class VoiceSession {
  private peers = new Map<string, Peer>();
  private stream: MediaStream | null = null;
  private acquiring: Promise<MediaStream> | null = null;
  private active = true;
  private device = '';
  private acquisition = 0;
  private wanted = false;
  private muted: Set<string>;
  private context: AudioContext | null = null;
  private meters = new Map<string,{analyser:AnalyserNode;source:MediaStreamAudioSourceNode;data:Uint8Array<ArrayBuffer>}>();
  private meterTimer: ReturnType<typeof setInterval>;
  private refreshTimer: ReturnType<typeof setInterval>;
  constructor(private me: string, private config: RTCConfiguration, private signal: (to: string, signal: unknown) => void, muted: string[], private onError: (text: VoiceErrorKey) => void, private onMic: (active: boolean) => void, private credentials: () => Promise<{iceServers: RTCIceServer[]}>, private onSpeaking: (ids: string[]) => void = () => {}) {
    this.muted = new Set(muted);
    try{if(typeof AudioContext!=='undefined')this.context=new AudioContext();}catch{/* voice itself works without meters */}
    this.meterTimer=setInterval(()=>{const ids:string[]=[];for(const [id,m]of this.meters){if(id===this.me&&!this.wanted)continue;m.analyser.getByteTimeDomainData(m.data);const rms=Math.sqrt(m.data.reduce((n,v)=>n+((v-128)/128)**2,0)/m.data.length);if(rms>.025)ids.push(id);}this.onSpeaking(ids);},200);
    this.refreshTimer=setInterval(()=>{void this.credentials().then(c=>{if(!this.active)return;this.config={...this.config,iceServers:c.iceServers};for(const p of this.peers.values()){p.pc.setConfiguration(this.config);p.pc.restartIce();}}).catch(()=>{this.stopMic();this.onError("ui.could_not_renew_the_voice_connection_leave_and_rejoin_voice_chat");});}, 25*60*1000);
  }
  private meter(id:string,stream:MediaStream){if(!this.context)return;this.meters.get(id)?.source.disconnect();const source=this.context.createMediaStreamSource(stream),analyser=this.context.createAnalyser();analyser.fftSize=256;source.connect(analyser);this.meters.set(id,{source,analyser,data:new Uint8Array(256)});}
  private peer(id: string) {
    let p=this.peers.get(id); if(p)return p;
    const pc=new RTCPeerConnection(this.config), audio=new Audio();
    audio.autoplay=true; audio.muted=this.muted.has(id);
    p={pc,audio,making:false,ignore:false,settingAnswer:false,pending:[],chain:Promise.resolve()};this.peers.set(id,p);
    pc.addTransceiver('audio',{direction:'sendrecv'});
    if(this.stream) void pc.getSenders()[0].replaceTrack(this.stream.getAudioTracks()[0]);
    pc.onicecandidate=e=>{if(e.candidate)this.signal(id,{candidate:e.candidate.toJSON()});};
    pc.ontrack=e=>{audio.muted=this.muted.has(id);audio.srcObject=e.streams[0]||new MediaStream([e.track]);this.meter(id,audio.srcObject as MediaStream);void audio.play().catch(()=>this.onError("ui.your_browser_paused_audio_press_resume_audio"));};
    pc.onnegotiationneeded=async()=>{try{p!.making=true;await pc.setLocalDescription();if(this.active)this.signal(id,{description:pc.localDescription});}catch{if(this.active)this.onError("ui.could_not_establish_voice_chat_try_joining_again");}finally{p!.making=false;}};
    pc.onconnectionstatechange=()=>{if(pc.connectionState==='failed'&&this.active)pc.restartIce();};
    return p;
  }
  members(ids: string[]) { if(!this.active)return;for(const [id,p] of this.peers)if(!ids.includes(id)){p.pc.close();p.audio.pause();p.audio.srcObject=null;this.peers.delete(id);this.meters.get(id)?.source.disconnect();this.meters.delete(id);}for(const id of ids)if(id!==this.me)this.peer(id); }
  receive(id: string, signal: {description?: RTCSessionDescriptionInit;candidate?: RTCIceCandidateInit}) {
    if(!this.active)return;
    const p=this.peer(id);
    p.chain=p.chain.then(async()=>{
      if(!this.active||p.pc.signalingState==='closed')return;
      const pc=p.pc;
      if(signal.description){
        const d=signal.description,ready=!p.making&&(pc.signalingState==='stable'||p.settingAnswer);
        p.ignore=this.me<id&&d.type==='offer'&&!ready;if(p.ignore)return;
        p.settingAnswer=d.type==='answer';await pc.setRemoteDescription(d);p.settingAnswer=false;
        for(const c of p.pending.splice(0))await pc.addIceCandidate(c);
        if(d.type==='offer'){await pc.setLocalDescription();this.signal(id,{description:pc.localDescription});}
      }else if(signal.candidate&&!p.ignore){if(pc.remoteDescription)await pc.addIceCandidate(signal.candidate);else p.pending.push(signal.candidate);}
    }).catch(()=>{if(this.active)this.onError("ui.voice_connection_interrupted_try_joining_again");});
  }
  mute(id: string, value: boolean){if(value)this.muted.add(id);else this.muted.delete(id);const p=this.peers.get(id);if(p)p.audio.muted=value;}
  resume(){void this.context?.resume();for(const p of this.peers.values())void p.audio.play().catch(()=>this.onError("ui.cannot_play_audio_check_your_browser_settings"));}
  stopMic(){this.wanted=false;if(this.stream)for(const t of this.stream.getAudioTracks())t.enabled=false;this.onMic(false);}
  async selectDevice(id: string){this.stopMic();this.acquisition++;this.device=id;this.stream?.getTracks().forEach(t=>{t.onended=null;t.stop();});this.stream=null;this.acquiring=null;for(const p of this.peers.values())await p.pc.getSenders()[0].replaceTrack(null);}
  async startMic(){
    if(!this.active)return;this.wanted=true;void this.context?.resume();
    const acquisition=this.acquisition;
    try{
      if(!this.stream){
        this.acquiring??=navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true,...(this.device?{deviceId:{exact:this.device}}:{})},video:false}).then(s=>{for(const t of s.getAudioTracks())t.enabled=false;return s;});
        const s=await this.acquiring;
        if(!this.active||acquisition!==this.acquisition){s.getTracks().forEach(t=>t.stop());return;}
        this.stream=s;this.meter(this.me,s);
        for(const p of this.peers.values())await p.pc.getSenders()[0].replaceTrack(s.getAudioTracks()[0]);
      }
      // Permission may arrive after the user has released the push-to-talk button.
      if(!this.wanted||!this.active)return;
      for(const t of this.stream.getAudioTracks()){t.enabled=true;t.onended=()=>{this.stream=null;this.acquiring=null;this.stopMic();this.onError("ui.microphone_disconnected_connect_it_and_try_again");};}
      this.onMic(true);
    }catch{this.acquiring=null;this.wanted=false;this.onMic(false);this.onError("ui.cannot_enable_the_microphone_check_permission_and_the_selected_de");}
  }
  close(){this.active=false;this.stopMic();clearInterval(this.refreshTimer);clearInterval(this.meterTimer);void this.context?.close().catch(()=>{});this.context=null;this.meters.clear();this.onSpeaking([]);this.stream?.getTracks().forEach(t=>t.stop());for(const p of this.peers.values()){p.pc.close();p.audio.pause();p.audio.srcObject=null;}this.peers.clear();}
}
