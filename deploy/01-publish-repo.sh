#!/usr/bin/env bash
# Run in the game repository. Never deploys or contacts the production host.
set -Eeuo pipefail
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd -- "$SCRIPT_DIR/.." && pwd)"
usage() {
  cat <<'HELP'
Publikacja Kronik z repo do GHCR:
  ./deploy/01-publish-repo.sh [--bump patch|minor|major] [--platform linux/amd64]
  ./deploy/01-publish-repo.sh --resume
  ./deploy/01-publish-repo.sh --check-runtime

Wymaga czystego repo main. Podbija wersje, testuje, commituje tylko package.json
oraz package-lock.json, pushuje main i obraz z tagiem SHA. Nie zmienia produkcji.
Wynik: .release/<wersja>-<SHA>/ i archiwum .tar.gz do przeniesienia na serwer.
--resume kontynuuje przerwana publikacje bez ponownego podbijania wersji.
Mozna wywolac przez sudo: Git/npm wykona pierwotny uzytkownik, Docker moze uzyc sudo.
--check-runtime sprawdza tylko wybor Node/npm, bez zmian repo i bez publikacji.
HELP
}
if [[ "${1:-}" == --help || "${1:-}" == -h ]]; then usage; exit 0; fi
# Keep user's Git/SSH and NVM identity; do not create root-owned repository files.
if (( EUID == 0 )); then
  [[ -n "${SUDO_USER:-}" && "$SUDO_USER" != root ]] || { echo 'Uruchom jako wlasciciel repo lub przez sudo z jego konta.' >&2; exit 1; }
  exec sudo -u "$SUDO_USER" -H bash "$SCRIPT_DIR/01-publish-repo.sh" "$@"
fi
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
BUMP=patch; PLATFORM=linux/amd64; RESUME=0; CHECK_RUNTIME=0
while (( $# )); do
  case "$1" in
    --bump) [[ $# -ge 2 ]] || exit 2; BUMP="$2"; shift 2 ;;
    --platform) [[ $# -ge 2 ]] || exit 2; PLATFORM="$2"; shift 2 ;;
    --resume) RESUME=1; shift ;;
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
for tool in git node npm docker python3 flock tar; do command -v "$tool" >/dev/null || { echo "Brak: $tool" >&2; exit 1; }; done
cd "$ROOT"
[[ "$(git rev-parse --show-toplevel)" == "$ROOT" ]] || exit 1
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
    [[ "$(git rev-parse HEAD)" == "$COMMIT" ]] && clean || { echo 'HEAD lub pliki zmienily sie od przygotowania wydania.' >&2; exit 1; }
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
STEP=testy
npm --prefix app ci --no-audit --no-fund
npm --prefix app test
npm --prefix app run check:runtime
npm --prefix app run test:prefix
npm --prefix app run test:sites
if [[ -z "$COMMIT" ]]; then
  STEP=commit-wersji
  git add -- app/package.json app/package-lock.json
  git commit -m "Release $VERSION"
  COMMIT="$(git rev-parse HEAD)"
  node -e 'const fs=require("node:fs"),p=process.argv[1],s=JSON.parse(fs.readFileSync(p));s.commit=process.argv[2];fs.writeFileSync(p,JSON.stringify(s,null,2)+"\n")' "$STATE" "$COMMIT"
fi
clean || { echo 'Testy zmienily sledzone pliki. Publikacja zatrzymana.' >&2; exit 1; }
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
  "${DOCKER[@]}" build --pull --platform "$PLATFORM" --label "org.opencontainers.image.version=$VERSION" --label "org.opencontainers.image.revision=$COMMIT" -t "$REF" .
fi
[[ "$("${DOCKER[@]}" inspect --format '{{index .Config.Labels "org.opencontainers.image.version"}}' "$REF")" == "$VERSION" ]]
[[ "$("${DOCKER[@]}" inspect --format '{{index .Config.Labels "org.opencontainers.image.revision"}}' "$REF")" == "$COMMIT" ]]
[[ "$("${DOCKER[@]}" inspect --format '{{.Os}}/{{.Architecture}}' "$REF")" == "$PLATFORM" ]]
"${DOCKER[@]}" run --rm --network none --entrypoint node "$REF" --input-type=module -e '
import fs from "node:fs";
const p=JSON.parse(fs.readFileSync("package.json"));if(p.version!==process.argv[1])throw Error("Wrong package version");
const html=fs.readFileSync("dist/client/play.html","utf8");if(!/src="\.\/assets\/game-/.test(html)||/src="\/assets\//.test(html))throw Error("Wrong asset prefix");
if((html.match(/aetheriiTheme/g)||[]).length!==1)throw Error("Missing theme bootstrap");
const {createChatStore}=await import("./server/chat-store.mjs");const s=createChatStore("/tmp/release-chat.sqlite");
try{await s.run("history",{room:"RELEASE",player:"test"});}finally{await s.close();}
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
fs.writeFileSync(path,JSON.stringify({schema:1,image,tag,commit,version,digest,platform,createdAt:new Date().toISOString()},null,2)+'\n');
JS
cp -- deploy/02-update-server.sh "$BUNDLE/02-update-server.sh"
chmod 755 "$BUNDLE/02-update-server.sh"
tar -czf "$BUNDLE.tar.gz" -C "$ROOT/.release" "$VERSION-$TAG"
rm -- "$STATE"
printf '\nOpublikowano wersje %s, SHA %s\nObraz: %s@%s\nPakiet serwerowy: %s.tar.gz\nNa serwerze po rozpakowaniu: sudo ./02-update-server.sh ./manifest.json\n' "$VERSION" "$TAG" "$REF" "$DIGEST" "$BUNDLE"
