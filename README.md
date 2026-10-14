# Catan · Papierowa wyspa

Gra przeglądarkowa po polsku, oparta na pierwszym projekcie Product Design: pergamin, ilustrowane tereny i zielone przyciski. Pełny widok gry działa na telefonie i komputerze; podgląd template’u mobilnego jest dostępny osobno pod `/?preview=1`.

## Uruchomienie lokalne

Wymagany Node.js 20.19+ lub 22.12+ i npm.

```sh
cd app
npm ci
npm run dev
```

Otwórz `http://localhost:4173`. Serwer nasłuchuje na `0.0.0.0:4173`. W lokalnej sieci na telefonie użyj `http://ADRES_IP_KOMPUTERA:4173` i utwórz pokój z tego adresu, aby link zaproszenia zawierał adres dostępny dla pozostałych graczy.

Wpisz imię i wybierz tryb rozgrywki:

- **Ze znajomymi (3–4 graczy)**: wybierz **Stwórz pokój**, skopiuj link w **Zaproś znajomych**. Gospodarz rozpoczyna grę po dołączeniu 3 lub 4 osób.
- **Z AI (Ty + komputer)**: wybierz **Zagraj z AI**. Gra rozpoczyna się od razu, bez zapraszania drugiej osoby.
- **Trening ze znajomym (2 graczy)**: pokój dla dwóch ludzi, do którego druga osoba dołącza przez link.

Oba tryby dwuosobowe są dodatkowym wariantem treningowym: każdy gracz rozstawia **4 osady i 4 drogi**, w kolejności 1–2–2–1–1–2–2–1. Początkowe surowce otrzymuje za swoją czwartą osadę. Wariant stosuje zwykłą planszę, bez neutralnych graczy ani specjalnych zasad oficjalnych wariantów dwuosobowych. Zmiana dotyczy nowo rozpoczynanych gier; rozpoczęte rozgrywki zachowują zapisane rozstawienie.

Komputer sam rozstawia osady i drogi, rzuca kośćmi, rozbudowuje sieć, wymienia surowce w banku i portach, zagrywa karty oraz obsługuje złodzieja i odrzucanie kart. Przyjmuje opłacalne oferty człowieka. Korzysta z prostej strategii opartej na prawdopodobieństwie produkcji i potrzebach budowy; nie widzi ręki przeciwnika ani przyszłych rzutów. Działa lokalnie na serwerze bez usług AI i kluczy API. Tury komputera oraz zapis gry działają także po zamknięciu strony; po ponownym otwarciu tego samego linku w tej samej przeglądarce wrócisz do gry.

## Konta i powiadomienia

Nad tytułem gry wybierz **Zaloguj / załóż konto**. Rejestracja e-mailem i hasłem działa od razu; **Moje konto** pozwala wracać do przypisanych rozgrywek na innym urządzeniu. Logowanie Google wymaga własnej aplikacji OAuth — kompletna instrukcja znajduje się w [docs/google-login.md](docs/google-login.md), a szablon zmiennych w `app/.env.example`.

Propozycje handlu i własna tura wyświetlają popup z przyciskiem przejścia do akcji. W nieaktywnej karcie zmienia się także tytuł strony. Opcjonalne powiadomienia systemowe włącza się pod akcjami gracza; wymagają zgody przeglądarki. Strona musi pozostawać otwarta.

## Zaimplementowana rozgrywka

- Losowa wyspa: 19 terenów, 54 skrzyżowania, 72 krawędzie, 9 portów. Sąsiednie tereny nie mają jednocześnie żetonów 6/8.
- Początkowe osady i drogi w kolejności tam–z powrotem: po 2 dla 3–4 graczy, po 4 dla 2 graczy. Surowce za ostatnią osadę początkową.
- Podsumowanie własnych surowców faktycznie zdobytych po każdym rzucie, także przeciwnika. Komunikat o braku zdobyczy oraz zachowanie ostatniego wyniku po zmianie tury i odświeżeniu.
- Rzuty dwóch kości i produkcja wszystkich graczy, bank po 19 kart każdego surowca, reguły niedoboru.
- Osady, miasta i drogi: koszty, odstępy, połączenia i limity 5/4/15 pionków.
- Wynik 7: samodzielny wybór odrzucanych kart, przesunięcie złodzieja, wybór okradanego sąsiada i losowanie karty.
- Wymiany bankowe 4:1 i porty 3:1/2:1 oraz oferty dla innych graczy z akceptacją.
- Kryptograficzne, niezależne rzuty kości na serwerze; nowy losowy wybór karty z pozostałej talii przy każdym zakupie, bez zwracania karty do talii. Powtórzenia wyników pozostają możliwe.
- Talia 25 kart: Rycerz, Budowa dróg, Rok urodzaju, Monopol i ukryte punkty; limit jednej karty akcji na turę i zakaz zagrywania w turze zakupu.
- Najdłuższa droga z uwzględnieniem rozwidleń, pętli i przecięcia przez przeciwnika, największa armia, remisy i zwycięstwo przy 10 punktach we własnej turze.
- Prywatne ręce i karty, synchronizacja przez serwer, dziennik, powrót po odświeżeniu, trwały zapis pokojów.
- Przesuwanie planszy, pinch-to-zoom i przyciski powiększania oraz wyśrodkowania.

Przyjęta wersja zasad odpowiada wskazanej [polskiej instrukcji REBEL](https://files.rebel.pl/files/instrukcje/Settlers-of-Catan.pdf), w tym kolejności **handel, potem budowa** oraz zakazowi przeniesienia złodzieja z powrotem na pustynię. Pierwszy ruch należy do gospodarza pokoju. Gra nie zawiera rozszerzeń.

## Produkcja i granie przez internet

Link do `localhost` działa wyłącznie na komputerze gospodarza. Do grania przez internet potrzebny jest dostępny publicznie serwer Node.js. Sam hosting statycznych plików nie zapewni wspólnej sesji. Projekt nie został opublikowany w internecie.

```sh
cd app
npm run build
npm start
```

`PORT` (domyślnie `4173`), `HOST` (domyślnie `0.0.0.0`) i `CATAN_DATA_DIR` (domyślnie `app/data`) konfigurują serwer. Wystaw go za reverse proxy HTTPS i użyj jednego procesu aplikacji ze stałym katalogiem danych. Stan zapisuje się atomowo do `rooms.json`, a konta i sesje do `accounts.json`; nie uruchamiaj kilku replik na tych samych plikach. Zapis zawiera identyfikatory sesji graczy — nie publikuj katalogu danych. Gość traci klucz powrotu przy zmianie urządzenia lub usunięciu danych przeglądarki; konto pozwala odzyskać przypisaną grę po zalogowaniu. Dla produkcji ustaw `PUBLIC_URL` na adres HTTPS.

Alternatywnie, z katalogu repozytorium:

```sh
docker compose up --build -d
```

Obraz uruchamia serwer produkcyjny na porcie 4173 i zapisuje stan w nazwanym wolumenie `catan-data`. Do publicznego udostępnienia skieruj swoją domenę HTTPS na ten port; przykładowy plik Caddy znajduje się w `deploy/Caddyfile.example`.

## Sprawdzenie

```sh
cd app
npm test
npm run check:runtime
npm run build
npm run test:sites
node scripts/browser-check.mjs
npm run test:ai-browser
npm run test:features-browser
```

Test przeglądarkowy wymaga Chrome (domyślnie `/opt/google/chrome/chrome`, zmienna `CHROME_PATH`) i działającego serwera (`CATAN_URL`, domyślnie `http://127.0.0.1:4173`). Tworzy osobny pokój testowy i cztery niezależne konteksty przeglądarki; sprawdza dołączanie, rozstawianie kliknięciami, powrót po odświeżeniu, przesuwanie i zoom, pierwszy rzut oraz zmianę tury. Zrzuty i wynik trafiają do `artifacts/`.

`test:ai-browser` sprawdza wybór trybu z AI na telefonie, rozstawianie obu stron, automatyczną turę komputera, powrót po odświeżeniu i dziennik. `npm test` obejmuje też pełne rozgrywki AI do 10 punktów, prywatność kart, handel, odrzucanie oraz wznowienie automatycznych ruchów po restarcie serwera.

`test:sites` sprawdza zachowany starter Product Design; nie oznacza możliwości uruchomienia tego wieloosobowego backendu na hostingu statycznym Sites. Właściwy runtime multiplayer to `server/start.mjs`.

Kod interfejsu: `app/src/Prototype.tsx`, `Board.tsx`, `prototype.css`, `native.css`. Reguły: `app/server/engine.mjs`. Strategia AI: `app/server/bot.mjs`. API i trwały zapis: `app/server/start.mjs`. Chroniony runtime podglądu Product Design pozostaje bez zmian.
