# Wdrożenie przez projects_manager

Przygotowana konfiguracja projektu `kroniki-aetherii` znajduje się w repozytorium
`ops02/projects_manager`, w `production_projects/kroniki-aetherii.env`.
Pełna procedura jest w jego `docs/kroniki-aetherii.md`.

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
