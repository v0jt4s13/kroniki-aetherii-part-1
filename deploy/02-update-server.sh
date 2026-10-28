#!/usr/bin/env bash
# Run on ops02 with a manifest produced by 01-publish-repo.sh.
set -Eeuo pipefail
usage() {
  cat <<'HELP'
Aktualizacja istniejacej instalacji Kronik na serwerze ops02:
  sudo ./02-update-server.sh ./manifest.json [--manager-dir /opt/apps/projects_manager]
  sudo ./02-update-server.sh ./manifest.json --check-only

Wymaga istniejacej instalacji managera, runtime i kontenera. Weryfikuje obraz,
robi backup po zatrzymaniu gry, ustawia tag SHA z digestem i naglowki WS,
wywoluje docker-update oraz sprawdza wersje, SQLite, HTTPS i handshake WS.
Zachowuje aktualne sekrety i ustawienia glosu; nie instaluje ani nie wlacza TURN.
--check-only wykonuje lokalne kontrole bez pobierania obrazu i bez zmian produkcji.
Nie aktualizuje repo managera przez git pull. Zrob to osobno jako jego wlasciciel.
HELP
}
if [[ "${1:-}" == --help || "${1:-}" == -h ]]; then usage; exit 0; fi
[[ $# -ge 1 ]] || { usage >&2; exit 2; }
MANIFEST="$(realpath -- "$1")"; shift
MANAGER_DIR=/opt/apps/projects_manager; CHECK_ONLY=0
while (( $# )); do
  case "$1" in
    --manager-dir) [[ $# -ge 2 ]] || exit 2; MANAGER_DIR="$(realpath -- "$2")"; shift 2 ;;
    --check-only) CHECK_ONLY=1; shift ;;
    *) echo "Nieznany argument: $1" >&2; exit 2 ;;
  esac
done
(( EUID == 0 )) || { echo 'Na serwerze uruchom przez sudo.' >&2; exit 1; }
for tool in python3 docker curl nginx flock bash tar; do command -v "$tool" >/dev/null || { echo "Brak: $tool" >&2; exit 1; }; done
CONFIG="$MANAGER_DIR/production_projects/kroniki-aetherii.env"
MANAGER="$MANAGER_DIR/production_manager.sh"
[[ -f "$CONFIG" && -f "$MANAGER" && -f "$MANIFEST" ]] || { echo 'Brak manifestu lub instalacji managera.' >&2; exit 1; }
bash -n "$MANAGER"
# Metadata is JSON data, never source or eval it as shell code.
mapfile -t RELEASE < <(python3 - "$MANIFEST" <<'PY'
import json,re,sys
m=json.load(open(sys.argv[1]))
checks=[m.get('schema')==1,m.get('image')=='ghcr.io/v0jt4s13/kroniki-aetherii-part-1',bool(re.fullmatch(r'[a-f0-9]{40}',str(m.get('commit','')))),bool(re.fullmatch(r'[a-f0-9]{12}',str(m.get('tag','')))),bool(re.fullmatch(r'\d+\.\d+\.\d+',str(m.get('version','')))),bool(re.fullmatch(r'sha256:[a-f0-9]{64}',str(m.get('digest','')))),m.get('platform') in ['linux/amd64','linux/arm64']]
if not all(checks) or m['tag']!=m['commit'][:12]:raise SystemExit('Nieprawidlowy manifest wydania')
for key in ['image','tag','commit','version','digest','platform']:print(m[key])
PY
)
[[ ${#RELEASE[@]} == 6 ]] || { echo 'Odrzucono manifest.' >&2; exit 1; }
IMAGE="${RELEASE[0]}"; TAG="${RELEASE[1]}"; COMMIT="${RELEASE[2]}"; VERSION="${RELEASE[3]}"; DIGEST="${RELEASE[4]}"; PLATFORM="${RELEASE[5]}"
REF="$IMAGE:$TAG@$DIGEST"
# This file is the existing, root-trusted manager configuration, not the manifest.
# shellcheck disable=SC1090
source "$CONFIG"
[[ "${NGINX_STRATEGY:-}" == prefix && "${URL_PREFIX:-}" == /kroniki-aetherii && "${DOMAIN:-}" == ops02.jdblayer.com ]] || { echo 'Nieprawidlowa strategia/domena/prefiks. Zachowaj wspolny vhost moderacji.' >&2; exit 1; }
[[ "${DOCKER_IMAGE:-}" == "$IMAGE" && "${SERVICE_NAME:-}" == kroniki-aetherii && "${DOCKER_CONTAINER_PORT:-}" == 4173 ]] || { echo 'Nieprawidlowa konfiguracja obrazu/uslugi/portu.' >&2; exit 1; }
APP_DIR="${APP_DIR:?}"; CONTAINER="${CONTAINER_NAME:-kroniki-aetherii}"
COMPOSE_FILE="${COMPOSE_FILE:-$APP_DIR/docker-compose.yml}"
RUNTIME="${DOCKER_RUNTIME_ENV:-$APP_DIR/.env}"
DATA_DIR="${DOCKER_DATA_DIR:?}"; SITE="${NGINX_SITE:?}"
[[ "$DATA_DIR" == "$APP_DIR/data" && "${DOCKER_DATA_TARGET:-}" == /data ]] || { echo 'Oczekiwany bind APP_DIR/data -> /data.' >&2; exit 1; }
[[ "${DOCKER_BIND:-}" == 127.0.0.1:4173 && "$CONTAINER" == kroniki-aetherii ]] || { echo 'Nieoczekiwany kontener lub adres aplikacji.' >&2; exit 1; }
[[ -d "$DATA_DIR" && -f "$RUNTIME" && -f "$SITE" && -f "$COMPOSE_FILE" ]] || { echo 'Brak danych, runtime, Compose lub vhosta. To nie jest skrypt pierwszej instalacji.' >&2; exit 1; }
# Refuse a known-bad shared vhost instead of extending the broken configuration.
[[ "$(head -1 "$SITE")" == '# --- moderacja standalone ---' ]] || { echo 'Wspolny vhost nie ma naglowka moderacji. Najpierw wyjasnij stan Nginx.' >&2; exit 1; }
grep -Fq 'DOCKER_DATA_DIR' "$MANAGER"
grep -Fq 'NGINX_LOCATION_EXTRA' "$MANAGER"
nginx -t
[[ "$(docker inspect --format '{{.State.Running}}' "$CONTAINER")" == true ]] || { echo 'Obecny kontener musi dzialac przed aktualizacja.' >&2; exit 1; }
[[ "$(docker inspect --format '{{range .Mounts}}{{if eq .Destination "/data"}}{{.Source}}{{end}}{{end}}' "$CONTAINER")" == "$DATA_DIR" ]] || { echo 'Aktualny kontener nie montuje oczekiwanego katalogu danych.' >&2; exit 1; }
docker exec "$CONTAINER" node -e 'require("node:fs").accessSync("/data",require("node:fs").constants.W_OK)'
PUBLIC_URL="https://$DOMAIN$URL_PREFIX"
# Read dotenv as data. Do not execute runtime secrets with source.
python3 - "$RUNTIME" "$PUBLIC_URL" <<'PY'
import sys
values={}
for raw in open(sys.argv[1]):
    line=raw.strip()
    if line and not line.startswith('#') and '=' in line:
        k,v=line.split('=',1);values[k.strip()]=v.strip().strip('"\'')
if values.get('PUBLIC_URL')!=sys.argv[2]:raise SystemExit('Runtime PUBLIC_URL nie odpowiada domenie i prefiksowi')
if values.get('AETHERII_DATA_DIR','/data')!='/data':raise SystemExit('Niezgodny katalog danych runtime')
voice=values.get('AETHERII_VOICE_ENABLED','true')!='false'
if voice and bool(values.get('TURN_URLS'))!=bool(values.get('TURN_SECRET')):raise SystemExit('Niepelna konfiguracja TURN; uzupelnij ja lub wylacz glos')
PY
[[ "$(curl --silent --show-error --max-time 15 --output /dev/null --write-out '%{http_code}' "https://$DOMAIN/")" == 302 ]] || { echo 'Moderacja przed wdrozeniem nie zwraca oczekiwanego 302.' >&2; exit 1; }
HOST_PLATFORM="$(docker info --format '{{.OSType}}/{{.Architecture}}')"
case "$HOST_PLATFORM" in linux/x86_64) HOST_PLATFORM=linux/amd64;; linux/aarch64) HOST_PLATFORM=linux/arm64;; esac
[[ "$PLATFORM" == "$HOST_PLATFORM" ]] || { echo 'Platforma obrazu nie odpowiada serwerowi.' >&2; exit 1; }
if (( CHECK_ONLY )); then printf 'Kontrole lokalne OK. Plan: wersja %s, SHA %s. Nie zmieniono plikow ani kontenerow.\n' "$VERSION" "$TAG"; exit 0; fi
exec 9>"$APP_DIR/.aetherii-deploy.lock"
flock -n 9 || { echo 'Inna aktualizacja Kronik jest w toku.' >&2; exit 1; }
STEP=pobranie-obrazu; STOPPED=0; DEPLOY_STARTED=0; BACKUP=''
OLD_ID="$(docker inspect --format '{{.Image}}' "$CONTAINER")"
OLD_TAG="${DOCKER_IMAGE_TAG:-}"
fail() {
  local rc=$?
  trap - ERR
  echo "Aktualizacja przerwana: $STEP (kod $rc). Backup: ${BACKUP:-jeszcze nie wykonano}." >&2
  if [[ -n "$BACKUP" && -f "$BACKUP/project.env" ]]; then
    cp -pL -- "$BACKUP/project.env" "$CONFIG" || true
    cp -pL -- "$BACKUP/runtime.env" "$RUNTIME" || true
    cp -pL -- "$BACKUP/docker-compose.yml" "$COMPOSE_FILE" || true
  fi
  if (( STOPPED && ! DEPLOY_STARTED )); then
    # Same old container, before any application migration. Safe to resume it.
    docker start "$CONTAINER" >/dev/null || true
  elif (( DEPLOY_STARTED )); then
    # Never silently return to code-only admissions or restore player data.
    docker stop --time 20 "$CONTAINER" >/dev/null 2>&1 || true
    echo 'Gra zatrzymana. Nie przywracano danych ani starszego obrazu automatycznie.' >&2
    echo "Poprzedni obraz lokalny: $OLD_ID; poprzedni tag: $OLD_TAG" >&2
    if [[ -n "$BACKUP" && -f "$BACKUP/nginx.conf" ]]; then
      cp -pL -- "$BACKUP/nginx.conf" "$SITE"
      if nginx -t; then systemctl reload nginx || true; fi
    fi
    echo 'Sprawdz logi kontenera i backup konfiguracji. Rollback starego kodu wymaga decyzji o prywatnych zaproszeniach.' >&2
  fi
  exit "$rc"
}
trap fail ERR
trap 'false' INT TERM
if [[ -n "${DOCKER_REGISTRY_TOKEN_FILE:-}" ]]; then
  [[ -r "$DOCKER_REGISTRY_TOKEN_FILE" && -n "${DOCKER_REGISTRY_USERNAME:-}" ]]
  docker login "${DOCKER_REGISTRY:-ghcr.io}" --username "$DOCKER_REGISTRY_USERNAME" --password-stdin < "$DOCKER_REGISTRY_TOKEN_FILE"
fi
docker pull --platform "$PLATFORM" "$REF"
[[ "$(docker inspect --format '{{index .Config.Labels "org.opencontainers.image.revision"}}' "$REF")" == "$COMMIT" ]]
[[ "$(docker inspect --format '{{index .Config.Labels "org.opencontainers.image.version"}}' "$REF")" == "$VERSION" ]]
[[ "$(docker inspect --format '{{.Os}}/{{.Architecture}}' "$REF")" == "$PLATFORM" ]]
docker run --rm --network none --entrypoint node "$REF" -e 'const fs=require("node:fs");if(JSON.parse(fs.readFileSync("package.json")).version!==process.argv[1])throw Error("Wrong version");' "$VERSION"
STEP=kopia-danych
install -d -m 700 /root/kroniki-aetherii-backups
BACKUP="$(mktemp -d "/root/kroniki-aetherii-backups/$(date -u +%Y%m%dT%H%M%SZ)-$TAG.XXXXXX")"
chmod 700 "$BACKUP"
cp -pL -- "$CONFIG" "$BACKUP/project.env"
cp -pL -- "$RUNTIME" "$BACKUP/runtime.env"
cp -pL -- "$SITE" "$BACKUP/nginx.conf"
cp -pL -- "$COMPOSE_FILE" "$BACKUP/docker-compose.yml"
cp -- "$MANIFEST" "$BACKUP/manifest.json"
printf '%s\n' "$OLD_ID" > "$BACKUP/previous-image-id"
printf '%s\n' "$OLD_TAG" > "$BACKUP/previous-tag"
STOPPED=1
docker stop --time 30 "$CONTAINER" >/dev/null
tar --numeric-owner -czf "$BACKUP/data.tar.gz" -C "$DATA_DIR" .
tar -tzf "$BACKUP/data.tar.gz" >/dev/null
STEP=konfiguracja
python3 - "$CONFIG" "$TAG@$DIGEST" "$RUNTIME" <<'PY'
import os,re,sys,tempfile
from pathlib import Path
path=Path(sys.argv[1]);text=path.read_text()
if len(re.findall(r'^DOCKER_IMAGE_TAG=',text,re.M))!=1:raise SystemExit('DOCKER_IMAGE_TAG musi wystepowac dokladnie raz')
text=re.sub(r'^DOCKER_IMAGE_TAG=.*$',f'DOCKER_IMAGE_TAG="{sys.argv[2]}"',text,flags=re.M)
extra=re.findall(r'^NGINX_LOCATION_EXTRA=(.*)$',text,re.M)
if len(extra)>1:raise SystemExit('Powtorzone NGINX_LOCATION_EXTRA')
# Preserve literal, simply quoted existing location directives. Refuse shell expressions.
value=''
if extra:
    raw=extra[0].strip()
    if len(raw)<2 or raw[0] not in "\"'" or raw[-1]!=raw[0]:raise SystemExit('NGINX_LOCATION_EXTRA wymaga recznego przegladu')
    value=raw[1:-1]
    if any(c in value for c in ['\n',"'",'`','$(']):raise SystemExit('Zlozone NGINX_LOCATION_EXTRA wymaga recznego przegladu')
for directive in ['proxy_http_version 1.1;', 'proxy_set_header Upgrade $http_upgrade;', 'proxy_set_header Connection "upgrade";']:
    if directive in value:continue
    key=directive.split()[0]+(' '+directive.split()[1] if directive.startswith('proxy_set_header') else '')
    if re.search(r'(?<!\S)'+re.escape(key)+r'\s',value):raise SystemExit('Istniejace ustawienie WS wymaga recznego uzgodnienia: '+key)
    value=(value+' '+directive).strip()
line="NGINX_LOCATION_EXTRA='"+value+"'"
text=re.sub(r'^NGINX_LOCATION_EXTRA=.*$',lambda _:line,text,flags=re.M) if extra else text.rstrip()+'\n'+line+'\n'
def replace(p,data):
    st=p.stat();fd,tmp=tempfile.mkstemp(dir=p.parent,prefix='.release-')
    try:
        os.fchmod(fd,st.st_mode&0o777);os.fchown(fd,st.st_uid,st.st_gid)
        with os.fdopen(fd,'w') as f:f.write(data);f.flush();os.fsync(f.fileno())
        os.replace(tmp,p)
    finally:
        if os.path.exists(tmp):os.unlink(tmp)
replace(path,text)
# Existing flags/secrets are retained. New default: text on, voice off until separately configured.
runtime=Path(sys.argv[3]);data=runtime.read_text()
values={}
for raw in data.splitlines():
    if '=' in raw and not raw.lstrip().startswith('#'):
        key,val=raw.split('=',1);values[key.strip()]=val.strip().strip('\"\'')
voice_default='true' if values.get('TURN_URLS') and values.get('TURN_SECRET') else 'false'
for k,v in [('AETHERII_CHAT_ENABLED','true'),('AETHERII_VOICE_ENABLED',voice_default)]:
    if not re.search(r'^'+k+r'=',data,re.M):data=data.rstrip()+'\n'+k+'='+v+'\n'
replace(runtime,data)
PY
STEP=docker-update
DEPLOY_STARTED=1
bash "$MANAGER" docker-update kroniki-aetherii
STEP=kontrola-wersji-i-magazynu
READY=0
for (( i=0; i<45; i++ )); do
  if curl --fail --silent --show-error --max-time 3 "http://127.0.0.1:4173$URL_PREFIX/api/readiness" >/dev/null 2>&1; then READY=1; break; fi
  sleep 2
done
[[ "$READY" == 1 ]]
[[ "$(docker inspect --format '{{.Image}}' "$CONTAINER")" == "$(docker inspect --format '{{.Id}}' "$REF")" ]]
curl --fail --silent --show-error --max-time 15 "$PUBLIC_URL/api/version" | python3 -c 'import json,sys;assert json.load(sys.stdin)["version"]==sys.argv[1]' "$VERSION"
curl --fail --silent --show-error --max-time 15 "$PUBLIC_URL/api/readiness" >/dev/null
[[ "$(curl --silent --show-error --max-time 15 --output /dev/null --write-out '%{http_code}' "https://$DOMAIN/")" == 302 ]]
[[ "$(curl --silent --show-error --max-time 15 --output /dev/null --write-out '%{http_code}' "$PUBLIC_URL/")" == 200 ]]
CHAT_ENABLED="$(python3 - "$RUNTIME" <<'PY'
import sys
values=dict(line.strip().split('=',1) for line in open(sys.argv[1]) if '=' in line and not line.lstrip().startswith('#'))
print('0' if values.get('AETHERII_CHAT_ENABLED','true').strip('\"\'')=='false' else '1')
PY
)"
STEP=publiczny-WebSocket
if [[ "$CHAT_ENABLED" == 1 ]]; then
# A wrong ticket must be rejected AFTER the public proxy has performed the WS upgrade.
# No test rooms or player messages are created in production.
docker exec -i "$CONTAINER" node --input-type=module - "$PUBLIC_URL" <<'JS'
import { WebSocket } from 'ws';
const base=new URL(process.argv[2]),url=new URL(base.href.replace(/\/$/,'')+'/api/rooms/ZZZZZZ/communication');
url.protocol='wss:';
const timeout=setTimeout(()=>{console.error('Timeout WS');process.exit(1);},10000);
const ws=new WebSocket(url,{origin:base.origin});let opened=false;
ws.on('open',()=>{opened=true;ws.send(JSON.stringify({type:'auth',ticket:'invalid-release-probe'}));});
ws.on('close',code=>{clearTimeout(timeout);if(!opened||code!==1008)process.exitCode=1;});
ws.on('error',()=>{clearTimeout(timeout);process.exitCode=1;});
JS
else
  echo 'Czat jest jawnie wylaczony w runtime; test WS pominiety.'
fi
STEP=zakonczono
STOPPED=0
printf '\nWdrozenie OK: wersja %s, SHA %s\nBackup: %s\nSprawdz numer wersji w zasadach i audio na dwoch urzadzeniach.\n' "$VERSION" "$TAG" "$BACKUP"
