# Wpływ komunikacji graczy na publikację dev -> Git -> produkcja

Analiza kodu lokalnego: 28.10.2026. Zakres: repo gry i `/home/vs/repo/ops02/projects_manager`. Nie wykonywano SSH ani operacji na produkcji, commitów, pushów lub publikacji obrazów. „Stage (produkcja)” oznacza tu istniejącą instancję ops02; w sprawdzonej konfiguracji Kronik nie ma odrębnego środowiska stage.

## Wniosek

Proces pozostaje oparty na gotowym obrazie Docker, ale samo opublikowanie nowego kodu nie wystarczy do uruchomienia komunikacji. Przed pierwszym wydaniem trzeba dodać obsługę WebSocket w konfiguracji projektu managera i uzupełnić runtime. Głos wymaga osobno dostarczonej usługi TURN. Nie trzeba zmieniać wspólnego `production_manager.sh`, żeby uruchomić tekst.

```text
dev + testy
  -> commit i push repo gry
  -> budowa obrazu z dokładnie tej wersji
  -> push obrazu do GHCR z tagiem SHA gry
  -> ustawienie tagu i konfiguracji projektu na ops02
  -> kopia danych + docker-update
  -> testy HTTP, prywatnych zaproszeń, SQLite i WebSocket
  -> osobne uruchomienie/odbiór TURN i włączenie głosu
```

Samo `git pull` managera nie pobiera kodu gry i nie buduje jej obrazu. Nie znaleziono workflow CI w repo gry, który wykonywałby automatycznie cały powyższy ciąg.

## Ustalenia w kodzie

| Miejsce | Wpływ na wydanie |
| --- | --- |
| `projects_manager/production_manager.sh:759`, `write_docker_compose` | Generuje własny Compose z gotowym obrazem, `env_file`, pojedynczym bindem danych i jednym portem aplikacji. Nie czyta Compose z repo gry. |
| `production_manager.sh:861`, `docker_update` | Generuje Compose i Nginx, przeładowuje Nginx, następnie pobiera obraz i odtwarza kontener. Brak automatycznej kopii danych, oczekiwania na gotowość funkcji i automatycznego rollbacku. |
| `production_manager.sh:435`, `configure_nginx_prefix` | Odtwarza zarządzany blok prefiksu. Wstawia `NGINX_LOCATION_EXTRA`, ale domyślnie nie dodaje Upgrade/Connection ani jawnego HTTP/1.1. Ręczna poprawka wewnątrz zarządzanego bloku zostanie utracona. |
| `production_projects/kroniki-aetherii.env` | Port 4173, wspólny vhost `moderacja.conf`, strategia `prefix`, `/data` z bindu hosta, limit 512 MB. W lokalnym pliku nadal `DOCKER_IMAGE_TAG="latest"`. |
| `app/server/communication.mjs:5` | Worker SQLite tworzony także przy wyłączonym czacie. Tekst domyślnie włączony; głos wymaga TURN_URLS i TURN_SECRET oraz włączonych flag. |
| `app/server/start.mjs:132` i `Dockerfile` | Healthcheck sprawdza tylko odpowiedź HTTP `{ok:true}`. Nie potwierdza gotowości SQLite, WebSocket ani TURN. |
| `Dockerfile` | Nowe pliki serwera i zależności trafiają do obrazu; produkcyjne `npm ci --omit=dev --ignore-scripts` obsługuje wybrany `sql.js`. Konfiguracja TURN spoza `app/` nie jest kopiowana do obrazu gry. Build nie uruchamia testów API. |

## Co należy przygotować przed wydaniem

### 1. Git i zgodność obrazu z wersją

Zmiany komunikacji są nadal lokalne, w tym nowe pliki nieśledzone. Bieżący HEAD gry to `4b46b51`, sprzed implementacji. Nie wolno zbudować nowej funkcji z brudnego drzewa i oznaczyć jej tym starym SHA.

Najpierw przejrzeć zmiany, dodać wyłącznie właściwe pliki, zatwierdzić i wypchnąć. Osobno przejrzeć nieśledzony `kroniki-aetherii.env` w katalogu głównym gry; analiza nie odczytywała jego zawartości i nie zakłada, że nadaje się do publikacji. Nie używać `git add -A` i nie dodawać sekretów, danych, certyfikatów ani testowych kluczy.

Obraz budować z czystego checkoutu zatwierdzonego SHA gry, nie SHA managera. Opublikować i wdrażać tag SHA, nie `latest`. Ustawić ten sam tag w serwerowym `production_projects/kroniki-aetherii.env`. Lokalny plik managera i plik na serwerze mogą się różnić; samo `git pull` nie zastąpi serwerowych ustawień.

W istniejącej instrukcji managera znajduje się przykładowy, hardkodowany `TAG=4b46b5179f4f`. Przy tym wydaniu trzeba go zastąpić nowym SHA; inaczej zostanie pobrany stary obraz.

### 2. WebSocket przez Nginx

Do konfiguracji projektu managera, docelowo również jej serwerowego odpowiednika, dodać:

```bash
NGINX_LOCATION_EXTRA='proxy_http_version 1.1; proxy_set_header Upgrade $http_upgrade; proxy_set_header Connection "upgrade";'
```

Pojedyncze cudzysłowy są istotne: plik jest wykonywany przez Bash `source`, a `$http_upgrade` ma dotrzeć dosłownie do Nginx. Ten wariant nie wymaga globalnej mapy `$connection_upgrade`. Obecny timeout 300 sekund wystarcza dla heartbeat co 15 sekund.

Jeśli serwer już ma `NGINX_LOCATION_EXTRA`, należy rozszerzyć dotychczasową wartość zamiast ją zastępować. Zachować `NGINX_STRATEGY="prefix"`, istniejący `NGINX_SITE` i wszystkie pozostałe aplikacje domeny. Nie przełączać na `standalone`.

Dołączony do managera `docs/nginx-sites-available.md` pokazuje historyczny nagłówek standalone Kronik w pliku moderacji i brak ustawień WS. To sygnał do sprawdzenia aktualnego `nginx -T`, nie dowód obecnego stanu serwera. Sam plik w `sites-available` nie dowodzi też aktywnego podłączenia vhosta.

### 3. Runtime gry

Zmienne ustawić w `/opt/apps/kroniki-aetherii/.env`, ponieważ to plik wskazany przez `DOCKER_RUNTIME_ENV`, wczytywany przez wygenerowany Compose. Nie wystarczy dopisać ich do `production_projects/kroniki-aetherii.env` lub Compose repo gry.

Pierwsze wydanie proponuję z tekstem i wyłączonym głosem:

```dotenv
PUBLIC_URL=https://ops02.jdblayer.com/kroniki-aetherii
AETHERII_CHAT_ENABLED=true
AETHERII_VOICE_ENABLED=false
```

Zachować wszystkie pozostałe ustawienia kont i danych. Dokładny `PUBLIC_URL` jest ważny również dla autoryzacji Origin WebSocket. Po zmianie runtime wymagane jest odtworzenie kontenera; zwykły restart procesu nie importuje ponownie zmienionego `env_file` do istniejącego kontenera. Manager robi odtworzenie w `docker-update` i `docker-restart`.

### 4. TURN jako osobna usługa

`docker-update kroniki-aetherii` nie utworzy coturn. `compose.turn.yaml` i `deploy/turn/turnserver.conf` trzeba dostarczyć na serwer osobnym, powtarzalnym krokiem. Nie dopisywać ręcznie coturn do generowanego `/opt/apps/kroniki-aetherii/docker-compose.yml`, bo kolejna aktualizacja nadpisze ten plik.

Najmniejszy zakres: oddzielny katalog i projekt Compose dla TURN, obsługiwany niezależnie od managera gry, z przypiętym digestem obrazu. Obecny generator managera nie obsługuje bezpośrednio potrzebnego zestawu: `network_mode: host`, dodatkowych montowań certyfikatów i konfiguracji oraz parametrów startowych coturn. Dodanie TURN jako zwykłego drugiego projektu bez rozszerzenia generatora nie jest równoważne z gotową konfiguracją.

Wymagane: DNS, publiczny adres, certyfikat, zgodny sekret po obu stronach, porty UDP/TCP/TLS i zakres relay; dokładna lista w `komunikacja-graczy.md`. Zaplanować odnawianie certyfikatu i jego przeładowanie przez coturn. Zamontowanie całego katalogu zachowuje ścieżki lepiej niż pojedyncze pliki, ale nie gwarantuje samo automatycznego przeładowania certyfikatu. Typowe certyfikaty systemowe mają symlinki do katalogu archive i ograniczone prawa; trzeba zapewnić dostęp do rzeczywistych plików kontenerowi UID 65534, bez upubliczniania klucza prywatnego.

Dopiero po odbiorze TURN uzupełnić runtime gry:

```dotenv
AETHERII_VOICE_ENABLED=true
TURN_URLS=turn:turn.example.com:3478?transport=udp,turns:turn.example.com:5349?transport=tcp
# TURN_SECRET wprowadza administrator, nie trafia do Git ani dokumentacji.
```

Przy domyślnym relay-only niedostępny TURN oznacza brak audio; nie ma awaryjnego bezpośredniego połączenia. Samo ustawienie URL i sekretu spowoduje pokazanie funkcji jako dostępnej, więc odbiór wymaga rzeczywistego audio na dwóch urządzeniach w różnych sieciach.

### 5. Dane, pamięć i zgodność klientów

Obecny bind `/opt/apps/kroniki-aetherii/data -> /data` obejmie nowy `chat.sqlite` bez zmiany generatora. Katalog i pliki muszą być zapisywalne przez UID 1000. Nie ma zewnętrznej migracji SQL do wykonania ręcznie: worker tworzy tabele przy starcie. Pola zaproszeń i dostępu dochodzą do pokojów przy operacjach aplikacji; istniejący skład gospodarz zatwierdza przed otwarciem komunikacji.

Kopia przed wydaniem powinna obejmować cały katalog danych po zatrzymaniu aplikacji: pokoje, konta/sesje, statystyki i czat, jeśli już istnieje. Po pierwszym wydaniu trzeba uwzględnić historię w retencji kopii i procedurze odtworzenia.

512 MB nie jest automatycznie potwierdzonym limitem dla pełnej historii. `sql.js` trzyma bazę w pamięci, a kod robi jej kopię i eksport przy operacjach. Limit 100 000 wiadomości nie gwarantuje zmieszczenia w 512 MB. Przed zwiększaniem skali potrzebny jest pomiar RSS i test reprezentatywnej historii; dla dużej historii należy rozważyć natywny SQLite. Nie uruchamiać dwóch instancji na tych samych plikach w celu uzyskania blue/green lub zero downtime.

Odtworzenie kontenera zerwie WebSocket i głos. Klient ponowi tekst, ale mikrofon nie włączy się automatycznie. Gracze powinni przeładować otwarte karty po wydaniu: stary frontend nadal udostępnia link z samym kodem, a nowy backend już wymaga prywatnego zaproszenia. Dotychczasowe linki z kodem pozostają wskazaniem pokoju, nie zgodą na nowe członkostwo. Istniejący gracze zachowują możliwość powrotu przez swój token/konto.

## Bramki odbioru wydania

1. Przed obrazem: `npm test`, `npm run check:runtime`, `npm run build`, `npm run test:prefix`, `npm run test:sites`; build i test komunikacji wewnątrz obrazu produkcyjnego. To bramka procesu wydania, której manager sam nie uruchamia.
2. Na serwerze przed zmianą: odczyt rzeczywistej konfiguracji projektu/runtime bez ujawniania sekretów, zapis poprzedniego tagu i konfiguracji Nginx, sprawdzenie dostępności backupu i właściciela danych.
3. Po publikacji: HTTP gry i istniejącej moderacji; logowanie, stare konto i odzyskanie gry; nowy link jednorazowy oraz odrzucenie wejścia samym kodem.
4. Funkcje: autoryzowany odczyt i zapis historii, połączenie WS przez publiczne HTTPS z wynikiem 101, przesłanie wiadomości między dwiema osobami i odmowa dostępu z innego pokoju. Samo `/api/health` i stan running/healthy nie wystarczają.
5. Głos osobno: dwa urządzenia, różne sieci, Mic/praca ciągła/lokalne mute, ponowne połączenie i zatrzymanie nadawania po zamknięciu panelu. W razie problemu wyłączyć wyłącznie głos i odtworzyć kontener.

## Rollback

Cofnięcie samego tagu do wersji sprzed komunikacji przywróci też wejście po kodzie. Starszy kod może pominąć nowe pola przy prezentacji i nie obsłuży czatu; nie należy zakładać, że w każdym scenariuszu ponownego zapisu zachowa wszystkie nowe dane. Zamknięcie czatu flagą nie wyłącza nowego mechanizmu zaproszeń i nie przywraca starego zachowania dołączania. Worker SQLite jest tworzony również przy `AETHERII_CHAT_ENABLED=false`, więc ta flaga nie jest obejściem problemów z inicjalizacją magazynu.

Preferowana reakcja na problem głosu: `AETHERII_VOICE_ENABLED=false`. Na problem samego panelu można wyłączyć komunikację, pozostawiając nowy mechanizm zaproszeń, o ile przyczyna nie dotyczy zasobów całego procesu. Przy powrocie do starego obrazu trzeba zablokować nowe dołączenia do lobby na proxy albo zaakceptować utratę prywatnych zaproszeń. Pełne odtworzenie backupu cofa również postęp gry od momentu jego wykonania; nie wykonywać go automatycznie przy każdym błędzie wdrożenia.

## Sprawdzenia wykonane podczas tej analizy

Przetestowano wyłącznie wyodrębnione funkcje managera na plikach tymczasowych. Dwa kolejne wygenerowania konfiguracji potwierdziły zachowanie literalnego `$http_upgrade`, obecność nagłówków WS z `NGINX_LOCATION_EXTRA`, pozostawienie istniejącej trasy głównej, zachowanie runtime i pliku danych oraz brak automatycznego generowania TURN. `bash -n production_manager.sh` zakończył się poprawnie. Nie uruchamiano akcji wdrożeniowych managera ani nie modyfikowano jego repozytorium.
