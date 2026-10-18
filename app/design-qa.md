# Product Design verification · Kroniki Aetherii

final result: passed

## Target and evidence

This is a revision of the existing game artwork and rules, grounded in the original painted parchment interface. It is not a pixel clone of the former Catan screen. Intentional changes are the fantasy title, generated terrain and icons, faction labels and raid monitor. Board geometry, pan/zoom, player colors, typography families and the protected mobile device runtime remain the reference constraints.

- Original desktop source: repository HEAD `artifacts/game-desktop.png`, 1440 × 1000 viewport. Final implementation: `artifacts/aetherii-game-1440.png`, 1440 × 1000 viewport, deviceScaleFactor 1, full-page capture. Content/turn differs because new raid rules add the defense monitor; this is expected, not a fidelity defect.
- Combined desktop comparison: `artifacts/aetherii-comparison-desktop.jpg`. Source and final implementation are in the same image input, proportionally downscaled for inspection. Review original screenshots for full detail.
- Combined mobile iteration: `artifacts/aetherii-comparison-mobile.jpg`, pre-polish and final 320 px layouts in the same image input. Dice/turn/board content differs; header and resource label comparisons remain valid.
- Final phone captures: `artifacts/aetherii-game-320.png`, `artifacts/aetherii-game-393.png`. Defense interaction: `artifacts/aetherii-defense-mobile.png`.
- Existing mobile template: `artifacts/template-mobile.png`, unscaled 393 × 852 content-only capture. Runtime integrity passes for all 28 protected files.
- Functional checks: `artifacts/browser-results.json`, `artifacts/ai-browser-results.json`, `artifacts/features-browser-results.json`, `artifacts/aetherii-browser-results.json`.

## Findings and fixes

Initial review was blocked by two P2 issues:

1. At 320 px the longer title overlapped room controls. Mobile title and subtitle now occupy a separate row above the room code/share controls. The browser test checks that their bounding boxes do not overlap at 320 and 393 px. Final combined evidence shows the complete title and separate controls.
2. Full resource names wrapped inside narrow 320 px columns, while icons still showed old sheep and ordinary ore. The five newly generated transparent icons are now connected; compact labels (Drewno, Kamień, Zioła, Zapasy, Mitril) fit and expose full names in titles and resource selectors. Final comparison shows complete icons and readable labels.

No remaining actionable P0/P1/P2 mismatch against the scoped reference constraints was found. Full-page mobile screenshots show the fixed bottom navigation within the long page; users can scroll content through the viewport. This is expected browser capture behavior.

## Required fidelity surfaces

- **Fonts/typography:** Libre Baskerville and DM Sans preserved. New title fits mobile and desktop without colliding with controls. Resource and faction names are readable at the intended density.
- **Spacing/layout:** 19 hexes and ports remain within the board viewport. Desktop retains board/action columns. Mobile header reserves a separate controls row. Screens at 320/393/1440 px have no horizontal document overflow.
- **Colors/tokens:** Cream parchment, green actions and stable player colors preserved. Rust-red raid status is distinct from the neutral realm status; values and text communicate the same state without relying solely on color.
- **Image quality:** Five separately generated terrain textures fill the existing hex masks without stretching. Five separately generated icons retain alpha. Blue Mithril and violet Herbs are distinct from forest, quarry and plains. The panoramic header retains a blank center under the title. Generated full-size images were inspected before proportional WebP conversion; all final images load successfully.
- **Copy/content:** UI uses Kroniki Aetherii, Strażnice, Cytadele, Trakty and Karty Magii. The source rules link replaces REBEL. Visible defense values reflect the server snapshot. Implementation assumptions and asset prompts live in documentation rather than the main player flow.

## Validation

44 automated engine/AI/API/account tests, including raid timing, four faction powers, ties, penalties, conservation of resource cards, deferred victory, cataclysm and migration backup. Production build and protected-runtime integrity pass. Browser suites verify real pointer setup, room recovery, AI turns, accounts and notifications. Aetherii-specific browser checks verify donation controls, doubled dwarf armor, one-use Stone Echo, image loading and responsive title geometry.

## Aktualizacja: strażnice frakcji

Zastąpiono jednakowe domki czterema osobno wygenerowanymi ilustracjami frakcji i dodano te same ikony obok imion graczy. Obejrzano źródłowe grafiki oraz zrzuty `artifacts/watchtower-score-320.png`, `artifacts/watchtower-score-1440.png` i `artifacts/watchtower-board-393.png`. Czytelne sylwetki rozróżniają kamienną twierdzę, iglicę, drzewo i drewniany posterunek. Małe kolorowe podstawki wskazują właściciela. Brak nowych kolizji z numerami terenów i nazwami graczy. Test przeglądarkowy sprawdza osiem Strażnic i cztery ikony punktacji oraz zgodność ich ścieżek. Build i kontrola 28 chronionych plików przechodzą.

## Aktualizacja: rozmiary plansz i mieszane pokoje

Dodano wybór 19/23/25 heksów w formularzu nowej gry i lobby gospodarza oraz składy 1 człowiek + 3 SI, 2 ludzi + 2 SI, 3 ludzi + 1 SI. Dziennik zawiera faktyczne sumy produkcji każdego gracza po każdym rzucie. Istniejące partie zachowują planszę i obsadę.

49 testów silnika/API/kont/SI przechodzi; nowe scenariusze sprawdzają geometrię wszystkich plansz, unikalność portów, legalne żetony, rezerwację miejsc, uprawnienia gospodarza, wszystkie mieszane składy, logowanie zerowej/ograniczonej produkcji oraz automatyczne ruchy trzech SI i wznowienie po restarcie. Build i kontrola chronionych plików przechodzą.

Test `test:party-browser` przechodzi dla trzech rozmiarów i trzech składów przy realnym rozstawianiu przez kliknięcia, automatycznych ruchach SI, odczycie dziennika i odświeżeniu. Zrzuty: `artifacts/party-19-*.png`, `party-23-*.png`, `party-25-*.png`, `party-log-*.png`. Wyniki: `artifacts/party-browser-results.json`.

Dwie wykryte usterki wizualne naprawiono i ponownie sprawdzono: długie imiona zwężają się przy ikonach frakcji zamiast poszerzać dokument na 320 px; na większych wyspach porty są odsuwane prostopadle od lokalnej krawędzi wybrzeża, a zoom przeniesiono na morze w prawym górnym rogu. Test mierzy brak kolizji etykiet portów z numerami produkcji. Obejrzano finalne zrzuty 23/25 pól na telefonie i komputerze; nie stwierdzono nowych problemów z czytelnością numerów ani ładowaniem ilustracji.

## Aktualizacja: dodatkowe rzuty za dublety

Każda para jednakowych oczek pozostawia aktywnego gracza w fazie rzutu i pokazuje nagłówek „Dublet! Rzuć ponownie” oraz przycisk „Rzuć ponownie”. Handel, budowa, mobilizacja i koniec tury czekają na wynik bez pary. Obejrzano `artifacts/doubles-mobile.png`; zachowano istniejącą oprawę, planszę i pasek frakcji.

Przechodzi 55 testów silnika/API/SI, w tym sześć nowych scenariuszy: wielokrotne dublety, blokada pozostałych akcji, serializacja oczekującego rzutu i polityka SI, siódemka na końcu serii, niezmienione terminy najazdów i rund kary oraz niedobór banku podczas kolejnej produkcji. Nowy test `test:doubles-browser` potwierdza dwa dublety z rzędu, odświeżenie między rzutami, nieaktywne budowanie, odblokowanie po zwykłym wyniku i przekazanie tury. Przechodzi również test przeglądarkowy AI, build i kontrola chronionych plików.


## Aktualizacja: puste pole

Przywrócono jedno Pustkowie bez numeru i produkcji na każdej nowej planszy 19/23/25 pól. Rozpoczęte partie zachowują układ. Czerwone 6 i 8 mają podpowiedź prawdopodobieństwa 5/36; wyjaśnienie dodano również do zasad. Przechodzi 56 testów, build i kontrola chronionych plików. Test przeglądarkowy potwierdza po jednym pustym polu i właściwą liczbę żetonów na wszystkich trzech rozmiarach, mieszane pokoje, produkcję i odświeżenie. Obejrzano zrzut `artifacts/party-19-1440.png`: Pustkowie jest widoczne jako piaskowy heks bez żetonu.
