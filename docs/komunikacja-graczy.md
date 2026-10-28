# Prywatna komunikacja graczy — obsługa i konfiguracja

## Gracze

Gospodarz w lobby otwiera „Zaproś” i generuje jednorazowy link ważny 24 godziny. Opcjonalnie wiąże go z identyfikatorem istniejącego konta; gracz znajdzie swój identyfikator w panelu konta. Sam kod nie pozwala zająć miejsca. Zalogowana osoba przy dołączeniu otrzymuje miejsce powiązane z kontem i może odzyskać grę na drugim urządzeniu. Zaproszenia nie są wysyłane automatycznie przez e-mail.

Sekret linku jest wymieniany na serwerowy kontekst z cookie HttpOnly, a następnie usuwany z adresu. Kontekst zachowuje się przy odświeżeniu i logowaniu Google. Nie udostępniaj linku innym osobom: zaproszenie bez przypisania do konta może wykorzystać jego pierwszy posiadacz.

Przycisk „Komunikacja” otwiera historię tekstową i głos. W starych rozgrywkach gospodarz najpierw potwierdza skład w ustawieniach tego panelu. Gospodarz może zamknąć rozmowę, wyczyścić historię i odebrać/przywrócić komunikację uczestnikowi bez usuwania jego miejsca z planszy.

Tekst: do 2000 znaków, Enter wysyła, Shift+Enter dodaje wiersz. Nieudane wiadomości mają przycisk ponowienia. Historia jest stronicowana i przechowywana 30 dni; wyczyszczenie blokuje ponowienia ze starej wersji historii. Treści nie są wysyłane do AI ani statystyk odwiedzin.

Głos:

- „Dołącz do rozmowy głosowej” uruchamia odsłuch bez nadawania.
- Przytrzymaj „Mic” myszą, dotykiem albo Space/Enter na przycisku. Puszczenie kończy nadawanie. Pierwsze użycie prosi o zgodę przeglądarki; zgoda uzyskana po puszczeniu nie uruchamia mikrofonu.
- „Mikrofon na stałe” świadomie włącza nadawanie ciągłe. Zamknięcie panelu, ukrycie karty, utrata fokusu lub rozłączenie je wyłącza. Powrót nie włącza go automatycznie.
- „Wycisz dla mnie” wyłącza odtwarzanie wybranego gracza tylko u Ciebie. On nadal Cię słyszy. Ustawienie zachowuje się na tym urządzeniu i jest rozdzielone pomiędzy miejsca/konta graczy.
- Można zmienić mikrofon, wznowić zablokowany odsłuch i opuścić głos. Drugie urządzenie przejmuje głos po jawnym dołączeniu. Na pierwszym zostaje tekst.
- Nieaktywny mikrofon może pozostać przygotowany do szybkiego nadawania. „Opuść głos” zwalnia urządzenie. Praca w tle i przy zablokowanym ekranie zależy od systemu telefonu.

## Serwer aplikacji

Wymagany backend Node, trwały katalog danych, HTTPS i reverse proxy z WebSocket. Działa również pod prefiksem z `PUBLIC_URL`.

| Zmienna | Znaczenie |
| --- | --- |
| `AETHERII_CHAT_ENABLED` | `false` wyłącza komunikację; domyślnie włączona. |
| `AETHERII_VOICE_ENABLED` | `false` wyłącza głos niezależnie od tekstu. |
| `TURN_URLS` | Lista URL oddzielonych przecinkami, np. `turn:turn.example.com:3478?transport=udp,turns:turn.example.com:5349?transport=tcp`. |
| `TURN_SECRET` | Wspólny sekret backendu i coturn, przechowywany wyłącznie w konfiguracji serwera. |

Bez TURN panel tekstowy działa, a głos pokazuje informację o wymaganej konfiguracji. Nie ma awaryjnego przejścia na publiczny STUN. Poświadczenia TURN są czasowe; audio używa relay-only. Nie zapisuj sekretu w repozytorium.

Dla Nginx w obrębie lokalizacji aplikacji (zachowując aktualne przepisywanie prefiksu i ustawienia Host):

```nginx
proxy_http_version 1.1;
proxy_set_header Upgrade $http_upgrade;
proxy_set_header Connection $connection_upgrade;
proxy_read_timeout 75s;
```

W kontekście `http` należy zdefiniować mapę:

```nginx
map $http_upgrade $connection_upgrade {
    default upgrade;
    '' close;
}
```

Backend sprawdza dokładny Origin względem `PUBLIC_URL`, jednorazowy bilet i aktualne członkostwo. Heartbeat usuwa martwe połączenia i kontroluje sesje co 15 sekund; wygaśnięcie konta odcina również otwarty kanał. Odebranie dostępu przez gospodarza zamyka kanał bez oczekiwania na heartbeat. Mesh nie gwarantuje infrastrukturalnego odcięcia już połączonych, zmodyfikowanych klientów. Lokalny mute pozostaje pod kontrolą odbiorcy.

## Własny TURN

Przygotowane pliki: `compose.turn.yaml` oraz `deploy/turn/turnserver.conf`. To konfiguracja opcjonalnej, osobnej usługi na Linux, nie opublikowane wdrożenie.

Przed uruchomieniem administrator ustawia `TURN_PUBLIC_IP`, silny `TURN_SECRET` oraz `TURN_CERTS_DIR` z `fullchain.pem` i `privkey.pem`, czytelnymi dla kontenera. DNS TURN musi wskazywać serwer. Obraz coturn jest przypięty do konkretnego digestu; aktualizacje wymagają świadomej zmiany i ponownej weryfikacji.

Otwórz 3478 UDP/TCP, 5349 TCP dla TURN/TLS oraz 49160–49260 UDP dla relay. Uwzględnij NAT i faktyczny publiczny adres. TURN/TLS na 443 wymaga oddzielnego IP albo osobnego routingu warstwy TCP, jeżeli ten sam host obsługuje już HTTPS gry. Podana konfiguracja nie otwiera dodatkowego 443 automatycznie.

```sh
docker compose -f compose.turn.yaml up -d
```

Coturn ma limity alokacji i pasma, blokadę relay do adresów prywatnych, loopback, multicast oraz własnego adresu publicznego. Nie jest otwartym relay. Przed wdrożeniem przetestuj wybrany obraz, TLS i rozmowę z sieci mobilnej; samo wydanie credentials nie sprawdza dostępności portów ani faktycznego transportu audio.

## Historia, kopie i ograniczenia MVP

`chat.sqlite` znajduje się w `AETHERII_DATA_DIR`, osobno od `rooms.json` i `accounts.json`. Używa SQLite przez `sql.js` w workerze: nie wymaga natywnych skryptów instalacji i działa z `--ignore-scripts`. Worker serializuje operacje i atomowo zapisuje kompletny obraz bazy przed ACK. To baza w pamięci z eksportem pliku, nie natywny SQLite WAL: koszt zapisu rośnie z historią, a limit wynosi 100 000 wiadomości łącznie. Dla większego ruchu należy przejść na natywną bazę zamiast skalować ten magazyn. Ograniczenie nie dotyczy silnika gry, który pozostaje na własnym transporcie i rewizjach.

Retencja działa przy starcie, operacjach magazynu i co godzinę. Zatrzymany serwer nie wykonuje retencji. Kopie danych wykonywać przy zatrzymanej aplikacji i odtwarzać razem z pokojami/kontami; ustalić osobną retencję backupów. Tekst jest czytelny dla administratora i uczestników; brak szyfrowania tekstu end-to-end.

Wycofanie do obrazu sprzed prywatnych zaproszeń ponownie umożliwi wejście po kodzie. Przy rollback wyłącz tworzenie/dołączanie do lobby na proxy albo stosuj obraz ze zgodną kontrolą zaproszeń. Wyłączenie samego czatu nie zmienia prywatności dołączania.

MVP nie zawiera wysyłki zaproszeń e-mailem, publicznej wyszukiwarki kont, załączników, prywatnych wiadomości 1:1, nagrywania, transkrypcji ani powiadomień systemowych o czacie. Obsługa głosu w prawdziwych przeglądarkach i sieciach wymaga odbioru na dwóch urządzeniach; podgląd telefonu w aplikacji nie zastępuje tego testu.

## Weryfikacja lokalna

Wykonano testy API i magazynu obejmujące izolację pokojów, jednorazowość biletów WS, odrzucenie obcego Origin, powiązanie zaproszenia z kontem, odzyskanie miejsca, odcięcie po wylogowaniu, retencję, stronicowanie, restart oraz cofnięcie nieudanego zapisu. Test logiki głosu sprawdza spóźnioną zgodę na mikrofon, puszczenie Mic, zamknięcie sesji i zachowanie lokalnego mute po wymianie połączenia.

Produkcję sprawdzono przez budowę obrazu Alpine oraz uruchomienie w nim testów komunikacji i SQLite. Sprawdzono prefiks aplikacji, integralność chronionego runtime i statyczny build Sites. Konfigurację przypiętego coturn uruchomiono z testowym certyfikatem w kontenerze bez sieci; potwierdzono nasłuch TCP/TLS. Nie jest to test przepływu audio przez publiczny TURN ani weryfikacja interfejsu w przeglądarce. Do odbioru pozostają dwie prawdziwe przeglądarki/urządzenia oraz docelowe DNS, certyfikat i firewall.
