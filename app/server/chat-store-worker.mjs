import { parentPort, workerData } from 'node:worker_threads';
import { existsSync, readFileSync, openSync, writeFileSync, fsyncSync, closeSync, renameSync } from 'node:fs';
import initSqlJs from 'sql.js';
const SQL = await initSqlJs();
const path = workerData.path;
let db = new SQL.Database(existsSync(path) ? readFileSync(path) : undefined);
db.run(`CREATE TABLE IF NOT EXISTS messages (sequence INTEGER PRIMARY KEY AUTOINCREMENT, room TEXT NOT NULL, player TEXT NOT NULL, id TEXT NOT NULL, created INTEGER NOT NULL, text TEXT NOT NULL, client TEXT NOT NULL, version INTEGER NOT NULL, UNIQUE(room,player,client));
CREATE INDEX IF NOT EXISTS messages_room ON messages(room,sequence);
CREATE TABLE IF NOT EXISTS rooms (room TEXT PRIMARY KEY, version INTEGER NOT NULL DEFAULT 1);
CREATE TABLE IF NOT EXISTS reads (room TEXT, player TEXT, sequence INTEGER NOT NULL, PRIMARY KEY(room,player));`);
const rows = (sql, params=[]) => { const s=db.prepare(sql); try { s.bind(params); const out=[]; while(s.step()) out.push(s.getAsObject()); return out; } finally {s.free();} };
function persist() { const fd=openSync(path+'.tmp','w',0o600); try {writeFileSync(fd,Buffer.from(db.export())); fsyncSync(fd);} finally {closeSync(fd);} renameSync(path+'.tmp',path); }
function prune(){db.run('DELETE FROM messages WHERE created < ?',[Date.now()-30*86400000]);persist();}
prune();
parentPort.postMessage({ready:true});
const retention=setInterval(()=>{try{prune();}catch{/* reads still exclude expired rows */}},3600000);retention.unref();
function version(room) { db.run('INSERT OR IGNORE INTO rooms(room) VALUES (?)',[room]); return rows('SELECT version FROM rooms WHERE room=?',[room])[0].version; }
const message = r => ({ sequence:r.sequence, playerId:r.player, id:r.id, createdAt:r.created, text:r.text, clientMessageId:r.client });
parentPort.on('message', ({id,op,args:a}) => {
  const backup = db.export();
  try {
    let result;
    const v=version(a.room);
    const cutoff=Date.now()-30*86400000;
    db.run('DELETE FROM messages WHERE created < ?',[cutoff]);
    if(op==='history') {
      const all=rows('SELECT * FROM messages WHERE room=? AND sequence < ? ORDER BY sequence DESC LIMIT 51',[a.room,a.before || Number.MAX_SAFE_INTEGER]);
      const latest=rows('SELECT COALESCE(MAX(sequence),0) AS n FROM messages WHERE room=?',[a.room])[0].n;
      const lastRead=rows('SELECT sequence FROM reads WHERE room=? AND player=?',[a.room,a.player])[0]?.sequence||0;
      const unreadCount=rows('SELECT COUNT(*) AS n FROM messages WHERE room=? AND sequence>? AND player<>?',[a.room,lastRead,a.player])[0].n;
      result={unreadCount,version:v,messages:all.slice(0,50).reverse().map(message),hasMore:all.length>50,cursor:latest,lastRead:rows('SELECT sequence FROM reads WHERE room=? AND player=?',[a.room,a.player])[0]?.sequence||0};
    } else if(op==='send') {
      if(a.version!==v) throw Error('Historia została wyczyszczona. Odśwież rozmowę.');
      let r=rows('SELECT * FROM messages WHERE room=? AND player=? AND client=?',[a.room,a.player,a.client])[0];
      const duplicate=Boolean(r);
      if(!r) {
        if(rows('SELECT COUNT(*) AS n FROM messages')[0].n>=100000) throw Error('Historia jest pełna. Gospodarz może ją wyczyścić.');
        db.run('INSERT INTO messages(room,player,id,created,text,client,version) VALUES (?,?,?,?,?,?,?)',[a.room,a.player,a.id,Date.now(),a.text,a.client,v]);
        r=rows('SELECT * FROM messages WHERE room=? AND player=? AND client=?',[a.room,a.player,a.client])[0];
      }
      result={message:message(r),duplicate,version:v};
    } else if(op==='read') {
      const max=rows('SELECT COALESCE(MAX(sequence),0) AS n FROM messages WHERE room=?',[a.room])[0].n;
      db.run('INSERT INTO reads VALUES (?,?,?) ON CONFLICT(room,player) DO UPDATE SET sequence=MAX(sequence,excluded.sequence)',[a.room,a.player,Math.min(a.sequence,max)]); const lastRead=rows('SELECT sequence FROM reads WHERE room=? AND player=?',[a.room,a.player])[0].sequence;result={sequence:lastRead,unreadCount:rows('SELECT COUNT(*) AS n FROM messages WHERE room=? AND sequence>? AND player<>?',[a.room,lastRead,a.player])[0].n};
    } else if(op==='clear') {
      db.run('DELETE FROM messages WHERE room=?',[a.room]); db.run('UPDATE rooms SET version=version+1 WHERE room=?',[a.room]); db.run('DELETE FROM reads WHERE room=?',[a.room]); result={version:v+1};
    } else throw Error('Nieznana operacja.');
    persist(); parentPort.postMessage({id,result});
  } catch(e) { db.close(); db=new SQL.Database(backup); parentPort.postMessage({id,error:e.message}); }
});
