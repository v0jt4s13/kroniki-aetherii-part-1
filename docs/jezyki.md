# Języki gry: polski, angielski i czeski

Gra ma ręcznie zapisane słowniki PL/EN/CS. Nie używa usług tłumaczenia ani tłumaczenia w locie. Wszystkie języki są częścią tego samego wydania; przełączenie nie zmienia serwera, pokoju, konta ani reguł gry.

## Wybór języka

Selektor obok przełącznika motywu działa przed wejściem do gry i w trakcie rozgrywki. Zmiana nie przeładowuje strony i nie rozłącza czatu ani mikrofonu. Wybór zapisuje się jako `aetherii:language` w localStorage; wylogowanie go zachowuje. Bez dostępu do localStorage wybór działa do zamknięcia strony. Zmiana ustawienia synchronizuje otwarte karty tego samego originu.

Kolejność ustalania języka:

1. Wcześniejszy, świadomy wybór użytkownika.
2. Dokładna nazwa domeny (także jej wariant `www`):

   | Domena | Domyślny język |
   |---|---|
   | `kroniki-aetherii.online` | polski |
   | `aetheria.online`, `aetheria.gg` | angielski |
   | `kroniky-aetheria.online` | czeski |

3. Pierwszy obsługiwany język z listy preferencji przeglądarki, np. `cs-CZ` → `cs`.
4. Polski.

Nie ma automatycznego przekierowania między domenami. Mapowanie nie konfiguruje DNS, HTTPS, reverse proxy, CORS ani Google OAuth. Dane przeglądarki i sesje nie są współdzielone między różnymi domenami. Ostateczne podpięcie domen pozostaje osobnym etapem wdrożenia.

## Pliki i sposób używania

Wszystkie słowniki i rejestr języków są obok siebie w `app/i18n/`:

- `pl.json`, `en.json`, `cs.json` — te same stabilne klucze, różne treści;
- `core.mjs` — rejestr języków, domeny, wybór języka i formatowanie parametrów;
- `core.d.mts` — typy kluczy i języków dla TypeScript;
- `server.mjs` — deskryptory zdarzeń i błędów, z polskim tekstem dla zgodności API.

`app/src/i18n.ts` obsługuje stan języka React, localStorage, `html.lang`, tytuł dokumentu oraz formatowanie dat. `LanguageSwitch.tsx` zawiera selektor. Korzysta z istniejących motywów gry.

W interfejsie:

```tsx
tr('ui.watchtower')
tr('ui.welcome_0', [player.name])
```

Parametry `{0}`, `{1}` itd. oznaczają wartości podstawiane w określonych miejscach; tłumacz może zmienić ich kolejność. Nie składaj nowych zdań z pojedynczych przetłumaczonych słów. Zachowuj pełne komunikaty, a przy licznikach stosuj poprawne formy albo neutralne etykiety, np. „Nowe wiadomości: {0}”. Krótkie etykiety mogą stać obok liczb, ale pełne zdania z wyróżnieniami zapisujemy jako pojedynczy komunikat i renderujemy przez `LocalizedText`, np.:

```tsx
<LocalizedText
  id="game.discard_instruction"
  values={[<strong>{count}</strong>]}
/>
```

`LocalizedText` podstawia elementy React w miejsca parametrów. Słowniki nie zawierają HTML; nie ma parsowania znaczników ani podmiany tekstów w DOM. Tłumacz może przestawić cały fragment wraz z wyróżnioną liczbą.

Klucze opisują znaczenie komunikatu po angielsku, nie stanowią treści do pokazania użytkownikowi. Nie zmieniaj istniejącego klucza tylko dlatego, że poprawiasz tłumaczenie. Frontend ma kontrolę typów kluczy; kontrola przed budową sprawdza także odniesienia serwera.

Nazwy zasobów, frakcji i kart są odczytywane przez gettery w `game-types.ts`, więc nie utrwalają języka wybranego w chwili importu modułu. Stałe tekstowe należące do komponentu są odczytywane podczas renderowania.

## Dziennik, błędy i prywatne treści

Nowe zdarzenie dziennika zawiera `message: { key, args }` oraz dotychczasowe pole `text`. Każdy klient renderuje `message` w swoim języku, również po odczytaniu zapisanego pokoju. Zagnieżdżone deskryptory pozwalają przetłumaczyć np. nazwy budowli i zestawienie produkcji bez parsowania nazw graczy. Polska wersja `text` zachowuje zgodność ze starszymi klientami i testami.

Odpowiedzi błędów zachowują polskie `error` i dodają `errorMessage`. Nieznany klucz zdarzenia lub błędu (np. z nowszego serwera) powoduje pokazanie jego zapisanego tekstu zamiast technicznego identyfikatora. Błędy parametryzowane zachowują deskryptor w obiekcie błędu, dzięki czemu można je ponownie wyrenderować po zmianie języka. Stare, stałe komunikaty systemowe mają zgodnościowe wyszukiwanie dokładnej treści w słownikach. Nie jest to mechanizm tłumaczenia dowolnego tekstu.

Nazwy graczy, nazwy botów zapisane w pokojach i wiadomości użytkowników pozostają w oryginale. Nie stosujemy podmian w DOM, dopasowań wzorców do wiadomości ani `innerHTML` dla tłumaczeń. Istniejące historyczne wpisy dziennika bez deskryptora pozostają w zapisanym języku; nie próbujemy odgadywać ich parametrów. Link do zewnętrznych oryginalnych zasad wskazuje dokument po polsku.

## Dodanie kolejnego języka

1. Skopiuj `pl.json` do nowego pliku, np. `de.json`, i przetłumacz wartości, pozostawiając klucze i parametry.
2. Zaimportuj słownik w `core.mjs`, dodaj go do `catalogs` i wpis do `locales` z nazwą własną języka, regionem i opcjonalnymi domenami.
3. Uzupełnij typ `Locale` i deklarację `catalogs` w sąsiednim `core.d.mts`.
4. Uruchom `npm run check:i18n`, `npm run build` i `npm test` z katalogu `app`.
5. Sprawdź ekran wejścia, reguły, konta, budowę, handel, karty, zaproszenia, czat, komunikaty o błędach oraz dziennik w dwóch klientach z różnymi językami.

Selektor korzysta z rejestru i automatycznie uwzględni nowy język. Kontrola przed `dev` i `build` odrzuca brakujące/dodatkowe klucze, puste wartości, niezgodne parametry i nieznane literalne odniesienia do kluczy. Słowniki EN/CS warto poddać dodatkowej redakcji przez osoby biegle znające dany język i terminologię gry.

## Publikacja

Zmiana wymaga normalnego wydania obrazu aplikacji. Dockerfile kopiuje `app/i18n` do obrazu produkcyjnego, ponieważ słowniki są używane również przez serwer i worker czatu. Nie zmienia się konfiguracja TURN ani zawartość zapisanych rozgrywek poza dodaniem deskryptorów do nowych wpisów dziennika.

## Weryfikacja tej implementacji

- Pełny zestaw `npm test`: 93 testy zakończone powodzeniem.
- `npm run test:prefix`: budowa produkcyjna i 2 testy prefiksu zakończone powodzeniem.
- `npm run test:sites`: 4 testy paczki statycznej zakończone powodzeniem.
- Osobny końcowy przebieg lokalizacji: 7 testów, w tym zmiana języka dokumentu, pamiętanie wyboru, synchronizacja kart i brak dostępu do zapisu ustawienia.
- Kontrola integralności 28 chronionych plików runtime i zgodności 581 kluczy w 3 słownikach zakończona powodzeniem.

Nie wykonywano automatyzacji przeglądarki ani publikacji. Do ręcznego odbioru pozostaje wygląd wszystkich paneli i poprawność językowa EN/CS, szczególnie terminologia gry i dopasowanie tekstów na telefonach. Budowa zgłasza ostrzeżenie Vite o rozmiarze głównego pakietu JavaScript; nie blokuje ono kompilacji.


### Uzupełnienie z 30.10.2026

Po pierwszym pełnym przebiegu 93 testów poprawiono składanie zdań o statystykach, najazdach, składzie pokoju i odrzucaniu kart. Doszły pełne komunikaty z parametrami React, neutralne liczebnikowo komunikaty EN/CS i obsługa nieznanych kluczy z nowszej wersji serwera. Ponownie sprawdzono kompilację produkcyjną, 7 testów lokalizacji oraz HTTP strony, healthchecku, konta i podglądu planszy. Odbiór w przeglądarce użytkownik wykonuje ręcznie.

Lokalny serwer do tego odbioru: `http://127.0.0.1:4173/`. Dane testowe: `/tmp/aetherii-language-preview-20261030`; nie jest to katalog danych produkcyjnych. Serwer udostępnia zbudowaną paczkę — kolejne zmiany interfejsu wymagają ponownej budowy.

Ręcznie sprawdź:

1. Zmień PL → EN → CS na ekranie wejścia; sprawdź nazwy zasobów, frakcji i trybów.
2. Odśwież stronę i sprawdź zachowanie języka. Zmień język w drugiej karcie; pierwsza powinna się zsynchronizować.
3. Utwórz grę i przełączaj język w trakcie — kod pokoju i stan planszy powinny pozostać takie same.
4. Otwórz zasady, karty, handel, konto i dziennik. Sprawdź czytelność w jasnym i ciemnym motywie oraz na wąskim ekranie.
5. W dwóch różnych profilach przeglądarki ustaw różne języki i wejdź do tego samego pokoju przez prywatne zaproszenie. Nowe zdarzenia dziennika powinny mieć różne tłumaczenia; wiadomości graczy mają pozostać identyczne.
6. Brak skonfigurowanego TURN nadal oznacza wyłączony głos — test języków nie uruchamia tej usługi.
