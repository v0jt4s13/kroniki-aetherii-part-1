# Wdrożenie przez projects_manager

Przygotowana konfiguracja projektu `kroniki-aetherii` znajduje się w repozytorium
`ops02/projects_manager`, w `production_projects/kroniki-aetherii.env`.
Konfiguracja i pierwsze wdrożenie: jego `docs/kroniki-aetherii.md`; wdrożenie nowej wersji
na serwerze (kopia danych, tag SHA, kontrola, wycofanie): `docs/kroniki-aetherii-wdrozenie.md`.

## Budowa i publikacja obrazu

Manager nie buduje obrazu gry. Na maszynie z Dockerem, z katalogu tego repozytorium, po
zatwierdzeniu i spushowaniu zmian na `main`:

```bash
git fetch -q && git status -sb | head -2          # main...origin/main, bez "ahead"
git log --oneline -1                               # to ma być wersja do wdrożenia
IMAGE=ghcr.io/v0jt4s13/kroniki-aetherii-part-1; TAG=$(git rev-parse --short=12 HEAD); echo "TAG=$TAG"

docker build --pull --no-cache -t "$IMAGE:$TAG" -t "$IMAGE:latest" . 2>&1 | tail -3
docker run --rm "$IMAGE:$TAG" grep -o 'src="[^"]*"' dist/client/play.html      # ma być ./assets/game-...
docker run --rm "$IMAGE:$TAG" grep -c 'aetheriiTheme' dist/client/play.html    # ma być 1 (skrypt motywu)
```

Gdy `play.html` ma `/assets/...` (ścieżka bezwzględna), nie publikuj: strona pod prefiksem
szuka plików w `ops02.jdblayer.com/assets/` i dostaje 404 od moderacji.

```bash
docker login ghcr.io -u v0jt4s13      # PAT (classic) z write:packages
docker push "$IMAGE:$TAG" && docker push "$IMAGE:latest"
docker buildx imagetools inspect "$IMAGE:$TAG" | sed -n 3p     # digest tagu SHA
docker buildx imagetools inspect "$IMAGE:latest" | sed -n 3p   # powinien być ten sam
```

Jako hasło wklej GitHub Personal Access Token (classic), nie hasło do konta. Do publikacji
wymaga `write:packages`, do pobierania prywatnego obrazu na serwerze wystarczy
`read:packages` i dostęp do pakietu. Token fine-grained nie działa z GHCR przy tym sposobie
logowania. Nie zapisuj tokenu w repozytorium. Buduj dla architektury serwera ops02
(`uname -m` na serwerze); przy innej architekturze maszyny budującej użyj `docker buildx`
z odpowiednią platformą.

Wdrażaj po **tagu SHA**, nie po `latest`: przy wdrożeniu 2026-10-18 `docker push` dla
`latest` zgłosił nowy digest, a rejestr nadal zwracał stary obraz, więc serwer pobierał starą
wersję bez błędu. Tag SHA służy też do powrotu do poprzedniego obrazu. Dalszy ciąg (serwer):
`ops02/projects_manager/docs/kroniki-aetherii-wdrozenie.md`.

- Serwer: ops02; adres: `ops02.jdblayer.com/kroniki-aetherii`.
- Obraz: `ghcr.io/v0jt4s13/kroniki-aetherii-part-1:latest`, budowany z głównego Dockerfile.
- Nginx: `NGINX_STRATEGY="prefix"`, `URL_PREFIX="/kroniki-aetherii"`, istniejący plik domeny `/etc/nginx/sites-available/moderacja.conf` (potwierdź na serwerze).
- Proxy Nginx: `127.0.0.1:4173`, port kontenera: `4173`.
- Katalog aplikacji: `/opt/apps/kroniki-aetherii`.
- Runtime env: `/opt/apps/kroniki-aetherii/.env`, z `PUBLIC_URL=https://ops02.jdblayer.com/kroniki-aetherii`.
- Trwałe dane: `/opt/apps/kroniki-aetherii/data`, montowane do `/data`, właściciel 1000:1000.

Manager wymaga wersji obsługującej `DOCKER_DATA_DIR` i `DOCKER_DATA_TARGET`.
Nie używaj starszego generatora Compose dla tej gry, ponieważ nie zachowa zapisów
podczas odtworzenia kontenera. Dane z wcześniejszego wolumenu `catan-data` należy
przenieść przy zatrzymanej aplikacji przed pierwszym wdrożeniem.

Po opublikowaniu obrazu i pierwszej konfiguracji na serwerze właściciel aktualizuje grę:

```bash
cd /opt/apps/projects_manager
sudo ./production_manager.sh docker-update kroniki-aetherii
sudo ./production_manager.sh docker-status kroniki-aetherii
curl --fail http://127.0.0.1:4173/api/health
```

Przy pierwszym wdrożeniu używa `docker-setup` zamiast `docker-update`.
Manager nie buduje obrazu gry; nowy obraz należy wcześniej opublikować w GHCR.
Dokumentacja managera zawiera komendy publikacji, konfigurację prywatnego rejestru,
HTTPS, kopie danych, powrót do poprzedniej wersji i opcjonalne zadania schedulera.
Przygotowanie tych plików nie oznacza publikacji obrazu ani wdrożenia na produkcji.

Prefiks dla API, grafik i logowania pochodzi z `PUBLIC_URL`; po zmianie adresu
wymagany jest nowy obraz z obsługą prefiksu. Test wdrożenia lokalnego: `cd app`
i `npm run test:prefix`. Google OAuth wymaga callbacku
`https://ops02.jdblayer.com/kroniki-aetherii/api/auth/google/callback`.
