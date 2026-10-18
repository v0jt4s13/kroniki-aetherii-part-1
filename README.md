# Kroniki Aetherii · Korona i Cień

Przeglądarkowa gra fantasy dla 2–4 graczy, z rozgrywką online, kontami oraz lokalnym przeciwnikiem AI. Zasady pochodzą z [instrukcji autora](https://docs.google.com/document/d/1p6f3Cdwg4lqFfnI_wwpzwNWJxTPqIQF3SADTpmbqkEA/edit). Cztery frakcje rywalizują o 10 PZ i wspólnie bronią krainy przed najazdami. Kataklizm kończy grę porażką wszystkich.

Nowa oprawa powstała z pomocą **Product Design** i wbudowanego **Image Gen**: pięć terenów fantasy, pięć ikon zasobów i panoramiczna ilustracja nagłówka. Zachowano pergaminową stylistykę, geometrię planszy i chroniony podgląd urządzeń mobilnych. Grafiki: `app/public/game/aetherii/`. [Opis ilustracji i prompty](docs/grafiki-aetherii.md).

## Gra

- **Dublet daje kolejny obowiązkowy rzut** w tej samej turze. Rzucasz do pierwszego wyniku bez pary, a każdy rzut normalnie produkuje zasoby. Dopiero potem handlujesz i budujesz. SI stosuje tę samą zasadę.
- W dzienniku każdy rzut zapisuje rzeczywiste liczby zdobytych surowców dla wszystkich graczy, także zero po siódemce, niedoborze banku lub karze produkcji.
- W każdym trybie każdy gracz rozstawia **2 Strażnice i 2 Trakty Handlowe**, w kolejności wężykowej. Surowce startowe pochodzą z drugiej Strażnicy.
- Plansza ma do wyboru 19, 23 lub 25 heksów. Jedno pole jest pustkowiem bez numeru i nie produkuje zasobów. Pozostałe heksy produkują zasoby. Strażnica daje 1, Cytadela 2 surowce. Niedobór banku blokuje wypłatę danego rodzaju wszystkim graczom.
- Frakcje: Krasnoludy z Podziemi (podwójny Pancerz za Mitril), Elfy Skalne (Kamienne Echo), Elfy Leśne (ochrona Traktu za Zioła), Ludzie z Równin (surowiec za pierwszą wpłatę).
- Siódemka uruchamia najazd, zwiększa zagrożenie o 20% i wymusza odrzucenie połowy ręki ponad 7 kart. Złodziej został zastąpiony wspólną obroną.
- Bitwa następuje po turze poprzedzającej aktywującego gracza; Kamienne Echo dodaje jedną turę. Kolejne siódemki nie resetują terminu.
- Panel **Mobilizacja i wkłady** pokazuje Pancerz wszystkich graczy. Własne surowce można wpłacać po rzucie, przed budową. Wpłat nie można cofnąć.
- Wymagana obrona to liczba graczy × 3. Sukces daje nagrodę Bohatera Aetherii lub Karty Magii przy remisie. Porażka niszczy Trakty najmniej zaangażowanych i ogranicza produkcję przez rundę.
- Druga lub kolejna porażka z rzędu przy 100% zagrożenia wywołuje Kataklizm. Podczas najazdu zwycięstwo indywidualne czeka na rozstrzygnięcie bitwy.
- Koszty budowy i liczebność talii zachowano zgodnie z decyzją użytkownika. Rycerza zastępuje **Runiczna Tarcza** (+2 Pancerza). Pozostałe karty to Magiczne Trakty, Dar Aetherii, Zew Żywiołów i Kronika Chwały.

[Uściślenia niepełnych reguł i migracja zapisów](docs/zasady-aetherii.md).

## Uruchomienie

Wymagany Node.js 20.19+ lub 22.12+.

```sh
cd app
npm ci
npm run dev
```

Domyślny adres: `http://localhost:4173`. W sieci lokalnej użyj adresu IP komputera gospodarza. Tryb podglądu urządzeń: `/?preview=1`.

**Ze znajomymi**: wybierz wielkość planszy i obsadę pokoju, utwórz go i wyślij link. Dostępne są 2–4 osoby bez SI oraz pełne składy czteroosobowe: **1 człowiek + 3 SI**, **2 ludzi + 2 SI**, **3 ludzi + 1 SI**. Gospodarz może zmieniać planszę i obsadę w lobby. Przy składzie mieszanym start wymaga kompletu zadeklarowanych osób; pozostałe miejsca są zarezerwowane dla SI. Komputerowi gracze dołączają przy starcie z wolnymi frakcjami. Każda frakcja występuje raz. Zajętą frakcję przy dołączaniu zastępuje pierwsza dostępna; przed startem można zmienić ją w lobby.

**Z AI**: wybierz 1–3 przeciwników SI, frakcję i „Zagraj z AI”. Komputer rozstawia budowle, handluje, mobilizuje obronę i używa Magii. Korzysta z tych samych publicznych danych i własnej ręki co człowiek, bez zewnętrznej usługi AI. Rozgrywkę można wznowić po odświeżeniu i restarcie serwera.

## Konta i zapis

Rejestracja e-mailem i hasłem działa lokalnie. Konto umożliwia odzyskanie rozgrywki na drugim urządzeniu. [Konfiguracja logowania Google](docs/google-login.md).

Serwer przechowuje pokoje w `rooms.json`, a konta i sesje w `accounts.json`. Domyślny katalog to `app/data`; można go ustawić przez `AETHERII_DATA_DIR`. Serwer przyjmuje też dawną zmienną `CATAN_DATA_DIR`, jeśli `AETHERII_DATA_DIR` nie jest ustawione. Klucze zapisanych sesji pozostają zgodne ze starszą wersją. Nie publikuj katalogu danych. Przed pierwszą konwersją starych pokojów serwer tworzy kopię `rooms.pre-aetherii.json`.

## Wdrożenie

```sh
cd app
npm run build
npm start
```

Wymagany jest serwer Node.js; hosting samych plików statycznych nie obsługuje multiplayera. `PORT` (4173), `HOST` (`0.0.0.0`), `PUBLIC_URL` i `AETHERII_DATA_DIR` konfigurują instancję. Użyj jednego procesu ze stałym katalogiem danych oraz reverse proxy HTTPS. Przykład: `deploy/Caddyfile.example`.

Z katalogu repozytorium można uruchomić `docker compose up --build -d`. Istniejące nazwy usługi i wolumenu `catan-data` pozostają zachowane, aby nie odłączyć starych zapisów. Projekt nie został opublikowany w internecie.

Konfiguracja dla `projects_manager` na ops02 i adresu `https://ops02.jdblayer.com/kroniki-aetherii/`: [instrukcja wdrożenia](docs/projects-manager.md).

## Statystyki odwiedzin

Strona pokazuje liczbę obecnych i unikatowych odwiedzających z ostatnich 30 dni.
Wejścia, udane logowania i czas widocznej karty zapisują się bez danych kont i IP
w `traffic.json` w katalogu danych. Retencja wynosi 30 dni.
[Opis pomiaru i ograniczeń licznika osób](docs/statystyki-odwiedzin.md).

## Weryfikacja

```sh
cd app
npm test
npm run check:runtime
npm run build
npm run test:sites
npm run test:browser
npm run test:ai-browser
npm run test:features-browser
npm run test:aetherii-browser
npm run test:party-browser
npm run test:doubles-browser
```

Testy przeglądarkowe wymagają działającego serwera oraz Chrome (`CHROME_PATH`, domyślnie `/opt/google/chrome/chrome`). `AETHERII_URL` pozwala wybrać adres serwera. Obejmują rzeczywiste rozstawianie, synchronizację, AI, konta, handel, wpłaty do obrony, Kamienne Echo, ładowanie grafik trzy mieszane składy, plansze 19/23/25 oraz ekrany 320/393/1440 px. Zrzuty trafiają do `artifacts/`.

`test:sites` sprawdza zachowany szablon i opakowanie statycznego podglądu; nie zastępuje serwera gry.
