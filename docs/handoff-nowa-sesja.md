# Handoff: nowa sesja o budowie gry Kroniki Aetherii

Stan na 2026-10-18, po merge'u smoka do `main` (`838a498`) i wdrożeniu na ops02 (obraz
`f49b810dda0b`). Dokument opisuje, co jest zrobione i zweryfikowane, co otwarte i jak
zacząć. Prompt startowy jest na końcu.

## Stan gry

- Repo: `~/repo/ops02/app_kroniki-aetherii-part-1`, gałąź `main` (zgodna z `origin/main`).
  Nieśledzony `kroniki-aetherii.env` zawiera poświadczenia: nie commituj go i nie cytuj.
- `main` zawiera linię smoka: frakcje, najazdy i smok (`docs/grafika-smoka.md`), motyw
  jasny/ciemny (`src/ThemeSwitch.tsx`, `src/theme.css`), tryb AI 1-3, plansze 19/23/25
  heksów, dublety, statystyki odwiedzin (`server/traffic.mjs`), prefiks URL
  (`server/base-path.mjs`, `src/app-path.ts`).
- Z drugiej linii zachowano: `base: "./"` w `app/vite.config.ts` (ścieżki względne pod
  prefiksem), rzadsze siódemki i napis "Mniej 7" w podpowiedzi lobby.
- Reguły i uzupełnienia: `docs/zasady-aetherii.md`, preferencje produktu: `app/AGENTS.md`.
  Wariant treningowy 2 graczy z czterema osadami już nie istnieje (zasady 2-4 graczy).

## Uruchomienie i testy

- Praca w `app/`: `npm ci`, `npm run dev` (serwer na `0.0.0.0:4173`, `PORT=4174` gdy zajęty;
  lokalny kontener compose potrafi zajmować 4173: `docker compose down`).
- Testy: `npm test` (72 testy przechodziły po buildzie), `npx tsc --noEmit`, `npm run build`.
  Wynik buildu ma mieć `./assets/...` w `dist/client/play.html`.
- Testy przeglądarkowe (`npm run test:*-browser`) wymagają Chrome i działającego serwera;
  w tej sesji nie były uruchamiane.

## Reguła siódemek

`server/engine.mjs`, akcja `roll`: z każdych czterech wylosowanych siódemek zostaje jedna
(1., 5., 9. ...), pozostałe są losowane od nowa (`g.sevens`, `% 4 !== 1`). Symulacja
400 tys. rzutów dała ok. 4,2% siódemek (naturalnie 16,7%). Pierwsza siódemka w grze zawsze
działa, bo testy tego wymagają. Test filtra: `tests/aetherii.test.mjs` (test na końcu pliku);
helper `seven()` zeruje licznik.

## Wdrożenie

Budowa i publikacja obrazu: `docs/projects-manager.md` (ten repo). Część serwerowa:
`ops02/projects_manager/docs/kroniki-aetherii-wdrozenie.md`. Zasady: wdrażaj po tagu SHA z
`git rev-parse --short=12 HEAD` uruchomionego **w tym repo** (nie w `projects_manager`),
nigdy po `latest`; po wdrożeniu sprawdź `play.html` w kontenerze, `/api/health` i `/` ops02
(302). Wersja z merge'a zmieniła nazwy ciasteczek (`aetherii_*`) i kluczy `localStorage`
(`aetherii:*`): aktywni gracze zostali wylogowani.

## Otwarte (niezweryfikowane lub niezrobione)

- Wygląd gry w obu motywach w przeglądarce nie był oglądany po merge'u. Naprawa polegała na
  przywróceniu `prototype.css` i `native.css` ze smoka (ciemna paleta z `main` wchodziła do
  bazy). Przełącznik jest dwustanowy (jasny/ciemny), domyślnie jasny, bez trybu Auto.
- `TODO.md`: w menu ustawień dźwięki (początek tury, zlecenie wymiany, utrata/zysk
  zasobów) oraz limit czasu na turę albo bez limitu. Nic z tego nie jest zaczęte.
- Panel "Jak grać" w `src/Prototype.tsx` i `README.md` nie opisują rzadszych siódemek.
- Testy przeglądarkowe nie były uruchomione po merge'u.
- Przy pierwszej partii po wdrożeniu sprawdź zachowanie z nowymi nazwami ciasteczek (logowanie,
  powrót do pokoju).

## Prompt startowy

```
Pracujemy nad grą Kroniki Aetherii (repo ~/repo/ops02/app_kroniki-aetherii-part-1, gałąź main,
Node.js, praca w app/). Zacznij od przeczytania docs/handoff-nowa-sesja.md, app/AGENTS.md,
docs/zasady-aetherii.md i TODO.md, potem git status -sb i git log --oneline -5.

Zasady pracy: odpowiadaj po polsku i zwięźle; zmiana minimalna i celowana, bez refaktorów
przy okazji; nie commituj ani nie pushuj bez mojej prośby (przygotuj gotową komendę
git add <pliki> && git commit); nie dotykaj kroniki-aetherii.env ani nie cytuj sekretów; zwykły
dywiz "-" w tekstach, nigdy mdash; nie ruszaj chronionych plików runtime (src/App.tsx,
src/main.tsx, src/styles.css, src/mobile/, vite.config.ts, worker/index.js) bez mojej zgody.
Przeglądarki (claude-in-chrome) użyj dopiero po zapytaniu mnie.

Stan: main zawiera smoka, motyw jasny/ciemny, tryb AI 1-3 i rzadsze siódemki (co czwarta
zostaje). Wdrożenie na ops02 działa (obraz f49b810dda0b); procedura w docs/projects-manager.md
i w projects_manager/docs/kroniki-aetherii-wdrozenie.md. Obrazy wdrażamy po tagu SHA liczonym
w repo gry.

Zadanie na teraz: [tu wpisz, np. dźwięki w ustawieniach / limit czasu na turę z TODO.md,
poprawki wyglądu w trybie jasnym lub ciemnym, opis rzadszych siódemek w "Jak grać"].
Zacznij od krótkiego podsumowania, jak rozumiesz zadanie, i wskaż pliki, które zmienisz.
```
