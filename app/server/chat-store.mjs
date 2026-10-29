import { message, source, LocalizedError } from '../i18n/server.mjs';
import { Worker } from 'node:worker_threads';
export function createChatStore(path) {
  const worker=new Worker(new URL('./chat-store-worker.mjs',import.meta.url),{workerData:{path}});
  let next=0, failed, ready=false; const pending=new Map();
  worker.on('message',m=>{if(m.ready){ready=true;return;}const p=pending.get(m.id); if(!p)return; pending.delete(m.id); m.error?p.reject(Error(m.error)):p.resolve(m.result);});
  const fail=e=>{failed=e; for(const p of pending.values())p.reject(e); pending.clear();};
  worker.on('error',fail); worker.on('exit',code=>fail(new LocalizedError(message("errors.chat_storage_unavailable_0", [code]))));
  return {ready:()=>ready&&!failed,run(op,args){if(failed)return Promise.reject(failed); if(pending.size>=100)return Promise.reject(new LocalizedError(message("errors.chat_is_busy_try_again"))); return new Promise((resolve,reject)=>{const id=++next;pending.set(id,{resolve,reject});worker.postMessage({id,op,args});});},close:()=>worker.terminate()};
}
