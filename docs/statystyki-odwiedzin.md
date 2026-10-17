# Statystyki odwiedzin

Na stronie widoczny jest raport: „Aktualnie jest X osób. Przez ostatnie 30 dni było
X unikatowych osób”. `GET /api/traffic` udostępnia wyłącznie te dwie liczby:
`online` i `unique30d`. Działa także pod prefiksem `/kroniki-aetherii`.

## Co jest mierzone

- Wejście: otwarcie strony w widocznej karcie.
- Logowanie: udane wydanie sesji przez rejestrację, hasło lub Google (także połączenie konta Google). Nie zapisujemy nieudanych prób ani danych konta.
- Czas: potwierdzony czas widocznej karty, mierzony przez serwer między sygnałami
  wysyłanymi co 30 sekund. Ukrycie/zamknięcie karty wysyła sygnał zakończenia.
  Nakładające się karty tej samej przeglądarki liczą się raz. Przerwy dłuższe niż
  45 sekund nie dopisują czasu nieobecności. To czas otwartej widocznej strony,
  a nie dowód uwagi lub wykonywania ruchów w grze.
- Obecność: co najmniej jedna widoczna karta zgłaszająca się w ostatnich 60 sekundach.
  Przy normalnym ukryciu karty obecność znika od razu; po utracie połączenia wygasa.

## Prywatność i interpretacja

Losowy cookie `aetherii_visit` ma `HttpOnly`, `SameSite=Lax`, zakres ścieżki gry,
ważność 30 dni bez przedłużania przy każdym żądaniu oraz `Secure` dla HTTPS.
Plik przechowuje wyłącznie SHA-256 losowego identyfikatora, typ zdarzenia, czas
zdarzenia i czas aktywności w milisekundach. Nie zapisujemy IP, user-agentów,
referrerów, URL-i odwiedzin, e-maili, nazw, identyfikatorów kont ani treści rozgrywek.
Identyfikator statystyk nie jest łączony z identyfikatorem konta.

Technicznie jest to pseudonimowy pomiar przeglądarek. „Osoby” są przybliżeniem:
inna przeglądarka/urządzenie, tryb prywatny, wygaśnięcie lub usunięcie cookie mogą
policzyć tę samą osobę ponownie; wspólna przeglądarka może łączyć kilka osób.
Bez trwałej tożsamości nie można dokładnie rozpoznawać ludzi między urządzeniami.

## Plik i retencja

Plik: `${CATAN_DATA_DIR}/traffic.json`, domyślnie `app/data/traffic.json`, na produkcji
`/opt/apps/kroniki-aetherii/data/traffic.json`. Prawa: `600`. Zdarzenia mają pola
`id`, `type` (`visit`, `login`, `activity`), `at` (czas Unix w ms), `activeMs`.
Nie udostępniamy pliku ani szczegółów logowań publicznym API.

Zapis jest atomowy co 15 sekund i przy poprawnym zatrzymaniu serwera. Awaria procesu
może utracić ostatnie 15 sekund pomiarów. Zdarzenia starsze lub równe 30 dniom są
usuwane przy uruchomieniu i cyklicznie przy zapisie, także bez ruchu na stronie.
Wyłączony serwer usuwa zaległe dane przy kolejnym uruchomieniu. Obecność jest tylko
w pamięci; po restarcie odbudowują ją kolejne sygnały przeglądarek.

Przy archiwizowaniu danych gry pomijaj `traffic.json`, aby kopie nie wydłużały
30-dniowej retencji statystyk. Pomiar wymaga jednej instancji serwera, tak jak zapis gry.

## Wdrożenie

Nie wymaga dodatkowego wolumenu ani sekretów. Przebuduj i opublikuj obraz gry,
a następnie na serwerze wykonaj `production_manager.sh docker-update kroniki-aetherii`
z uprawnieniami roota. Plik powstaje w istniejącym trwałym katalogu danych.
