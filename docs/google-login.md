# Logowanie Google i konta graczy

Logowanie e-mailem i hasłem działa bez dodatkowych usług. Konto przechowuje imię oraz listę rozgrywek. Hasła są haszowane przez scrypt z osobną solą, a sesje korzystają z ciasteczek HttpOnly, SameSite=Lax i 30-dniowego terminu ważności. Po wylogowaniu zapisane klucze pokojów konta nie zapewniają dostępu bez zalogowania. Adres e-mail nie jest publiczny dla pozostałych graczy. Obecnie nie ma wysyłki e-maili, weryfikacji adresu ani odzyskiwania zapomnianego hasła; można używać Google jako dostawcy tożsamości.

## Konfiguracja Google

1. W [Google Cloud Console](https://console.cloud.google.com/) utwórz lub wybierz projekt. W **Google Auth Platform** skonfiguruj nazwę aplikacji, adres kontaktowy i odbiorców. Dla aplikacji zewnętrznej w trybie testowym dodaj adresy testerów.
2. Utwórz klienta OAuth typu **Web application**. Do dozwolonych adresów przekierowania dodaj dokładnie:
   - lokalnie: `http://localhost:4173/api/auth/google/callback`;
   - na serwerze: `https://TWOJA-DOMENA/api/auth/google/callback`.
3. Skopiuj `app/.env.example` do `app/.env`. Wpisz identyfikator klienta, sekret i adres strony:

```dotenv
PUBLIC_URL=http://localhost:4173
GOOGLE_CLIENT_ID=twoj-identyfikator.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=twoj-sekret
```

4. Zrestartuj serwer. Przycisk **Kontynuuj z Google** będzie aktywny. Dla produkcji ustaw publiczny adres HTTPS w `PUBLIC_URL`; ta zmienna określa również ciasteczka Secure. Nie używaj adresu lokalnego dla publicznej aplikacji.
5. Dla Docker Compose ustaw te same zmienne w środowisku lub głównym pliku `.env` obok `compose.yaml`. Następnie odtwórz kontener. Compose przekazuje wartości do procesu aplikacji.

Sekret pozostaje na serwerze. Nie wklejaj go do czatu, kodu frontendowego ani repozytorium. Pliki `.env` są ignorowane przez Git i kontekst budowania Dockera. `app/data/accounts.json` oraz `rooms.json` wymagają trwałego, prywatnego katalogu danych i kopii zapasowych. Utrata pliku kont uniemożliwi zalogowanie do przypisanych rozgrywek.

Integracja używa przekierowania OAuth z kodem autoryzacyjnym, PKCE, jednorazowym `state` powiązanym z przeglądarką, `nonce` i weryfikacją podpisu tokenu ID przez oficjalną bibliotekę Google. Pobiera wyłącznie podstawową tożsamość (`openid`, `email`, `profile`); nie prosi o dostęp do poczty Gmail ani nie przechowuje tokenów dostępu Google. Implementacja opiera się na [instrukcji OAuth dla aplikacji serwerowych](https://developers.google.com/identity/protocols/oauth2/web-server) oraz [weryfikacji tokenów ID](https://developers.google.com/identity/gsi/web/guides/verify-google-id-token).

## Korzystanie

- Otwórz **Zaloguj / załóż konto** nad tytułem gry. Wybierz Google albo rejestrację e-mailem i hasłem.
- Gry utworzone i dołączone po zalogowaniu są automatycznie przypisywane do konta. W **Moje konto → Twoje rozgrywki** wrócisz do gry również na innym urządzeniu.
- Bieżącą grę gościa przypisz przyciskiem **Zapisz tę grę na koncie**. Wymaga to dostępu do sesji tego gracza.
- Jeśli adres Google ma już lokalne konto z hasłem, zaloguj się hasłem, a następnie wybierz **Połącz konto z Google**. Nie łączymy kont automatycznie wyłącznie na podstawie adresu e-mail.
- Po restarcie serwera trzeba ponownie rozpocząć niedokończone logowanie Google. Zapisane konta, sesje i rozgrywki pozostają dostępne.

Testy lokalne pokrywają zapis kont, sesje, uprawnienia pokojów, powrót po restarcie oraz zabezpieczenia przekierowania OAuth. Pełne logowanie z prawdziwym kontem Google wymaga własnej aplikacji OAuth i zostało pozostawione do sprawdzenia po konfiguracji.

## Powiadomienia

Popupy o turze i ofertach działają bez dodatkowych uprawnień. Pod akcjami gracza można włączyć powiadomienia przeglądarki. Wymagają obsługiwanej przeglądarki, zgody użytkownika i HTTPS (lub localhost). Działają, gdy strona pozostaje otwarta, również w nieaktywnej karcie; nie są powiadomieniami push po zamknięciu strony. Przeglądarki mobilne mogą ograniczać systemowe powiadomienia — popup w grze pozostaje dostępny. Nie wymuszamy przenoszenia okna na pierwszy plan.
