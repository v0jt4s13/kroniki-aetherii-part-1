#!/usr/bin/env bash
# Run in the game repository. Never deploys or contacts the production host.
set -Eeuo pipefail
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd -- "$SCRIPT_DIR/.." && pwd)"
usage() {
  cat <<'HELP'
Publikacja Kronik do GHCR i GitHub Releases:
  ./deploy/01-publish-repo.sh [--bump patch|minor|major] [--platform linux/amd64]
  ./deploy/01-publish-repo.sh --resume
  ./deploy/01-publish-repo.sh --check-runtime
  ./deploy/01-publish-repo.sh --upload-package .release/<wersja>-<SHA>.tar.gz

Wymaga czystego repo main. Podbija wersje, testuje, commituje tylko package.json
oraz package-lock.json, pushuje main i obraz z tagiem SHA. Nie zmienia produkcji.
Wynik: pakiet w .release/ oraz zalaczniki GitHub Release v<wersja>.
--resume kontynuuje przerwana publikacje bez ponownego podbijania wersji.
Mozna wywolac przez sudo: Git/npm wykona pierwotny uzytkownik, Docker moze uzyc sudo.
--check-runtime sprawdza tylko wybor Node/npm, bez zmian repo i bez publikacji.
--upload-package publikuje gotowy pakiet w GitHub, bez nowej wersji i budowy obrazu.
HELP
}
if [[ "${1:-}" == --help || "${1:-}" == -h ]]; then usage; exit 0; fi
# Keep user's Git/SSH and NVM identity; do not create root-owned repository files.
if (( EUID == 0 )); then
  [[ -n "${SUDO_USER:-}" && "$SUDO_USER" != root ]] || { echo 'Uruchom jako wlasciciel repo lub przez sudo z jego konta.' >&2; exit 1; }
  exec sudo -u "$SUDO_USER" -H bash "$SCRIPT_DIR/01-publish-repo.sh" "$@"
fi
GITHUB_REPO=v0jt4s13/kroniki-aetherii-part-1
publish_github_package() {
  local archive stage version commit sha release asset existing draft release_id asset_id cache
  archive="$(realpath -- "$1")"
  stage="$(mktemp -d "$ROOT/.release/github-upload.XXXXXX")"
  # Read the existing package as data, preserving its original bytes and manifest.
  python3 - "$archive" "$stage" <<'PYCODE'
import json,re,sys,tarfile,shutil
from pathlib import Path
archive=Path(sys.argv[1]);out=Path(sys.argv[2])
with tarfile.open(archive,'r:gz') as t:
    members=t.getmembers()
    manifests=[m for m in members if m.name.endswith('/manifest.json') and m.isfile()]
    if len(manifests)!=1 or manifests[0].size>16384:raise SystemExit('Nieprawidlowy manifest pakietu')
    m=json.load(t.extractfile(manifests[0]))
    if m.get('schema')!=1 or m.get('image')!='ghcr.io/v0jt4s13/kroniki-aetherii-part-1':raise SystemExit('Nieprawidlowy obraz pakietu')
    if not re.fullmatch(r'\d+\.\d+\.\d+',str(m.get('version',''))) or not re.fullmatch(r'[a-f0-9]{40}',str(m.get('commit',''))):raise SystemExit('Nieprawidlowa wersja/SHA')
    if m.get('tag')!=m['commit'][:12] or not re.fullmatch(r'sha256:[a-f0-9]{64}',str(m.get('digest',''))) or m.get('platform') not in ['linux/amd64','linux/arm64']:raise SystemExit('Nieprawidlowe metadane obrazu')
    prefix=m['version']+'-'+m['tag']
    allowed={prefix,prefix+'/manifest.json',prefix+'/02-update-server.sh'}
    names=[x.name.rstrip('/') for x in members]
    if len(names)!=len(set(names)) or any(x.name.rstrip('/') not in allowed or not(x.isfile() or x.isdir()) for x in members):raise SystemExit('Nieoczekiwana zawartosc archiwum')
    if set(x.name for x in members if x.isfile())!={prefix+'/manifest.json',prefix+'/02-update-server.sh'}:raise SystemExit('Niekompletny pakiet')
    if any(x.size>1048576 for x in members):raise SystemExit('Za duzy plik pakietu')
    if archive.name!=prefix+'.tar.gz':raise SystemExit('Nazwa pakietu nie zgadza sie z manifestem')
(out/'metadata.json').write_text(json.dumps(m))
shutil.copyfile(archive,out/archive.name)
PYCODE
  mapfile -t PACKAGE_META < <(python3 - "$stage/metadata.json" <<'PYCODE'
import json,sys
m=json.load(open(sys.argv[1]));print(m['version']);print(m['commit']);print(m['tag'])
PYCODE
)
  [[ ${#PACKAGE_META[@]} == 3 ]] || return 1
  version="${PACKAGE_META[0]}"; commit="${PACKAGE_META[1]}"; sha="${PACKAGE_META[2]}"; release="v$version"
  git merge-base --is-ancestor "$commit" HEAD
  git show "$commit:app/package.json" | python3 -c 'import json,sys;assert json.load(sys.stdin)["version"]==sys.argv[1]' "$version"
  # Bootstrap updater is the reviewed current tool, also for an older app package.
  cp -- "$ROOT/deploy/02-update-server.sh" "$stage/02-update-server.sh"
  (cd "$stage"; sha256sum "$(basename -- "$archive")" 02-update-server.sh > "$(basename -- "$archive").sha256")
  cache="$ROOT/.release/github-release-$release.json"
  if [[ -f "$cache" ]]; then
    release_id="$(python3 - "$cache" "$version" "$commit" <<'PYCODE'
import json,sys
r=json.load(open(sys.argv[1]));assert r['version']==sys.argv[2] and r['commit']==sys.argv[3]
assert type(r['id']) is int and r['id']>0;print(r['id'])
PYCODE
)"
    gh api "repos/$GITHUB_REPO/releases/$release_id" > "$stage/release.json"
  else
    # Listing is only discovery. Once an ID is known, never rediscover it by tag.
    gh api "repos/$GITHUB_REPO/releases?per_page=100" --paginate --jq ".[] | select(.tag_name == \"$release\")" > "$stage/release.json"
    if [[ ! -s "$stage/release.json" ]]; then
      if gh api "repos/$GITHUB_REPO/git/ref/tags/$release" > "$stage/tag-ref.json" 2> "$stage/tag-error.log"; then
        existing="$(gh api "repos/$GITHUB_REPO/commits/tags/$release" --jq .sha)"
        [[ "$existing" == "$commit" ]] || { echo 'Tag GitHub wskazuje inny commit.' >&2; return 1; }
      else
        grep -Eq 'HTTP 404|Not Found' "$stage/tag-error.log" || return 1
      fi
      python3 - "$stage/create.json" "$release" "$commit" "$version" <<'PYCODE'
import json,sys
path,tag,commit,version=sys.argv[1:]
with open(path,'w') as f:json.dump({'tag_name':tag,'target_commitish':commit,'name':'Kroniki Aetherii '+version,'body':'Wersja '+version+', commit '+commit+'. Pakiet serwerowy i suma SHA-256.','draft':True},f)
PYCODE
      # Retain the POST response: the list can lag behind creation of a draft.
      gh api "repos/$GITHUB_REPO/releases" --method POST --header 'Content-Type: application/json' --input "$stage/create.json" > "$stage/release.json"
    fi
  fi
  release_id="$(python3 - "$stage/release.json" "$release" <<'PYCODE'
import json,sys
try:r=json.load(open(sys.argv[1]))
except (ValueError,OSError):raise SystemExit('GitHub nie zwrocil jednoznacznych metadanych wydania. Nie utworzono kolejnego szkicu.')
if r.get('tag_name')!=sys.argv[2] or type(r.get('id')) is not int or r['id']<=0:raise SystemExit('Niezgodne metadane GitHub Release')
print(r['id'])
PYCODE
)"
  python3 - "$cache" "$release_id" "$version" "$commit" <<'PYCODE'
import json,os,sys
path,id,version,commit=sys.argv[1:]
with open(path+'.tmp','w') as f:json.dump({'id':int(id),'version':version,'commit':commit},f)
os.replace(path+'.tmp',path)
PYCODE
  draft="$(python3 - "$stage/release.json" "$release" <<'PYCODE'
import json,sys
r=json.load(open(sys.argv[1]));assert r['tag_name']==sys.argv[2];print('true' if r['draft'] else 'false')
PYCODE
)"
  if gh api "repos/$GITHUB_REPO/git/ref/tags/$release" > "$stage/tag-ref.json" 2> "$stage/tag-error.log"; then
    existing="$(gh api "repos/$GITHUB_REPO/commits/tags/$release" --jq .sha)"
    [[ "$existing" == "$commit" ]] || { echo 'Tag wydania wskazuje inny commit.' >&2; return 1; }
  else
    [[ "$draft" == true ]] && grep -Eq 'HTTP 404|Not Found' "$stage/tag-error.log" || return 1
    python3 - "$stage/release.json" "$commit" <<'PYCODE'
import json,sys
assert json.load(open(sys.argv[1]))['target_commitish']==sys.argv[2]
PYCODE
  fi
  for asset in "$(basename -- "$archive")" "$(basename -- "$archive").sha256" 02-update-server.sh; do
    if python3 - "$stage/release.json" "$asset" <<'PYCODE'
import json,sys
sys.exit(0 if any(a['name']==sys.argv[2] for a in json.load(open(sys.argv[1]))['assets']) else 1)
PYCODE
    then
      asset_id="$(python3 - "$stage/release.json" "$asset" <<'PYCODE'
import json,sys
items=[a for a in json.load(open(sys.argv[1]))['assets'] if a['name']==sys.argv[2]]
assert len(items)==1 and type(items[0].get('id')) is int and items[0]['id']>0
print(items[0]['id'])
PYCODE
)"
      gh api "repos/$GITHUB_REPO/releases/assets/$asset_id" --header 'Accept: application/octet-stream' > "$stage/existing-asset"
      cmp -- "$stage/$asset" "$stage/existing-asset" || { echo "Zalacznik $asset juz istnieje z inna zawartoscia. Nie nadpisano go." >&2; return 1; }
    else
      gh api "https://uploads.github.com/repos/$GITHUB_REPO/releases/$release_id/assets?name=$asset" --method POST --header 'Content-Type: application/octet-stream' --header "Content-Length: $(wc -c < "$stage/$asset")" --input "$stage/$asset" > "$stage/upload-response.json"
    fi
  done
  if [[ "$draft" == true ]]; then
    printf '{"draft":false}\n' > "$stage/publish.json"
    gh api "repos/$GITHUB_REPO/releases/$release_id" --method PATCH --header 'Content-Type: application/json' --input "$stage/publish.json" > "$stage/published.json"
  fi
  [[ "$(gh api "repos/$GITHUB_REPO/commits/tags/$release" --jq .sha)" == "$commit" ]]
  printf 'GitHub Release: https://github.com/%s/releases/tag/%s\nNa serwerze: sudo ./02-update-server.sh --release %s\n' "$GITHUB_REPO" "$release" "$release"
}
node_supported() {
  command -v "${1:-node}" >/dev/null 2>&1 &&
    "${1:-node}" -e 'const [m,n]=process.versions.node.split(".").map(Number);process.exit(((m===20&&n>=19)||(m===22&&n>=12)||m>22)?0:1)' >/dev/null 2>&1
}
select_node() {
  if node_supported; then return; fi
  # sudo resets PATH, so an existing /usr/bin/node may be too old even when
  # the original user already has a supported runtime installed through NVM.
  export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
  if [[ -f "$NVM_DIR/nvm.sh" ]]; then
    set +u
    source "$NVM_DIR/nvm.sh" --no-use
    set -u
    for candidate in 22 'lts/*' node; do
      if nvm use --silent "$candidate" >/dev/null 2>&1 && node_supported; then return; fi
    done
  fi
  # Also support installed NVM binaries when the loader/aliases are absent.
  while IFS= read -r candidate; do
    if node_supported "$candidate/node"; then
      export PATH="$candidate:$PATH"
      hash -r
      return
    fi
  done < <(printf '%s\n' "$NVM_DIR"/versions/node/v*/bin | sort -Vr)
  printf 'Brak zgodnego Node (w PATH: %s). Wymagany Node 20.19+ albo 22.12+. Zainstaluj np. nvm install 22 i ponow polecenie.\n' "$(node --version 2>/dev/null || printf brak)" >&2
  return 1
}
BUMP=patch; PLATFORM=linux/amd64; RESUME=0; CHECK_RUNTIME=0; UPLOAD_PACKAGE=''
while (( $# )); do
  case "$1" in
    --bump) [[ $# -ge 2 ]] || exit 2; BUMP="$2"; shift 2 ;;
    --platform) [[ $# -ge 2 ]] || exit 2; PLATFORM="$2"; shift 2 ;;
    --resume) RESUME=1; shift ;;
    --upload-package) [[ $# -ge 2 ]] || exit 2; UPLOAD_PACKAGE="$(realpath -- "$2")"; shift 2 ;;
    --check-runtime) CHECK_RUNTIME=1; shift ;;
    *) echo "Nieznany argument: $1" >&2; usage >&2; exit 2 ;;
  esac
done
[[ "$BUMP" =~ ^(patch|minor|major)$ ]] || { echo 'Nieprawidlowy --bump.' >&2; exit 2; }
[[ "$PLATFORM" =~ ^linux/(amd64|arm64)$ ]] || { echo 'Platforma: linux/amd64 lub linux/arm64.' >&2; exit 2; }
select_node
command -v npm >/dev/null || { echo 'Brak npm dla wybranego Node.' >&2; exit 1; }
printf 'Node %s (%s), npm %s\n' "$(node --version)" "$(command -v node)" "$(npm --version)"
if (( CHECK_RUNTIME )); then exit 0; fi
for tool in git node npm python3 flock tar gh sha256sum cmp; do command -v "$tool" >/dev/null || { echo "Brak: $tool" >&2; exit 1; }; done
cd "$ROOT"
[[ "$(git rev-parse --show-toplevel)" == "$ROOT" ]] || exit 1
gh auth status --hostname github.com >/dev/null
if [[ -n "$UPLOAD_PACKAGE" ]]; then
  (( ! RESUME )) || { echo '--upload-package nie laczy sie z --resume.' >&2; exit 2; }
  [[ -z "$(git status --porcelain --untracked-files=all)" ]] || { echo 'Najpierw zatwierdz zmiany narzedzi publikacji.' >&2; exit 1; }
  mkdir -p .release
  exec 9>"$(git rev-parse --git-path aetherii-release.lock)"
  flock -n 9 || exit 1
  publish_github_package "$UPLOAD_PACKAGE"
  exit 0
fi
command -v docker >/dev/null || { echo 'Brak: docker' >&2; exit 1; }
[[ "$(git branch --show-current)" == main ]] || { echo 'Publikacja wymaga galezi main.' >&2; exit 1; }
# Lock inside Git metadata; support worktrees and keep build context clean.
exec 9>"$(git rev-parse --git-path aetherii-release.lock)"
flock -n 9 || { echo 'Inna publikacja jest w toku.' >&2; exit 1; }
mkdir -p .release
STATE="$ROOT/.release/pending.json"
IMAGE=ghcr.io/v0jt4s13/kroniki-aetherii-part-1
STEP=przygotowanie
trap 'rc=$?; echo "Publikacja przerwana: $STEP (kod $rc). Jesli istnieje .release/pending.json, uzyj --resume. Wersji nie cofano." >&2; exit "$rc"' ERR
DOCKER=(docker)
if ! docker info >/dev/null 2>&1; then
  command -v sudo >/dev/null || { echo 'Brak dostepu do Dockera.' >&2; exit 1; }
  DOCKER=(sudo docker)
  "${DOCKER[@]}" info >/dev/null
fi
"${DOCKER[@]}" buildx version >/dev/null
clean() { [[ -z "$(git status --porcelain --untracked-files=all)" ]]; }
if (( RESUME )); then
  [[ -f "$STATE" ]] || { echo 'Brak przerwanej publikacji do wznowienia.' >&2; exit 1; }
  mapfile -t META < <(node -e 'const s=require(process.argv[1]);for(const k of ["base","version","commit","platform"])console.log(s[k]||"")' "$STATE")
  BASE="${META[0]}"; VERSION="${META[1]}"; COMMIT="${META[2]}"; PLATFORM="${META[3]}"
  [[ "$BASE" =~ ^[a-f0-9]{40}$ && "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ && "$PLATFORM" =~ ^linux/(amd64|arm64)$ ]] || { echo 'Uszkodzony stan publikacji.' >&2; exit 1; }
  if [[ -n "$COMMIT" ]]; then
    git merge-base --is-ancestor "$COMMIT" HEAD && clean || { echo 'Wymagane czyste repo i HEAD bedacy wydaniem lub jego potomkiem.' >&2; exit 1; }
  else
    [[ "$(git rev-parse HEAD)" == "$BASE" ]] || { echo 'HEAD zmienil sie od podbicia wersji.' >&2; exit 1; }
    python3 - <<'PY'
import subprocess
allowed={b'app/package.json',b'app/package-lock.json'}
for entry in subprocess.check_output(['git','status','--porcelain=v1','-z']).split(b'\0'):
    if entry and entry[3:] not in allowed:
        raise SystemExit('Po przerwaniu zmieniono inne pliki. Najpierw je przejrzyj.')
PY
  fi
  node -e 'const p=require("./app/package.json"),l=require("./app/package-lock.json");if(p.version!==process.argv[1]||l.version!==p.version||l.packages[""].version!==p.version)process.exit(1)' "$VERSION"
else
  [[ ! -f "$STATE" ]] || { echo 'Wykryto przerwana publikacje. Uzyj --resume.' >&2; exit 1; }
  clean || { echo 'Najpierw zatwierdz zmiany i przejrzyj niekontrolowane pliki. Skrypt nie wykonuje git add -A.' >&2; git status --short; exit 1; }
  git fetch origin main
  git merge-base --is-ancestor origin/main HEAD || { echo 'Najpierw uzgodnij main z origin/main.' >&2; exit 1; }
  BASE="$(git rev-parse HEAD)"; COMMIT=''
  VERSION="$(RELEASE_BASE="$BASE" RELEASE_PLATFORM="$PLATFORM" node - "$BUMP" <<'JS'
const fs=require('node:fs');
const p=JSON.parse(fs.readFileSync('app/package.json','utf8'));
const l=JSON.parse(fs.readFileSync('app/package-lock.json','utf8'));
if(!/^\d+\.\d+\.\d+$/.test(p.version)||l.version!==p.version||l.packages[''].version!==p.version)throw Error('Niezgodna wersja package/lock');
let [major,minor,patch]=p.version.split('.').map(Number);
if(process.argv[2]==='major'){major++;minor=0;patch=0;}else if(process.argv[2]==='minor'){minor++;patch=0;}else patch++;
const version=[major,minor,patch].join('.');
// Write the resume record before changing either version file.
fs.writeFileSync('.release/pending.json',JSON.stringify({base:process.env.RELEASE_BASE,version,platform:process.env.RELEASE_PLATFORM,commit:''},null,2)+'\n');
for(const [path,data]of [['app/package.json',{...p,version}],['app/package-lock.json',{...l,version,packages:{...l.packages,'':{...l.packages[''],version}}}]])fs.writeFileSync(path,JSON.stringify(data,null,2)+'\n');
console.log(version);
JS
)"
fi
SOURCE_DIR=''
snapshot_release() {
  SOURCE_DIR="$(mktemp -d "$ROOT/.release/source-${COMMIT:0:12}.XXXXXX")"
  git archive "$COMMIT" | tar -x -C "$SOURCE_DIR"
  node -e 'if(require(process.argv[1]).version!==process.argv[2])throw Error("Wersja commita nie odpowiada stanowi publikacji")' "$SOURCE_DIR/app/package.json" "$VERSION"
}
TEST_ROOT="$ROOT"
if [[ -n "$COMMIT" ]]; then
  snapshot_release
  TEST_ROOT="$SOURCE_DIR"
fi
STEP=testy
npm --prefix "$TEST_ROOT/app" ci --no-audit --no-fund
npm --prefix "$TEST_ROOT/app" run check:runtime
# Production API tests serve dist/client. A git archive never contains dist,
# so build it first (test:prefix includes the build and prefixed API checks).
npm --prefix "$TEST_ROOT/app" run test:prefix
npm --prefix "$TEST_ROOT/app" test
npm --prefix "$TEST_ROOT/app" run test:sites
if [[ -z "$COMMIT" ]]; then
  STEP=commit-wersji
  git add -- app/package.json app/package-lock.json
  git commit -m "Release $VERSION"
  COMMIT="$(git rev-parse HEAD)"
  node -e 'const fs=require("node:fs"),p=process.argv[1],s=JSON.parse(fs.readFileSync(p));s.commit=process.argv[2];fs.writeFileSync(p,JSON.stringify(s,null,2)+"\n")' "$STATE" "$COMMIT"
fi
clean || { echo 'Testy zmienily sledzone pliki. Publikacja zatrzymana.' >&2; exit 1; }
if [[ -z "$SOURCE_DIR" ]]; then snapshot_release; fi
STEP=push-git
# No force push. Remote divergence is an error and leaves a resumable release.
git push origin HEAD:main
TAG="${COMMIT:0:12}"
REF="$IMAGE:$TAG"
STEP=logowanie-GHCR
"${DOCKER[@]}" login ghcr.io -u v0jt4s13
STEP=obraz
# An existing SHA tag must be reused and verified, never overwritten on resume.
if "${DOCKER[@]}" buildx imagetools inspect "$REF" > .release/registry-check.log 2>&1; then
  "${DOCKER[@]}" pull --platform "$PLATFORM" "$REF"
else
  if ! grep -Eiq 'not found|manifest unknown|no such manifest' .release/registry-check.log; then
    echo 'Nie mozna potwierdzic braku tagu w rejestrze. Nie przebudowano go. Szczegoly: .release/registry-check.log' >&2; exit 1
  fi
  "${DOCKER[@]}" build --pull --platform "$PLATFORM" --label "org.opencontainers.image.version=$VERSION" --label "org.opencontainers.image.revision=$COMMIT" -t "$REF" "$SOURCE_DIR"
fi
[[ "$("${DOCKER[@]}" inspect --format '{{index .Config.Labels "org.opencontainers.image.version"}}' "$REF")" == "$VERSION" ]]
[[ "$("${DOCKER[@]}" inspect --format '{{index .Config.Labels "org.opencontainers.image.revision"}}' "$REF")" == "$COMMIT" ]]
[[ "$("${DOCKER[@]}" inspect --format '{{.Os}}/{{.Architecture}}' "$REF")" == "$PLATFORM" ]]
"${DOCKER[@]}" run --rm --network none --entrypoint node "$REF" -e '
(async () => {
const fs = require("node:fs");
const p=JSON.parse(fs.readFileSync("package.json"));if(p.version!==process.argv[1])throw Error("Wrong package version");
const html=fs.readFileSync("dist/client/play.html","utf8");if(!/src="\.\/assets\/game-/.test(html)||/src="\/assets\//.test(html))throw Error("Wrong asset prefix");
if((html.match(/aetheriiTheme/g)||[]).length!==1)throw Error("Missing theme bootstrap");
const {createChatStore}=await import("./server/chat-store.mjs");const s=createChatStore("/tmp/release-chat.sqlite");
try{await s.run("history",{room:"RELEASE",player:"test"});}finally{await s.close();}
})().catch(error => { console.error(error); process.exitCode = 1; });
' "$VERSION"
STEP=push-obrazu
"${DOCKER[@]}" push "$REF"
"${DOCKER[@]}" pull --platform "$PLATFORM" "$REF"
DIGEST="$("${DOCKER[@]}" image inspect --format '{{json .RepoDigests}}' "$REF" | node -e 'let s="";for await(const c of process.stdin)s+=c;const p=JSON.parse(s).find(x=>x.startsWith(process.argv[1]+"@sha256:"));if(!p)process.exit(1);console.log(p.split("@")[1]);' --input-type=module "$IMAGE")"
[[ "$DIGEST" =~ ^sha256:[a-f0-9]{64}$ ]]
STEP=manifest
BUNDLE="$ROOT/.release/$VERSION-$TAG"
mkdir -p "$BUNDLE"
node --input-type=module - "$BUNDLE/manifest.json" "$IMAGE" "$TAG" "$COMMIT" "$VERSION" "$DIGEST" "$PLATFORM" <<'JS'
import fs from 'node:fs';
const [path,image,tag,commit,version,digest,platform]=process.argv.slice(2);
const core={schema:1,image,tag,commit,version,digest,platform};
if(fs.existsSync(path)){const old=JSON.parse(fs.readFileSync(path));for(const [k,v]of Object.entries(core))if(old[k]!==v)throw Error('Istniejacy manifest wskazuje inne wydanie');}
else fs.writeFileSync(path,JSON.stringify({...core,createdAt:new Date().toISOString()},null,2)+'\n');
JS
cp -- "$SOURCE_DIR/deploy/02-update-server.sh" "$BUNDLE/02-update-server.sh"
chmod 755 "$BUNDLE/02-update-server.sh"
if [[ ! -f "$BUNDLE.tar.gz" ]]; then tar -czf "$BUNDLE.tar.gz" -C "$ROOT/.release" "$VERSION-$TAG"; fi
STEP=github-release
publish_github_package "$BUNDLE.tar.gz"
rm -- "$STATE"
printf '\nOpublikowano wersje %s, SHA %s\nObraz: %s@%s\nPakiet lokalny: %s.tar.gz\nPakiet serwerowy jest dostepny w GitHub Releases; SCP nie jest potrzebne.\n' "$VERSION" "$TAG" "$REF" "$DIGEST" "$BUNDLE"
