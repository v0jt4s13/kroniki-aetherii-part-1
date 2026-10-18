# Smok i animacje najazdu

Ilustracja: `app/public/game/aetherii/dragon.webp` (512 × 512, przezroczystość alpha).
Wygenerowana wbudowanym Image Gen, następnie przeskalowana i zakodowana do WebP
z zachowaniem przezroczystości. Nie używano API ani awaryjnego CLI generowania.

## Prompt

Use case: stylized-concept. Asset type: transparent cutout sprite for an existing painted fantasy hex-board game, Kroniki Aetherii. Paint ONE complete airborne dragon, viewed from above at a slight three-quarter angle, head pointing diagonally toward the lower left, long curled tail trailing upper right, two broad fully visible outstretched bat-like wings, four small legs tucked beneath body. Ancient threatening charcoal and deep wine-red scales, muted copper ridges, warm amber eyes, leathery burgundy wings. Hand-painted gouache and detailed fantasy board-game illustration with fine readable silhouette, organic brushwork, restrained warm highlights. The entire creature comfortably contained with generous transparent padding, no clipped wing tips. Flat transparent background with genuine alpha, no landscape, no island, no ground shadow, no border, no text, no fire breath, no extra objects. This will be displayed at about 90 pixels wide over turquoise ocean and painted terrain, so prioritize clear wing/body separation and a strong silhouette that reads at small scale. High-quality 1024 square sprite illustration.

## Zachowanie

- Początek najazdu: smok startuje przy nagłówku bloku „Zagrożenie Krainy” / „Najazd na Aetherię”, przylatuje nad wyspę i pozostaje nad morzem w lewym górnym rogu planszy. Początek trasy jest mierzony z rzeczywistego układu: na telefonie spod planszy, na desktopie z bocznego panelu. Kluczem animacji jest początek najazdu, więc kolejne siódemki nie uruchamiają przylotu ponownie.
- Zwycięstwo: smok odlatuje, pojawia się zielono-złoty komunikat z Pancerzem oraz krótki rozbłysk iskier.
- Porażka: smok wykonuje przelot, delikatna czerwona poświata towarzyszy komunikatowi z wynikiem. Kataklizm ma osobny tekst.
- Wynik pojawia się na środku widocznego okna gry przez 4,8 sekundy (w natywnym widoku także wtedy, gdy plansza jest przewinięta poza ekran). Odświeżenie/zaczytanie historycznej bitwy nie odtwarza animacji; nowy najazd ma pierwszeństwo przed poprzednim wynikiem.
- Warstwa jest przezroczysta dla dotyku i myszy. Nie zmienia zasad ani obsługi kości, budowania, powiększania i przesuwania planszy.
- Przy `prefers-reduced-motion: reduce` smok jest statyczny, a wynik czytelny bez lotu, błysków i iskier.

Implementacja: `app/src/RaidEffects.tsx`, `app/src/raid-effects.css`, osadzone w `Board.tsx`.
Źródłem zdarzeń są `raid.started` i `lastBattle.turn`; nie zmieniano protokołu zapisów.

Weryfikacja: `cd app && npm run test:raid-browser`. Obejmuje 320/393/1440 px, prefiks URL,
przylot, sterowanie planszą, oba wyniki, brak ponownego odtwarzania po odświeżeniu,
wygaśnięcie komunikatu i ograniczenie ruchu.
