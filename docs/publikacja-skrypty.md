# Publikacja gry w dwóch krokach

Skrypty zastępują ręczną sekwencję z `projects_manager/docs/kroniki-aetherii-wdrozenie.md` dla istniejącej instalacji na ops02. Stary dokument zawiera konkretny historyczny tag i nie obejmuje WebSocket ani kontroli SQLite. Nie kopiuj z niego `TAG=4b46b5179f4f` do nowego wydania.

## 1. Repo deweloperskie

Najpierw przejrzyj, zatwierdź i wypchnij implementację oraz te skrypty. Wymagane jest czyste repo na `main`; skrypt nie dodaje automatycznie innych plików ani sekretów. `origin/main` musi być przodkiem lokalnej gałęzi lub wskazywać ten sam commit. Skrypt wypchnie również lokalne, wcześniej zatwierdzone commity.

```bash
./deploy/01-publish-repo.sh
```

Można również wywołać przez sudo:

```bash
sudo ./deploy/01-publish-repo.sh
```

Git i npm działają jako pierwotny użytkownik, aby zachować jego SSH, konfigurację Git i właściciela plików. Skrypt sprawdza wersję Node w PATH. Jeśli brakuje Node lub systemowy Node jest za stary, wybiera zgodną, już zainstalowaną wersję z NVM tego użytkownika (preferuje 22). Nie instaluje ani nie aktualizuje Node automatycznie. Docker korzysta z tego samego konta albo sudo, jeśli użytkownik nie ma dostępu do demona. Logowanie do GHCR odbywa się interaktywnie w tym samym kontekście co push; wymagany jest dostęp do publikowania pakietu.

Sam wybór środowiska po `sudo` można sprawdzić bez publikacji i bez zmian w repo:

```bash
sudo ./deploy/01-publish-repo.sh --check-runtime
```

Skrypt wykonuje:

1. Blokadę równoległej publikacji i kontrolę repo, narzędzi oraz gałęzi.
2. Podbicie wersji patch w `app/package.json` i obu miejscach wersji w lockfile, np. `0.1.0 -> 0.1.1`. Ten sam numer pokazuje panel zasad obok X i `/api/version`. Nie jest to numer reguł silnika `rulesVersion`.
3. `npm ci`, testy, kontrolę runtime, build z testem prefiksu i test statycznego opakowania Sites. Automatyzacja przeglądarki nie jest uruchamiana.
4. Commit `Release <wersja>` zawierający wyłącznie dwa pliki wersji i zwykły push na `origin/main`.
5. Budowę obrazu produkcyjnego z etykietami wersji/SHA, sprawdzenie ścieżek grafik i inicjalizacji SQLite, publikację tagu SHA do GHCR oraz odczyt digestu. Nie publikuje `latest`.
6. Pakiet `.release/<wersja>-<SHA>/` i `.tar.gz`, zawierający `manifest.json` oraz samodzielny skrypt serwerowy. Pakiet nie zawiera danych graczy, konfiguracji runtime ani sekretów.

Domyślna platforma to `linux/amd64`; dla serwera ARM użyj `--platform linux/arm64`. Przy budowaniu na innej architekturze Docker musi mieć odpowiednią obsługę emulacji. Dla większej zmiany wersji można wybrać `--bump minor` lub `--bump major`.

Jeżeli test, push lub rejestr przerwą operację:

```bash
./deploy/01-publish-repo.sh --resume
```

Stan `.release/pending.json` pozwala wznowić bez kolejnego podbicia numeru. Przed utworzeniem commita wydania HEAD nie może się zmienić. Po jego utworzeniu dopuszczalny jest zatwierdzony commit naprawczy będący jego potomkiem, przy czystym repo i zachowaniu numeru wersji. Skrypt testuje i buduje migawkę oryginalnego commita przez `git archive`, więc poprawienie samego procesu publikacji nie zmienia zawartości obrazu oznaczonego starym SHA. Skrypt serwerowy w pakiecie również pochodzi z tej migawki. Nieudana publikacja nie cofa automatycznie wersji ani nie przepisuje historii Git. Istniejący tag SHA jest pobierany i weryfikowany zamiast przebudowywany; błędu połączenia z rejestrem nie traktujemy jako zgody na nadpisanie tagu.

## 2. Serwer ops02

Przenieś wygenerowany pakiet na serwer używanym przez Ciebie kanałem SSH/SCP i rozpakuj go w katalogu roboczym. Skrypty nie zakładają sposobu przejścia przez bastion i nie wykonują transferu przez SSH automatycznie.

Przykład wewnątrz rozpakowanego katalogu:

```bash
sudo ./02-update-server.sh ./manifest.json --check-only
sudo ./02-update-server.sh ./manifest.json
```

Jeśli uruchamiasz plik bezpośrednio z repo gry skopiowanego na serwer:

```bash
sudo ./deploy/02-update-server.sh /sciezka/do/manifest.json
```

Domyślny manager to `/opt/apps/projects_manager`; można wskazać inny katalog przez `--manager-dir`. To skrypt aktualizacji istniejącej instalacji, nie jej zakładania. Wymaga istniejących danych, konfiguracji projektu, runtime, Compose i działającego kontenera. Manager musi już obsługiwać `DOCKER_DATA_DIR` i `NGINX_LOCATION_EXTRA`. Jeżeli wymaga aktualizacji, wykonaj ją oddzielnie jako właściciel repo managera; skrypt nie uruchamia na nim `git pull` jako root.

Blokada obejmuje równoległe uruchomienia tego skryptu. Bezpośrednie wywołania managera i scheduler nie korzystają z niej; na czas publikacji nie uruchamiaj konkurencyjnego zadania aktualizacji Kronik.

Skrypt serwerowy:

1. Waliduje manifest jako JSON, SHA, nazwę obrazu, digest i platformę. Kontroluje `prefix`, domenę, port, bind danych, zapisywalność `/data`, aktualny Nginx i odpowiedź moderacji 302. Nie wypisuje runtime ani tokenów.
2. Pobiera obraz przypięty do SHA i digestu, sprawdza etykiety i wersję pakietu, zanim zatrzyma grę.
3. Blokuje równoległą aktualizację, zatrzymuje stary kontener i archiwizuje cały katalog danych. Zapisuje poprzedni obraz oraz kopie konfiguracji w `/root/kroniki-aetherii-backups/<czas>-<SHA>.*` z dostępem tylko dla roota.
4. Ustawia `DOCKER_IMAGE_TAG="<SHA>@sha256:<digest>"` w istniejącym pliku projektu. Rozszerza `NGINX_LOCATION_EXTRA` o HTTP/1.1 i nagłówki WS, zachowując inne proste dyrektywy; sprzeczne lub złożone ustawienia zatrzymują aktualizację zamiast być nadpisane.
5. Zachowuje sekrety i jawne flagi runtime. Przy braku flag dodaje tekst włączony; głos wyłączony, chyba że istnieją już kompletne credentials TURN. Nie instaluje, nie restartuje i nie konfiguruje samego TURN.
6. Uruchamia `production_manager.sh docker-update kroniki-aetherii`.
7. Sprawdza uruchomiony obraz, `/api/version`, `/api/readiness`, publiczne HTTPS, moderację i handshake WS przez publiczne Nginx. Nie tworzy testowych pokojów ani wiadomości na produkcji. Przy jawnie wyłączonym czacie pomija handshake WS.

`--check-only` wykonuje kontrole wstępne, również odczyty HTTP/Docker, bez pobierania obrazu, zatrzymywania usług i zapisywania konfiguracji. Nie zastępuje odbioru po wdrożeniu.

## Błąd i rollback

Błąd przed wywołaniem managera przywraca zapisane konfiguracje i uruchamia ten sam stary kontener, jeżeli był już zatrzymany. Błąd po rozpoczęciu aktualizacji zatrzymuje grę, przywraca kopie konfiguracji oraz Nginx i wskazuje backup. Nie uruchamia sam starego kodu i nie odtwarza danych graczy. Powrót do wersji sprzed prywatnych zaproszeń zmienia zasady dostępu; wymaga świadomej decyzji operatora.

Backup danych to archiwum z zatrzymanej aplikacji, a nie automatyczna instrukcja do odtworzenia przy dowolnym błędzie. Jego przywrócenie cofa także postęp gry. Kopie zawierają dane i sekrety; administrator ustala ich retencję i usuwa je zgodnie z nią.

Po udanym wdrożeniu otwórz zasady i sprawdź numer wersji przy X. Głos wymaga osobnego odbioru mikrofonów na dwóch urządzeniach przez skonfigurowany TURN. Restart aplikacji rozłącza głos; nie ma automatycznego włączania mikrofonu po powrocie.
