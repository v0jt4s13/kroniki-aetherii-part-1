import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,chmodSync,symlinkSync,existsSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawn} from 'node:child_process';
const repo=new URL('../../',import.meta.url),COMMIT='b'.repeat(40),DIGEST='sha256:'+'c'.repeat(64);
const mock=String.raw`#!/usr/bin/env python3
import sys,os,json,pathlib,tarfile,shutil
r=pathlib.Path(os.environ['FIXTURE']);name=pathlib.Path(sys.argv[0]).name;a=sys.argv[1:]
with (r/'calls.jsonl').open('a') as f:f.write(json.dumps([name]+a)+'\n')
v=json.load(open(r/'app/package.json'))['version']
if name=='git':
 if a[:2]==['rev-parse','--show-toplevel']:print(r)
 elif a[:2]==['branch','--show-current']:print('main')
 elif a[:2]==['rev-parse','--git-path']:print(r/'release.lock')
 elif a[:2]==['rev-parse','HEAD']:print(('d' if (r/'advanced').exists() else 'b' if (r/'committed').exists() else 'a')*40)
 elif a and a[0]=='show':print(json.dumps({'version':v}))
 elif a and a[0]=='archive':
  with tarfile.open(fileobj=sys.stdout.buffer,mode='w|') as archive:
   def tracked_only(entry):
    return None if entry.name.startswith(('app/dist','app/node_modules')) else entry
   for name in ['app','deploy']:archive.add(r/name,arcname=name,filter=tracked_only)
 elif a and a[0]=='status':
  if os.environ.get('DIRTY'):print(' M unrelated.txt')
  elif v!='0.1.0' and not (r/'committed').exists():
   if '-z' in a:sys.stdout.buffer.write(b' M app/package.json\x00 M app/package-lock.json\x00')
   else:print(' M app/package.json\n M app/package-lock.json')
 elif a and a[0]=='commit':(r/'committed').touch()
 sys.exit(0)
if name=='npm':
 if '--prefix' in a:
  app=pathlib.Path(a[a.index('--prefix')+1])
  if a[-2:]==['run','test:prefix']:
   (app/'dist/client').mkdir(parents=True,exist_ok=True)
   (app/'dist/client/play.html').write_text('built before API tests')
  if a[-1]=='test' and not (app/'dist/client/play.html').is_file():
   print('Production API tests require a prior build',file=sys.stderr);sys.exit(1)
 if 'test' in a and os.environ.get('FAIL_TESTS'):sys.exit(1)
 sys.exit(0)
if name=='sudo':
 assert a[:3]==['-u','operator','-H'] and a[3]=='gh'
 os.execvp('gh',a[3:])
if name=='gh':
 remote=r/'github';remote.mkdir(exist_ok=True);meta=remote/'release.json';assets=remote/'assets';assets.mkdir(exist_ok=True)
 if a[:2]==['auth','status']:sys.exit(0)
 if a and a[0]=='api':
  if '/releases?' in a[1]:
   assert '--paginate' in a and '--jq' in a and chr(92) not in a[a.index('--jq')+1]
   if meta.exists():print(meta.read_text())
  elif '/git/ref/tags/' in a[1]:
   if os.environ.get('CONFLICTING_GITHUB_TAG') or (meta.exists() and not json.load(open(meta))['draft']):print(json.dumps({'object':{'type':'commit'}}))
   else:print('HTTP 404: Not Found',file=sys.stderr);sys.exit(1)
  elif '/commits/' in a[1]:
   if os.environ.get('CONFLICTING_GITHUB_TAG'):print('e'*40)
   elif meta.exists():print(json.load(open(meta))['target_commitish'])
   else:print('HTTP 404: Not Found',file=sys.stderr);sys.exit(1)
  else:
   if meta.exists() and not json.load(open(meta))['draft']:print(meta.read_text())
   else:print('HTTP 404: Not Found',file=sys.stderr);sys.exit(1)
 elif a[:2]==['release','create']:
  meta.write_text(json.dumps({'tag_name':a[2],'draft':True,'target_commitish':a[a.index('--target')+1],'assets':[]}))
 elif a[:2]==['release','upload']:
  if os.environ.get('FAIL_GITHUB_UPLOAD'):sys.exit(1)
  src=pathlib.Path(a[3]);shutil.copyfile(src,assets/src.name);m=json.load(open(meta));m['assets'].append({'name':src.name});meta.write_text(json.dumps(m))
 elif a[:2]==['release','download']:
  name=a[a.index('--pattern')+1];sys.stdout.buffer.write((assets/name).read_bytes())
 elif a[:2]==['release','edit']:
  m=json.load(open(meta));m['draft']=False;meta.write_text(json.dumps(m))
 sys.exit(0)
if name=='docker':
 if a and a[0]=='info':
  if '--format' in a:print('linux/x86_64')
 elif a[:3]==['buildx','imagetools','inspect']:
  if os.environ.get('REGISTRY_EXISTS'):sys.exit(0)
  print('manifest unknown',file=sys.stderr);sys.exit(1)
 elif a[:2]==['image','inspect']:print(json.dumps(['ghcr.io/v0jt4s13/kroniki-aetherii-part-1@sha256:'+'c'*64]))
 elif a and a[0]=='inspect':
  f=a[a.index('--format')+1]
  if '.State.Running' in f:print('true')
  elif '.Mounts' in f:print(r/'appdir/data')
  elif '.Labels' in f:print('b'*40 if 'revision' in f else v)
  elif '.Os' in f:print('linux/amd64')
  elif '.Image' in f:print('new-image' if (r/'deployed').exists() else 'old-image')
  elif '.Id' in f:print('new-image')
 elif a and a[0]=='push' and os.environ.get('FAIL_IMAGE_PUSH'):sys.exit(1)
 sys.exit(0)
if name=='curl':
 url=a[-1]
 if '/api/version' in url:print(json.dumps({'version':v}))
 elif '--write-out' in a:print('302' if url=='https://ops02.jdblayer.com/' else '200')
 else:print('{"ok":true}')
 sys.exit(0)
sys.exit(0)
`;
function fixture(t){
 const r=mkdtempSync(join(tmpdir(),'aetherii-release-fixture-'));t.after(()=>rmSync(r,{recursive:true,force:true}));
 for(const d of ['deploy','app','bin','manager/production_projects','appdir/data'])mkdirSync(join(r,d),{recursive:true});
 const p={name:'fixture',version:'0.1.0'};writeFileSync(join(r,'app/package.json'),JSON.stringify(p));writeFileSync(join(r,'app/package-lock.json'),JSON.stringify({version:p.version,packages:{'':p}}));
 writeFileSync(join(r,'mock.py'),mock);chmodSync(join(r,'mock.py'),0o755);
 for(const n of ['git','npm','docker','curl','nginx','systemctl','gh','sudo'])symlinkSync(join(r,'mock.py'),join(r,'bin',n));
 for(const n of ['01-publish-repo.sh','02-update-server.sh']){
  let s=readFileSync(new URL('deploy/'+n,repo),'utf8');
  // Test copies bypass identity checks; every external service is a local stub.
  s=n.startsWith('01')?s.replace('if (( EUID == 0 )); then','if false; then'):s.replace('(( EUID == 0 )) ||','true ||').replaceAll('/root/kroniki-aetherii-backups',join(r,'backups'));
  writeFileSync(join(r,'deploy',n),s);chmodSync(join(r,'deploy',n),0o755);
 }
 return r;
}
function run(r,s,args=[],env={}){return new Promise((resolve,reject)=>{let out='';const p=spawn('bash',[join(r,'deploy',s),...args],{env:{...process.env,FIXTURE:r,PATH:join(r,'bin')+':'+process.env.PATH,...env}});p.stdout.on('data',b=>out+=b);p.stderr.on('data',b=>out+=b);p.once('error',reject);p.once('exit',code=>resolve({code,out}));});}
const calls=r=>readFileSync(join(r,'calls.jsonl'),'utf8').trim().split('\n').filter(Boolean).map(x=>JSON.parse(x));

test('publisher bumps once, commits only version files and emits pinned bundle',async t=>{
 const r=fixture(t),x=await run(r,'01-publish-repo.sh');assert.equal(x.code,0,x.out);
 assert.equal(JSON.parse(readFileSync(join(r,'app/package.json'))).version,'0.1.1');
 const bundle=join(r,'.release','0.1.1-'+COMMIT.slice(0,12)),m=JSON.parse(readFileSync(join(bundle,'manifest.json')));
 assert.equal(m.commit,COMMIT);assert.equal(m.digest,DIGEST);assert.ok(existsSync(bundle+'.tar.gz'));assert.equal(existsSync(join(r,'.release/pending.json')),false);
 assert.deepEqual(calls(r).find(c=>c[0]==='git'&&c[1]==='add'),['git','add','--','app/package.json','app/package-lock.json']);
});
test('publisher resumes after push/test failures without double bump and refuses dirty work',async t=>{
 for(const env of [{FAIL_IMAGE_PUSH:'1'},{FAIL_TESTS:'1'}]){
  const r=fixture(t);assert.notEqual((await run(r,'01-publish-repo.sh',[],env)).code,0);
  const x=await run(r,'01-publish-repo.sh',['--resume'],env.FAIL_IMAGE_PUSH?{REGISTRY_EXISTS:'1'}:{});assert.equal(x.code,0,x.out);assert.equal(calls(r).filter(c=>c[0]==='docker'&&c[1]==='build').length,1);assert.equal(JSON.parse(readFileSync(join(r,'app/package.json'))).version,'0.1.1');assert.equal(calls(r).filter(c=>c[0]==='git'&&c[1]==='commit').length,1);
 }
 const r=fixture(t);assert.notEqual((await run(r,'01-publish-repo.sh',[],{DIRTY:'1'})).code,0);assert.equal(JSON.parse(readFileSync(join(r,'app/package.json'))).version,'0.1.0');
});
test('resume after a corrective commit builds the recorded release snapshot and keeps its version/SHA',async t=>{
 const r=fixture(t);assert.notEqual((await run(r,'01-publish-repo.sh',[],{FAIL_IMAGE_PUSH:'1'})).code,0);
 writeFileSync(join(r,'advanced'),'');
 const x=await run(r,'01-publish-repo.sh',['--resume']);assert.equal(x.code,0,x.out);
 const manifest=JSON.parse(readFileSync(join(r,'.release','0.1.1-'+COMMIT.slice(0,12),'manifest.json')));
 assert.equal(manifest.commit,COMMIT);assert.equal(manifest.version,'0.1.1');
 const log=calls(r);assert.ok(log.some(c=>c[0]==='git'&&c[1]==='archive'&&c[2]===COMMIT));
 const archivedTests=log.findIndex(c=>c[0]==='npm'&&c.at(-1)==='test'&&c.includes('--prefix')&&c[c.indexOf('--prefix')+1].includes('.release/source-'));
 const archivedBuild=log.findIndex(c=>c[0]==='npm'&&c.at(-1)==='test:prefix'&&c.includes('--prefix')&&c[c.indexOf('--prefix')+1].includes('.release/source-'));
 assert.ok(archivedBuild>=0&&archivedTests>archivedBuild,'A cold release snapshot must be built before its production API tests');
 assert.ok(log.filter(c=>c[0]==='docker'&&c[1]==='build').every(c=>c.at(-1).includes('.release/source-')));
 assert.equal(log.filter(c=>c[0]==='git'&&c[1]==='commit').length,1);
});
test('image smoke command initializes a real file-based SQLite worker without input-type inheritance',async t=>{
 const script=readFileSync(new URL('deploy/01-publish-repo.sh',repo),'utf8');
 const smoke=script.match(/run --rm --network none --entrypoint node "\$REF" -e '([\s\S]*?)' "\$VERSION"/);
 assert.ok(smoke,'Missing worker-compatible image smoke command');
 assert.ok(!smoke[1].includes('--input-type'));
 const r=mkdtempSync(join(tmpdir(),'aetherii-smoke-eval-'));t.after(()=>rmSync(r,{recursive:true,force:true}));
 mkdirSync(join(r,'dist/client'),{recursive:true});mkdirSync(join(r,'server'));
 writeFileSync(join(r,'package.json'),JSON.stringify({version:'0.1.1',type:'module'}));
 writeFileSync(join(r,'dist/client/play.html'),'<script src="./assets/game-test.js"></script><script>aetheriiTheme</script>');
 writeFileSync(join(r,'server/chat-store.mjs'),`export {createChatStore} from ${JSON.stringify(new URL('app/server/chat-store.mjs',repo).href)};`);
 const database=join(r,'chat.sqlite');
 const code=smoke[1].replace('"/tmp/release-chat.sqlite"',JSON.stringify(database));
 const x=await new Promise((resolve,reject)=>{let out='';const p=spawn(process.execPath,['-e',code,'0.1.1'],{cwd:r});p.stdout.on('data',b=>out+=b);p.stderr.on('data',b=>out+=b);p.once('error',reject);p.once('exit',code=>resolve({code,out}));});
 assert.equal(x.code,0,x.out);assert.ok(readFileSync(database).subarray(0,15).toString().startsWith('SQLite format 3'));
});
function serverFixture(t){
 const r=fixture(t),app=join(r,'appdir'),manager=join(r,'manager');writeFileSync(join(r,'committed'),'');writeFileSync(join(r,'app/package.json'),JSON.stringify({version:'0.1.1'}));
 writeFileSync(join(app,'data/rooms.json'),'{"keep":true}');writeFileSync(join(app,'.env'),'PUBLIC_URL=https://ops02.jdblayer.com/kroniki-aetherii\nGOOGLE_CLIENT_SECRET=test-secret-retained\n');writeFileSync(join(app,'nginx.conf'),'# --- moderacja standalone ---\nserver {}\n');writeFileSync(join(app,'docker-compose.yml'),'services: {}\n');
 const config=join(manager,'production_projects/kroniki-aetherii.env');writeFileSync(config,`APP_DIR="${app}"\nDOCKER_IMAGE="ghcr.io/v0jt4s13/kroniki-aetherii-part-1"\nDOCKER_IMAGE_TAG="previous-sha"\nDOCKER_BIND="127.0.0.1:4173"\nDOMAIN="ops02.jdblayer.com"\nNGINX_SITE="${app}/nginx.conf"\nNGINX_STRATEGY="prefix"\nURL_PREFIX="/kroniki-aetherii"\nDOCKER_CONTAINER_PORT=4173\nDOCKER_DATA_DIR="${app}/data"\nDOCKER_DATA_TARGET="/data"\nSERVICE_NAME="kroniki-aetherii"\n`);
 writeFileSync(join(manager,'production_manager.sh'),'#!/usr/bin/env bash\n# DOCKER_DATA_DIR NGINX_LOCATION_EXTRA\ntouch "$FIXTURE/deployed"\nif [[ "${FAIL_MANAGER:-}" == 1 ]]; then exit 1; fi\n');
 const manifest=join(r,'manifest.json');writeFileSync(manifest,JSON.stringify({schema:1,image:'ghcr.io/v0jt4s13/kroniki-aetherii-part-1',tag:COMMIT.slice(0,12),commit:COMMIT,version:'0.1.1',digest:DIGEST,platform:'linux/amd64'}));return{r,app,config,args:[manifest,'--manager-dir',manager]};
}
test('server backs up stopped data, preserves secrets and sets pinned tag and literal WS headers',async t=>{
 const f=serverFixture(t),x=await run(f.r,'02-update-server.sh',f.args);assert.equal(x.code,0,x.out);
 const c=readFileSync(f.config,'utf8');assert.ok(c.includes(`DOCKER_IMAGE_TAG="${COMMIT.slice(0,12)}@${DIGEST}"`));assert.ok(c.includes('Upgrade $http_upgrade;'));
 const env=readFileSync(join(f.app,'.env'),'utf8');assert.ok(env.includes('GOOGLE_CLIENT_SECRET=test-secret-retained'));assert.ok(env.includes('AETHERII_VOICE_ENABLED=false'));assert.ok(!x.out.includes('test-secret-retained'));
 assert.ok(existsSync(join(f.r,'backups')));assert.equal(readFileSync(join(f.app,'data/rooms.json'),'utf8'),'{"keep":true}');assert.ok(calls(f.r).some(c=>c[0]==='docker'&&c[1]==='exec'&&c.includes('-i')));
});
test('preflight is read-only; failed deploy restores config but never restores data or runs old code',async t=>{
 const f=serverFixture(t),before=readFileSync(f.config,'utf8');let x=await run(f.r,'02-update-server.sh',[...f.args,'--check-only']);assert.equal(x.code,0,x.out);assert.equal(readFileSync(f.config,'utf8'),before);assert.equal(existsSync(join(f.r,'backups')),false);
 assert.ok(!calls(f.r).some(c=>c[0]==='docker'&&['stop','pull','start'].includes(c[1])));
 x=await run(f.r,'02-update-server.sh',f.args,{FAIL_MANAGER:'1'});assert.notEqual(x.code,0);assert.equal(readFileSync(f.config,'utf8'),before);assert.equal(readFileSync(join(f.app,'data/rooms.json'),'utf8'),'{"keep":true}');assert.ok(!calls(f.r).some(c=>c[0]==='docker'&&c[1]==='start'));
 const b=serverFixture(t);writeFileSync(b.args[0],'{"schema":1,"image":"$(touch hacked)"}');x=await run(b.r,'02-update-server.sh',b.args);assert.notEqual(x.code,0);assert.equal(existsSync(join(b.r,'backups')),false);
});

test('sudo-like PATH with system Node 18 selects an installed NVM runtime before any release side effects',async t=>{
 const r=fixture(t),home=join(r,'home'),nvm=join(home,'.nvm'),bin=join(nvm,'versions/node/v22.20.0/bin');mkdirSync(bin,{recursive:true});
 writeFileSync(join(r,'bin/node'),'#!/usr/bin/env bash\nif [[ "${1:-}" == --version ]]; then echo v18.20.4; fi\nexit 1\n');chmodSync(join(r,'bin/node'),0o755);
 symlinkSync(process.execPath,join(bin,'node'));
 writeFileSync(join(nvm,'nvm.sh'),'nvm() { export PATH="$NVM_DIR/versions/node/v22.20.0/bin:$PATH"; }\n');
 const x=await run(r,'01-publish-repo.sh',['--check-runtime'],{HOME:home,NVM_DIR:nvm});assert.equal(x.code,0,x.out);assert.ok(x.out.includes(bin+'/node'),x.out);
 assert.equal(existsSync(join(r,'.release')),false);assert.equal(existsSync(join(r,'committed')),false);assert.ok(!calls(r).some(c=>['git','docker'].includes(c[0])));
 // Missing loader must still permit an already installed runtime.
 rmSync(join(nvm,'nvm.sh'));
 const fallback=await run(r,'01-publish-repo.sh',['--check-runtime'],{HOME:home,NVM_DIR:nvm});assert.equal(fallback.code,0,fallback.out);assert.ok(fallback.out.includes(bin+'/node'));
});

test('unsupported Node without NVM fails clearly before touching release state or Docker',async t=>{
 const r=fixture(t),home=join(r,'home');mkdirSync(home);
 writeFileSync(join(r,'bin/node'),'#!/usr/bin/env bash\nif [[ "${1:-}" == --version ]]; then echo v18.20.4; fi\nexit 1\n');chmodSync(join(r,'bin/node'),0o755);
 const x=await run(r,'01-publish-repo.sh',['--check-runtime'],{HOME:home,NVM_DIR:join(home,'.nvm')});assert.notEqual(x.code,0);assert.ok(x.out.includes('Brak zgodnego Node'),x.out);assert.ok(x.out.includes('v18.20.4'));assert.equal(existsSync(join(r,'.release')),false);assert.equal(existsSync(join(r,'calls.jsonl')),false);
});

test('GitHub upload-only publishes an existing package without bump/build and retries without overwriting assets',async t=>{
 const r=fixture(t);const first=await run(r,'01-publish-repo.sh');assert.equal(first.code,0,first.out);
 const archive=join(r,'.release','0.1.1-'+COMMIT.slice(0,12)+'.tar.gz');const before=calls(r).length;
 const retry=await run(r,'01-publish-repo.sh',['--upload-package',archive]);assert.equal(retry.code,0,retry.out);
 const extra=calls(r).slice(before);assert.ok(!extra.some(c=>['docker','npm'].includes(c[0])&&!(c[0]==='npm'&&c.includes('--version'))));
 assert.ok(!extra.some(c=>c[0]==='git'&&['commit','push'].includes(c[1])));
 assert.ok(!extra.some(c=>c[0]==='gh'&&c[1]==='release'&&c[2]==='upload'));
 const release=JSON.parse(readFileSync(join(r,'github/release.json')));assert.equal(release.draft,false);assert.equal(release.tag_name,'v0.1.1');assert.equal(release.assets.length,3);
 assert.equal(JSON.parse(readFileSync(join(r,'app/package.json'))).version,'0.1.1');
 writeFileSync(join(r,'github/assets',archive.split('/').at(-1)),'tampered');
 const conflict=await run(r,'01-publish-repo.sh',['--upload-package',archive]);assert.notEqual(conflict.code,0);assert.ok(conflict.out.includes('Nie nadpisano'));
});

test('failed GitHub asset upload keeps a draft and resumes the same archive bytes/version',async t=>{
 const r=fixture(t);const first=await run(r,'01-publish-repo.sh',[],{FAIL_GITHUB_UPLOAD:'1'});assert.notEqual(first.code,0);
 assert.equal(JSON.parse(readFileSync(join(r,'github/release.json'))).draft,true);assert.ok(existsSync(join(r,'.release/pending.json')));
 const path=join(r,'.release','0.1.1-'+COMMIT.slice(0,12)+'.tar.gz'),bytes=readFileSync(path);
 const retry=await run(r,'01-publish-repo.sh',['--resume'],{REGISTRY_EXISTS:'1'});assert.equal(retry.code,0,retry.out);assert.deepEqual(readFileSync(path),bytes);
 assert.equal(JSON.parse(readFileSync(join(r,'github/release.json'))).draft,false);assert.equal(existsSync(join(r,'.release/pending.json')),false);
});

async function githubServerFixture(t){
 const f=serverFixture(t),bundle=join(f.r,'.release','0.1.1-'+COMMIT.slice(0,12));mkdirSync(bundle,{recursive:true});
 writeFileSync(join(bundle,'manifest.json'),readFileSync(f.args[0]));writeFileSync(join(bundle,'02-update-server.sh'),readFileSync(join(f.r,'deploy/02-update-server.sh')));
 const archive=bundle+'.tar.gz';await new Promise((resolve,reject)=>{const p=spawn('tar',['-czf',archive,'-C',join(f.r,'.release'),bundle.split('/').at(-1)]);p.once('error',reject);p.once('exit',c=>c===0?resolve():reject(Error('tar failed')));});
 const upload=await run(f.r,'01-publish-repo.sh',['--upload-package',archive]);assert.equal(upload.code,0,upload.out);
 return {...f,archive,downloadArgs:['--release','v0.1.1','--manager-dir',f.args[2]]};
}

test('server downloads a pinned GitHub release, verifies SHA-256 and deploys without executing the packaged script',async t=>{
 const f=await githubServerFixture(t);
 const preflight=await run(f.r,'02-update-server.sh',[...f.downloadArgs,'--check-only']);assert.equal(preflight.code,0,preflight.out);assert.equal(existsSync(join(f.r,'backups')),false);
 const result=await run(f.r,'02-update-server.sh',f.downloadArgs);assert.equal(result.code,0,result.out);assert.ok(existsSync(join(f.r,'backups')));
 const log=calls(f.r);assert.ok(log.some(c=>c[0]==='gh'&&c[1]==='release'&&c[2]==='download'&&c.includes('v0.1.1')));
 assert.ok(readFileSync(f.config,'utf8').includes(COMMIT.slice(0,12)+'@'+DIGEST));
 assert.equal(readFileSync(join(f.app,'data/rooms.json'),'utf8'),'{"keep":true}');
});

test('corrupt GitHub asset and latest selection are rejected before stopping the game',async t=>{
 const f=await githubServerFixture(t),before=readFileSync(f.config,'utf8');
 writeFileSync(join(f.r,'github/assets',f.archive.split('/').at(-1)),'corrupt');
 const bad=await run(f.r,'02-update-server.sh',f.downloadArgs);assert.notEqual(bad.code,0);assert.ok(bad.out.includes('SHA-256'),bad.out);assert.equal(readFileSync(f.config,'utf8'),before);assert.equal(existsSync(join(f.r,'backups')),false);
 const latest=await run(f.r,'02-update-server.sh',['--release','latest']);assert.notEqual(latest.code,0);
 assert.ok(!calls(f.r).some(c=>c[0]==='docker'&&['pull','stop','start'].includes(c[1])));
});


test('GitHub download under sudo reads credentials as the original operator',async t=>{
 const f=await githubServerFixture(t),script=join(f.r,'deploy/02-update-server.sh');
 const source=readFileSync(script,'utf8');const gate='if (( EUID == 0 )) && [[ -n "${SUDO_USER:-}" && "$SUDO_USER" != root ]]; then';
 assert.ok(source.includes(gate));writeFileSync(script,source.replace(gate,'if [[ -n "${SUDO_USER:-}" && "$SUDO_USER" != root ]]; then'));
 const x=await run(f.r,'02-update-server.sh',[...f.downloadArgs,'--check-only'],{SUDO_USER:'operator'});assert.equal(x.code,0,x.out);
 assert.ok(calls(f.r).some(c=>c[0]==='sudo'&&c[1]==='-u'&&c[2]==='operator'&&c[4]==='gh'));assert.equal(existsSync(join(f.r,'backups')),false);
});


test('an existing GitHub tag for another commit cannot be reused or overwritten',async t=>{
 const r=fixture(t),x=await run(r,'01-publish-repo.sh',[],{CONFLICTING_GITHUB_TAG:'1'});assert.notEqual(x.code,0);assert.ok(x.out.includes('Tag GitHub wskazuje inny commit'),x.out);
 assert.ok(!calls(r).some(c=>c[0]==='gh'&&c[1]==='release'&&['create','upload','edit'].includes(c[2])));
});
