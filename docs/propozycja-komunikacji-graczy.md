# Propozycja prywatnej komunikacji graczy

Stan analizy: 28.10.2026. Dokument zachowuje uzgodnienia projektowe. Implementacja lokalna, konfiguracja i różnice względem planu są opisane w [instrukcji komunikacji](komunikacja-graczy.md); publikacja na serwerze pozostaje osobnym krokiem.

## Rekomendacja

Jeden wspólny kanał tekstowy i jeden kanał głosowy na rozgrywkę, dostępne od lobby. Czat: istniejący backend Node.js + WebSocket. Głos: WebRTC audio w układzie mesh (każdy z każdym), z własnym coturn. Dla maksymalnie czterech osób oznacza to najwyżej sześć połączeń pomiędzy uczestnikami, po trzy na urządzenie. Reguły gry i jej obecny polling pozostają niezależne od komunikacji.

Warunkiem uruchomienia jest wzmocnienie zaproszeń. Sam kod pokoju nie powinien przyznawać dostępu do gry ani komunikacji.

Ustalenia użytkownika po przeglądzie: każdy gracz może wyciszyć innego wyłącznie dla siebie; nie wymagamy centralnego wyciszania głosu wszystkich uczestników. Mikrofon ma dwa tryby: przytrzymanie przycisku „Mic” oraz świadomie włączone nadawanie ciągłe podczas korzystania z czatu. Rozszerzenie zaproszeń o obsługę zalogowanych graczy jest zaakceptowane. Przy tych wymaganiach pozostaje rekomendacja mesh + coturn, bez potrzeby SFU do samego lokalnego wyciszania.

## Co już istnieje w projekcie

| Obszar | Ustalenie i miejsce integracji |
| --- | --- |
| Frontend | React/TypeScript, główny interfejs w `app/src/Prototype.tsx`, arkusz `prototype.css`; warstwa zwykłej strony i podglądu telefonu w `GameShell.tsx`. |
| Multiplayer | `app/server/start.mjs`: HTTP API, odpytywanie przez klienta co 3 sekundy. Brak WebSocket i infrastruktury głosowej. |
| Uprawnienia | Token gracza w `Authorization: Bearer`; dla miejsca przypisanego do konta dodatkowa kontrola sesji konta. Boty nie dostają tokenów klienta. |
| Zaproszenia | Sześć znaków szesnastkowych, 24 bity; wejście do wolnego lobby przez `/join` nie wymaga sekretu zaproszenia ani zatwierdzenia gospodarza. Obecny link jest adresem pokoju. |
| Konta | E-mail/hasło, Google, sesja cookie HttpOnly, odzyskanie przypisanej gry na innym urządzeniu. |
| Dane | `rooms.json` i `accounts.json`; zapis pokojów synchronicznie przepisuje cały plik. Treści czatu nie należy dodawać do tego mechanizmu ani dziennika silnika. |
| Publikacja | Node w Dockerze, Nginx i prefiks `/kroniki-aetherii`, opis w `docs/projects-manager.md`. WebSocket musi obsługiwać ten sam prefiks. Faktycznej konfiguracji serwera nie sprawdzano. |
| Wygląd | Istniejący zapisany motyw jasny/ciemny. Panel ma korzystać z niego oraz obecnego stylu pergaminu, granatu i złotych akcentów. |

## Prywatność i zapraszanie

1. Gospodarz generuje jednorazowe zaproszenie na jedno miejsce: losowy sekret co najmniej 128 bitów, domyślnie ważny 24 godziny. Serwer zapisuje skrót sekretu, termin i stan wykorzystania; gospodarz może je unieważnić.
2. Sekret trafia we fragment linku, np. `?room=ABC123#invite=…`. Klient odczytuje go, usuwa z paska adresu i przekazuje w ciele żądania HTTPS. Nie zapisujemy go w logach, analityce ani localStorage.
3. Dołączenie atomowo sprawdza zaproszenie, wolne miejsce i fazę lobby, zużywa sekret i tworzy członkostwo. Ponowienie po utracie odpowiedzi musi mieć idempotentny mechanizm odzyskania wyniku.
4. Kod pokoju służy wyłącznie do jego wskazania. Nie otwiera historii, listy uczestników, kanału WebSocket ani głosu. Powrót istniejącego gracza nadal korzysta z jego tokenu i, jeśli powiązany, konta.
5. Dla mocniejszej kontroli gospodarz zatwierdza pierwsze wejście; konto pozwala przypisać zaproszenie do konkretnej osoby. Sam link pozostaje uprawnieniem możliwym do przekazania komuś innemu. Gość bez konta jest identyfikowany posiadaniem tokenu, nie zweryfikowaną tożsamością.
6. Stare rozgrywki zachowują istniejących graczy. Przed otwarciem komunikacji gospodarze starych lobby generują nowe zaproszenia; stary link z samym kodem nie pozwala już zajmować miejsca.

Usunięcie fragmentu z adresu nie może zgubić zaproszenia przy odświeżeniu ani przekierowaniu OAuth. Przed jego usunięciem klient wymienia sekret przez HTTPS na krótkotrwały, serwerowy kontekst zaproszenia związany z losowym cookie HttpOnly/Secure/SameSite. Samo otwarcie linku nie zużywa zaproszenia. Powrót z Google odtwarza kontekst; obecne `googleStart`/`googleFinish` zachowują tylko kod pokoju i wymagają rozszerzenia tej ścieżki. To obejmuje również anulowanie logowania i wygaśnięcie zaproszenia w trakcie logowania. Przy publikacji pod prefiksem sprawdzić faktyczną ścieżkę cookie i zasady przekierowań.

Zatwierdzenie gospodarza w punkcie 5 to opcjonalny dodatkowy tryb, a nie istniejąca funkcja. Domyślne MVP: jednorazowy link na miejsce, bez obowiązku konta. Lokalna rejestracja obecnie nie weryfikuje własności e-maila, więc przypisanie zaproszenia do adresu wymagałoby weryfikacji e-mail lub wskazania już zaufanego identyfikatora konta. Samo wpisanie tego samego adresu nie potwierdza tożsamości zaproszonego.

Zaakceptowane rozszerzenie dla zalogowanych: dołączenie po zaproszeniu od razu wiąże miejsce z bieżącym kontem; powrót i kolejne urządzenie korzystają z istniejącego odzyskiwania gry. Jeśli zaproszenie jest skierowane do określonego, istniejącego konta, serwer porównuje jego stabilny `accountId`; zalogowanie na inne konto nie zużywa zaproszenia. Obsługa zalogowanych nie oznacza obowiązku logowania dla gości ani automatycznego wysyłania zaproszeń e-mailem. Publicznego wyszukiwania kont po e-mailu nie dodajemy w ramach tej funkcji.

Wprowadzamy osobny stan uprawnienia do komunikacji. Gospodarz może go odebrać bez usuwania pionków i miejsca gracza z trwającej gry. Każde połączenie i każda operacja sprawdzają bieżące członkostwo; identyfikator nadawcy i pokój wynikają z serwera, nie z deklaracji klienta. Konto samo w sobie nie daje dostępu do cudzych pokojów.

Prywatność oznacza dostęp kontrolowany przez serwer. Tekst będzie czytelny dla administratora bazy i uczestników, którzy mogą go skopiować. Nie obiecujemy szyfrowania tekstu end-to-end.

Uprawnienie do komunikacji musi być niezależne od samego tokenu gry: odebrany dostęp nie wraca po `/account/resume`, ponownym wejściu ani odświeżeniu. Udostępnić operacje gospodarza do odebrania i ponownego nadania tego uprawnienia. W lobby można dodatkowo usunąć uczestnika i unieważnić jego token; podczas gry nie usuwać miejsca z silnika. Starych członków nie można wstecznie uznać za zweryfikowane osoby zaproszone — gospodarz powinien potwierdzić ich skład przed pierwszym włączeniem komunikacji.

## Panel gracza

- Przycisk „Komunikacja” obok narzędzi pokoju, z licznikiem nieprzeczytanych wiadomości. Widoczny dla uprawnionego człowieka w lobby i podczas gry; solo z SI bez aktywnego panelu rozmów.
- Nagłówek: „Rozmowa drużyny · tylko uczestnicy tej gry”. Lista wiadomości: imię, frakcja/kolor, godzina, tekst. Dziennik zdarzeń gry pozostaje osobno.
- Pole wiadomości, wysyłanie Enterem, nowy wiersz Shift+Enter, czytelny stan wysyłania i możliwość ponowienia. Nowa wiadomość nie przewija osoby czytającej starszą historię.
- Sekcja głosowa: „Dołącz do rozmowy”, uczestnicy, stan mikrofonu i wskaźnik mówienia. Po dołączeniu mikrofon domyślnie wyciszony. Przycisk „Mic — przytrzymaj i mów”, przełącznik „Mikrofon na stałe” oraz „Opuść rozmowę”.
- Przy każdym innym uczestniku przycisk „Wycisz dla mnie” / „Przywróć dźwięk”. Wyciszenie dotyczy wyłącznie jego audio u osoby klikającej; pozostali nadal go słyszą, a wiadomości tekstowe pozostają widoczne.
- Przyjmujemy bezpieczny wariant „podczas korzystania z czatu”: zamknięcie panelu wyłącza nadawanie, także ciągłe, ale pozostawia odsłuch. Stały mały pasek pokazuje połączenie, stan „Mic wyłączony” i przycisk opuszczenia rozmowy. Ponowne otwarcie panelu nie włącza samo mikrofonu. Wylogowanie/zmiana pokoju zamyka połączenia i zatrzymuje ścieżki mikrofonu.
- Na telefonie panel wykorzystuje istniejącą warstwę arkusza i obsługę klawiatury. Na szerokim ekranie docelowo boczny panel. Zamknięcie widoku chatu zachowuje szkic tylko w pamięci bieżącej karty.
- Zachowujemy oba obecne motywy, czytelność na 320 px, sterowanie klawiaturą, opisy przycisków i łagodne ogłaszanie nowych wiadomości czytnikom ekranu. Powiadomienia systemowe opcjonalne, bez treści na ekranie blokady jako ustawienie domyślne.

Integracja wymaga uwzględnienia wymuszonych paneli `discard` i `winner` w `Prototype.tsx`: odrzucanie kart ma pierwszeństwo nad widokiem czatu, ale nie rozłącza głosu. Stan połączenia audio musi żyć ponad montowanym/odmontowywanym arkuszem. Obecny `GameInput` obsługuje pojedynczy wiersz; wielowierszowy edytor wymaga odpowiednika textarea dla zwykłej strony i klawiatury podglądu. Nie zmieniać chronionego runtime. Wdrożenie bocznego panelu na desktopie i powiadomień systemowych można odłożyć poza MVP.

Nieprzeczytane: osobny `lastReadSequence` dla pary pokój–gracz, aktualizowany tylko po faktycznym wyświetleniu wiadomości w aktywnej karcie; zdarzenie `chat.read` synchronizuje urządzenia. Odczyt nie oznacza samego dostarczenia. Przy końcu gry czat pozostaje dostępny do upływu retencji, a gospodarz może zamknąć nowe wiadomości; zamknięcie rozmowy kończy głos. Reguły te muszą być widoczne w panelu i egzekwowane po stronie serwera.

## Czat tekstowy: transport i dane

Rekomenduję pakiet `ws` po stronie Node. Przeglądarka korzysta z natywnego WebSocket. Zamiast umieszczać długotrwały token gracza w adresie połączenia, klient pobiera autoryzowanym POST-em jednorazowy bilet ważny np. 30 sekund. Pierwsza ramka WebSocket przedstawia bilet; do tej chwili brak subskrypcji i danych, limit czasu np. 5 sekund. Serwer sprawdza dokładny dozwolony Origin, rozmiar ramek, liczbę połączeń i limity przed uwierzytelnieniem.

Obsługa HTTP w `http.createServer` nie przechwytuje zdarzenia `upgrade`: kontrolę ścieżki, prefiksu i Origin trzeba wykonać ponownie w dedykowanym handlerze. `ws` w trybie `noServer` powinien obsługiwać wyłącznie swój endpoint, bez przejmowania połączeń HMR Vite. Cookie konta należy zweryfikować również w handshake i przy realizacji biletu; dla gościa bilet działa jako krótkotrwałe uprawnienie. Odrzucać brakujący lub `null` Origin w obsługiwanym kliencie przeglądarkowym. Źródło: [dokumentacja ws](https://github.com/websockets/ws/blob/master/doc/ws.md).

Obecny limiter HTTP liczy adres `req.socket.remoteAddress`: za Nginx może to być wspólny adres proxy, a limit 600/min jest wtedy współdzielony przez użytkowników. Przed dodaniem ruchu komunikacji ustalić zaufane proxy i osobne limity per gracz/pokój oraz limity wejść anonimowych. Nie ufać dowolnemu `X-Forwarded-For`. Dodajemy heartbeat ping/pong, rozłączanie martwych klientów, limity buforów i odłączanie zbyt wolnych odbiorców. Kompresja WS domyślnie wyłączona.

Nginx publikuje grę pod ścieżką wspólnej domeny: Origin nie izoluje jej od innych aplikacji tego samego hosta. Osobna domena byłaby mocniejszą granicą bezpieczeństwa, ale nie jest niezbędna dla MVP. Bilety i tokeny nigdy nie trafiają do URL połączenia, list uczestników ani payloadów rozsyłanych innym graczom.

Proponowane API (ścieżki względne wobec istniejącego prefiksu):

| Operacja | Zastosowanie |
| --- | --- |
| `POST /api/rooms/:code/invitations` | Gospodarz tworzy zaproszenie; osobna operacja unieważnienia. |
| `POST /api/rooms/:code/join` | Rozszerzenie obecnego wejścia o sekret zaproszenia. |
| `POST /api/rooms/:code/communication-ticket` | Bilet związany z graczem, pokojem i sesją konta. |
| `GET /api/rooms/:code/messages?before=…` | Autoryzowana historia stronicowana, np. po 50 wiadomości. |
| `GET /api/rooms/:code/communication` + Upgrade | WebSocket dla tekstu, obecności i sygnalizacji głosu. |
| `POST /api/rooms/:code/voice-credentials` | Krótkotrwałe dane TURN wyłącznie dla uprawnionego uczestnika. |

Zdarzenia: `chat.send`, `chat.ack`, `chat.message`, `presence.changed`, `voice.join`, `voice.leave`, `voice.signal`, `access.revoked`. Serwer narzuca dozwolony typ i schemat danych. Sygnalizacja trafia tylko do konkretnego uczestnika tej samej rozmowy. Osobne limity dla tekstu i ICE, aby zestawianie głosu nie zużywało limitu wiadomości.

Wiadomość: `id`, `roomId`, `playerId`, `createdAt`, `text`, `clientMessageId`, `sequence`. Czas i kolejność nadaje serwer. Unikalność `(roomId, playerId, clientMessageId)` zapobiega duplikatom po ponowieniu; ACK dopiero po trwałym zapisie. Reconnect pobiera brakujące wiadomości według kursora, z ponowną autoryzacją i backoffem. Odczyt historii i strumień muszą mieć wspólny kursor, aby nie gubić wiadomości między pobraniem a subskrypcją.

Historia w osobnej bazie SQLite w katalogu danych, z migracjami i asynchroniczną obsługą zapisu dobraną do runtime Node. Obecna konfiguracja dopuszcza Node 20, więc nie należy zakładać dostępności `node:sqlite`. Dobór sterownika sprawdzić w obrazie Docker. Indeks `(roomId, sequence)`; obecność, sygnalizacja i szkice wyłącznie w pamięci. Chat nie zwiększa `g.revision` i nie wywołuje konfliktów ruchów gry.

Istotne ograniczenie Dockerfile: produkcja to `node:22-alpine`, a instalacja zależności używa `npm ci --omit=dev --ignore-scripts`. Sterownik wymagający pobrania/kompilacji natywnego modułu w skrypcie instalacji nie zadziała bez zmiany budowania obrazu. Wybór musi zostać potwierdzony uruchomieniem produkcyjnego kontenera i rzeczywistym zapisem/odczytem bazy, a nie tylko buildem TypeScript.

Nie ma wspólnej transakcji między `rooms.json` a SQLite. Dla MVP zaproszenia, identyfikator żądania dołączenia oraz utworzony gracz powinny być zatwierdzane jednym atomowym zapisem pokoju w JSON; uprawnienie komunikacji także pozostaje przy graczu w tym źródle prawdy. SQLite przechowuje wiadomości i kursory odczytu, sprawdzając dostęp względem aktualnego pokoju. Blokada per pokój i ponowna kontrola uprawnień przed zatwierdzeniem wiadomości zapobiegają wyścigowi z odebraniem dostępu. Nie utrzymywać niezależnej kopii członkostwa w bazie czatu.

Wynik dołączenia po utracie odpowiedzi odzyskiwać wyłącznie z tym samym losowym kontekstem klienta/żądania i, jeśli dotyczy, sesją konta. Zużyty sekret sam w sobie nie może ponownie ujawniać tokenu gracza. Identyfikatory żądań ograniczyć rozmiarem i czasem przechowywania. Samą idempotencję wiadomości zachować co najmniej przez okres dopuszczonych ponowień; po wyczyszczeniu historii nie dopuścić do jej odtworzenia przez starą kolejkę klienta.

Proponowane limity początkowe: 2000 znaków, 5 wiadomości/10 sekund/gracza z osobnym limitem pokoju i wielkości kolejki. Tekst renderowany jako tekst React, bez HTML, załączników i automatycznych podglądów linków. Serwerowe ograniczenia działają także dla bezpośrednich wywołań API.

Retencja proponowana: 30 dni od wiadomości, także przy aktywnej grze; komunikat w panelu. Gospodarz może wyczyścić historię pokoju. Procedura obejmuje również kopie zapasowe i maksymalny czas przechowywania usuniętych danych w backupach. Bez treści wiadomości, tokenów i SDP w logach lub statystykach odwiedzin.

Czyszczenie historii zwiększa wersję historii i rozsyła zdarzenie usunięcia; otwarte klienty usuwają widoczne wiadomości i nie ponawiają wysyłania ze starej wersji. Kursory starsze niż retencja otrzymują jawny wynik „historia wygasła”, a nie pozornie kompletny strumień. Dla SQLite zaplanować WAL/checkpoint, obsługę braku miejsca i backup przez API bazy lub po kontrolowanym zatrzymaniu. Kopiowanie samego pliku `.sqlite` przy aktywnym WAL może zgubić zatwierdzone dane. Źródło: [SQLite — WAL](https://www.sqlite.org/wal.html).

## Rozmowa głosowa

WebRTC przenosi audio; WebSocket przekazuje tylko oferty, odpowiedzi i kandydatów ICE. Własny coturn zapewnia przejście przez trudniejsze sieci. STUN bez TURN nie wystarcza jako rozwiązanie produkcyjne. Przeglądarka wymaga zgody na mikrofon i bezpiecznego kontekstu HTTPS (lokalny localhost jest wyjątkiem); zwykły adres HTTP komputera w LAN nie wystarczy. Źródła: [WebRTC — peer connections](https://webrtc.org/getting-started/peer-connections), [MDN — getUserMedia](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia).

Dla prywatności adresów uczestników proponuję domyślnie `iceTransportPolicy: 'relay'`: audio przez własny TURN zamiast ujawniania adresów połączeń innym graczom. Zwiększa to transfer serwera. Operator TURN nadal widzi metadane połączeń. Dane TURN są czasowe, wystawiane po kontroli dostępu; wspólny sekret pozostaje wyłącznie na backendzie. Konfiguracja: [coturn — credentials](https://github.com/coturn/coturn/blob/master/README.turnserver).

Zakres MVP: tylko audio, jeden kanał na grę, bez nagrywania, transkrypcji i usług AI. Obsługa równoczesnego dołączania (perfect negotiation), ICE restart, utraty sieci, zmiany mikrofonu i zablokowanego autoplay. W jednej rozgrywce jedno aktywne urządzenie głosowe gracza, aby uniknąć echa po otwarciu drugiej karty.

### Lokalne wyciszanie uczestnika

Odbiorca wycisza odtwarzanie wszystkich zdalnych ścieżek audio wybranego `playerId` w swoim kliencie. To lokalne ustawienie odsłuchu, bez zmiany uprawnień nadawcy i bez żądania zgody gospodarza. Stan przypisujemy do stabilnego identyfikatora gracza w pokoju, nie do nazwy ani chwilowego połączenia. Zapis w localStorage dla pary pokój–gracz wyciszany, z rozdzieleniem lokalnego konta/gracza słuchającego; nie mieszać preferencji różnych kont na tym samym urządzeniu. Synchronizacja między urządzeniami poza MVP.

Wyciszenie obowiązuje również po reconnect, wymianie ścieżki i ponownym wejściu nadawcy. Nowy element audio musi dostać stan mute przed rozpoczęciem odtwarzania, aby nie pojawił się krótki fragment dźwięku. Interfejs jasno pokazuje „Wyciszony dla Ciebie”; nie traktuje tego jako opuszczenia rozmowy. Lokalny mute nie blokuje wyciszonej osobie słuchania nas. Ograniczanie dostępu do prywatnego pokoju nadal zapewnia autoryzacja serwera.

### Sterowanie własnym mikrofonem

- Domyślnie tryb przytrzymania: nadawanie trwa tylko podczas trzymania „Mic” myszą, dotykiem lub klawiaturą (Space/Enter na przycisku). Bez globalnego przechwytywania spacji, które przeszkadzałoby pisać wiadomości.
- Zwolnienie, `pointercancel`, utrata przechwycenia wskaźnika, utrata fokusu okna, ukrycie karty, zamknięcie panelu lub rozłączenie wyłączają nadawanie. Wymuszony panel gry również wyłącza mikrofon i nie zatrzymuje odsłuchu.
- Osobny przełącznik „Mikrofon na stałe” utrzymuje nadawanie bez przytrzymywania. Jest wyraźny wskaźnik aktywnego mikrofonu i przycisk wyłączenia. W tym trybie przycisk przytrzymania jest nieaktywny, aby nie wprowadzać dwóch sprzecznych sposobów sterowania.
- Zamknięcie panelu lub ukrycie karty wyłącza również tryb ciągły. Nie zapamiętujemy aktywnego nadawania w localStorage; odświeżenie, reconnect i powrót do panelu wymagają ponownego włączenia.
- Pierwsze uruchomienie mikrofonu może wywołać systemową prośbę o zgodę. Jeśli zgoda dotrze po puszczeniu „Mic”, nadawanie nie może się rozpocząć. Przycisk pokazuje przygotowanie i błąd/brak zgody; kolejne przytrzymania nie zestawiają połączeń od nowa.
- Rozróżniamy „nie nadajesz” od „urządzenie zwolnione”: przy wyciszeniu ścieżka może pozostać przygotowana do szybkiego nadawania, a przeglądarka może nadal pokazywać użycie mikrofonu. Opuszczenie rozmowy zatrzymuje ścieżki i zwalnia urządzenie.

Zachowanie po zamknięciu panelu jest założeniem doprecyzowującym „podczas korzystania z chatu”; można je zmienić na rozmowę ciągłą również nad planszą, zachowując stale widoczny wskaźnik i wyłącznik.

Odebranie dostępu zamyka WebSocket, unieważnia bilety, usuwa obecność i wysyła pozostałym klientom polecenie zamknięcia połączeń z tą osobą. Wygaśnięcie/wylogowanie konta musi również odcinać już otwarty kanał, a nie tylko przyszłe logowania. Utrata autoryzowanego kanału sygnalizacyjnego zatrzymuje głos po krótkim timeout; dotyczy to również zawieszonej karty.

Korekta techniczna: zawieszona karta może nie wykonywać timerów JavaScript, więc timeout klienta nie gwarantuje natychmiastowego zatrzymania audio. Również wygaśnięcie krótkotrwałych danych TURN nie jest mechanizmem natychmiastowego usuwania istniejących alokacji. W mesh jest to reguła zachowania standardowego klienta, nie twarda gwarancja serwera. Relay-only ogranicza ujawnianie adresów w ICE zgodnego klienta; nie chroni przed dobrowolnym ujawnieniem IP przez zmodyfikowanego uczestnika. Źródło konfiguracji relay: [MDN — RTCPeerConnection](https://developer.mozilla.org/en-US/docs/Web/API/RTCPeerConnection/RTCPeerConnection).

Backend potrzebuje jawnego identyfikatora/terminu sesji dla kanału WS: obecne `accounts.session()` zwraca tylko użytkownika. Wylogowanie, rotacja cookie po logowaniu, powiązanie miejsca gościa z kontem i wygaśnięcie sesji muszą aktualizować lub zamykać powiązane kanały. Dla gościa określić osobno „opuść komunikację na tym urządzeniu”; obecne czyszczenie localStorage nie unieważnia skopiowanego tokenu gry.

Rozmowy na telefonach wymagają prób na prawdziwym Safari/iOS i Chrome/Android: podgląd urządzenia w aplikacji nie emuluje uprawnień mikrofonu, blokady ekranu ani zasad pracy w tle. Nie obiecywać ciągłości audio po zablokowaniu telefonu. Wybór „Wycisz odsłuch” powinien również wyciszać nadawanie, żeby użytkownik nie mówił nieświadomie do niesłyszanej rozmowy. Wyświetlanie samego stanu głosu nie powinno wymagać dostępu do mikrofonu.

Coturn musi mieć limity alokacji i pasma oraz blokadę relay do adresów wewnętrznych, loopback i usług infrastruktury. Krótkotrwałe credentials nie są przypisaniem do konkretnego pokoju WebRTC; skopiowane dane mogą działać do końca ważności. Wydawanie i odnawianie poświadczeń wymaga limitów i kontroli dostępu, a wartości TTL trzeba dobrać z testem długiej rozmowy i ICE restart, nie przez założenie, że audio skończy się wraz z TTL.

Istotna granica: w mesh serwer nie ma bezpośredniej kontroli nad już zestawionymi połączeniami audio zmodyfikowanych klientów. Nie przeszkadza to lokalnemu „Wycisz dla mnie”, które blokuje odtwarzanie u odbiorcy. Twarde odłączenie na poziomie infrastruktury pozostaje poza ustalonym zakresem MVP; wymagałoby kontroli sesji TURN albo SFU.

Alternatywa: LiveKit SFU (własny lub Cloud), gdy pojawią się większe pokoje, centralna moderacja albo potrzeba ograniczenia liczby strumieni na telefonach. To dodatkowa usługa i konfiguracja sieci. Własny LiveKit nie unieważnia automatycznie istniejącego JWT po usunięciu uczestnika, więc potrzebuje osobnej polityki krótkich tokenów i kontroli ponownego wejścia. Źródła: [tokeny LiveKit](https://docs.livekit.io/frontends/reference/tokens-grants/), [porty i firewall](https://docs.livekit.io/transport/self-hosting/ports-firewall/).

## Wdrożenie i kolejność prac

1. **Dostęp:** wspólny moduł autoryzacji HTTP/WS, zaproszenia, migracja starych lobby, odebranie komunikacji. Najpierw zamknąć możliwość wejścia po samym kodzie.
2. **Tekst:** SQLite, API historii, WebSocket, panel, nieprzeczytane i reconnect. Uruchomić przez flagę funkcji; nie zmieniać transportu silnika gry.
3. **Głos:** połączenia WebRTC, coturn, tymczasowe poświadczenia i stany błędów; próby z różnymi sieciami i telefonami. Osobna flaga pozwala wyłączyć głos bez utraty czatu i gry.
4. **Produkcja:** konfiguracja Nginx Upgrade/Connection i timeoutów dla właściwego prefiksu; DNS/TLS TURN, porty UDP/TCP i zakres relay. TURN/TLS na 443 dla restrykcyjnych sieci może wymagać oddzielnego IP lub zaplanowanego routingu, bo HTTPS aplikacji już używa tego portu. To wymaga przeglądu infrastruktury ops02.
5. **Utrzymanie:** kopie SQLite wykonane właściwym mechanizmem backupu bazy, migracje z możliwością powrotu, usuwanie po retencji, pomiar błędów i zużycia transferu bez treści rozmów. Początkowo jeden proces aplikacji; kolejne repliki wymagają wspólnego stanu obecności i dystrybucji zdarzeń.

Szacunek planistyczny dla jednego programisty: dostęp i tekst 4–7 dni roboczych, głos i sieć 4–7, testy integracyjne i przygotowanie publikacji 2–4; razem około 10–18 dni. To nie wycena, zależy zwłaszcza od wymagań odcinania głosu i dostępności portów TURN. Koszt infrastruktury zależy od równoczesnych pokojów, czasu rozmów i transferu; nie da się go ustalić z samego repozytorium.

Po ponownym przeglądzie przedział 10–18 dni traktować jako orientację dla ograniczonego MVP z mesh. Nie obejmuje gwarantowanego odcinania przez SFU, weryfikacji e-mail, rozbudowanych powiadomień systemowych ani pełnego desktopowego panelu bocznego. Pierwszym krokiem powinien być krótki test techniczny sterownika SQLite w obrazie i głosu przez TURN z sieci mobilnej; jego wynik pozwoli skorygować zakres i termin. Rollback do starego obrazu przywróci też stary sposób dołączania po kodzie: podczas wycofania trzeba wyłączyć wejścia do lobby albo wdrożyć zgodną poprawkę dostępu, zamiast zakładać, że sama flaga czatu zachowa prywatność gry.

## Warunki odbioru

- Osoba z samym kodem pokoju, tokenem innego pokoju, zużytym/wygasłym zaproszeniem lub samym kontem spoza gry nie pobiera historii, nie subskrybuje i nie otrzymuje danych TURN. Ważny token niepowiązanego gościa jest uprawnieniem jego posiadacza; nie pozwala odróżnić właściciela od osoby, której token przekazano.
- Zaproszenia odporne na równoczesne użycie, limit miejsc i ponowienie żądania. Brak danych komunikacji w publicznym `/api/preview`.
- Testy bezpośrednich ramek WS: obcy pokój/odbiorca, podszywanie się, błędny Origin, brak autoryzacji, zalew wiadomości i zbyt duży payload.
- Reconnect i restart zachowują zaakceptowane wiadomości bez duplikatów; wiadomość nie koliduje z ruchem, rzutem ani akcją bota.
- Odebranie uprawnień i wylogowanie odcinają otwarte sesje. Nowy uczestnik widzi historię swojej gry zgodnie z retencją; odebranie zaproszenia nie odbiera automatycznie członkostwa osobie, która już je wykorzystała.
- Dwie, trzy i cztery osoby mogą rozmawiać z różnych sieci; próby z wymuszonym TURN, brakiem zgody na mikrofon, zmianą urządzenia, drugą kartą i przerwą w sieci. Awaria głosu nie blokuje tekstu ani gry.
- Lokalny mute A→B: A nie słyszy B, C nadal słyszy B, B nadal słyszy A; tekst B jest widoczny. Mute zachowany po reconnect i wymianie ścieżek, bez chwilowego odtworzenia audio, niezależny od preferencji innych kont na urządzeniu.
- „Mic” nadaje wyłącznie podczas przytrzymania; testy myszy, dotyku, klawiatury, puszczenia poza przyciskiem, anulowania gestu, utraty fokusu i spóźnionej zgody na mikrofon. Tryb ciągły wymaga jawnego włączenia i wyłącza się po zamknięciu panelu, ukryciu karty i reconnect.
- Zaproszony zalogowany gracz otrzymuje miejsce przypisane do konta i odzyskuje je na drugim urządzeniu; zaproszenie związane z kontem odrzuca inne konto bez zużywania zaproszenia.
- Panel czytelny w obu motywach i w podglądzie telefonu; klawiatura nie zasłania pola; aktywny głos widoczny po zamknięciu panelu.
- Przed przekazaniem implementacji: istniejące `npm test`, `npm run check:runtime`, `npm run build`, test prefiksu i nowe testy dostępu, historii oraz WS. Testy przez Codex-in-chrome tylko po osobnej zgodzie użytkownika.

Dodatkowe przypadki po przeglądzie: logowanie Google i odświeżenie z zaproszeniem; restart między zapisem członkostwa a odpowiedzią; odebranie dostępu równolegle z wysyłką; odzyskanie gry po blokadzie komunikacji; wygasły kursor, czyszczenie przy otwartej karcie i stare ponowienia; brak miejsca w bazie i odtworzenie backupu; routing WS/HMR z prefiksem; obciążenie wielu graczy za tym samym proxy; długa rozmowa przekraczająca TTL TURN; blokada ekranu oraz przejęcie głosu przez drugie urządzenie. Test dostępu powinien wykazać, że token gracza z innego pokoju jest odrzucony — skradziony prawidłowy token gościa pozostaje skutecznym uprawnieniem do czasu jego unieważnienia.

Analiza została wykonana na podstawie kodu i dokumentacji repozytorium oraz dokumentacji technicznej powyżej. Nie uruchamiano przeglądarki, nie zmieniano aplikacji i nie publikowano usług.

## Realizacja i świadome różnice względem planu

Zaimplementowano prywatne zaproszenia, powiązanie z kontem, tekst przez WS, historię SQLite, obsługę głosu mesh/relay-only, lokalne mute i tryby Mic. Ze względu na Node 20/22 i produkcyjne `--ignore-scripts` magazyn używa `sql.js` w workerze z atomowym eksportem, zamiast natywnej bazy WAL. Jest to wariant dla małej instancji, z limitem 100 000 wiadomości łącznie. Reconnect pobiera spójną ostatnią stronę historii, a starsze wiadomości są dostępne przez stronicowanie. Skierowane zaproszenie używa identyfikatora istniejącego konta. Powiadomienia systemowe, wysyłka e-mail i boczny panel desktopowy pozostają poza MVP.

Głos nie uruchamia się bez skonfigurowanego TURN. Testy serwera i logiki audio nie zastępują odbioru mikrofonów w rzeczywistych przeglądarkach i sieciach. Zmieniono wyłącznie lokalne pliki projektu; nie publikowano aplikacji.
