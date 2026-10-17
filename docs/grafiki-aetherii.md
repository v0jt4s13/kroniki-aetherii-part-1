# Grafiki Kronik Aetherii

Grafiki przygotowano 14 października 2026 w workflow **Product Design**, z użyciem wbudowanego **Image Gen**. Punktem odniesienia były rzeczywiście odczytane obrazy z `app/public/game/` i widok dotychczasowej gry. Nie korzystano z fallbacku CLI ani zewnętrznego API.

Finalne zasoby znajdują się w `app/public/game/aetherii/`. Pierwotne grafiki pozostawiono na miejscu. Każda grafika powstała w osobnym wywołaniu; nie wycinano elementów z atlasu ani makiety. Po wygenerowaniu pliki przeskalowano proporcjonalnie do slotów i zapisano jako WebP. Ikony zachowują rzeczywisty kanał alfa.

| Plik | Motyw | Rozmiar | Obraz odniesienia |
|---|---|---|---|
| `header.webp` | elfie lasy i krasnoludzka cytadela na pergaminie | 1600 × 600 | `header.webp` |
| `forest.webp` | pradawny las o srebrnych pniach | 512 × 512 | `forest.webp` |
| `brick.webp` | kamieniołom z runicznymi blokami | 512 × 512 | `forest.webp` |
| `sheep.webp` | łąka Eterycznych Ziół | 512 × 512 | `forest.webp` |
| `wheat.webp` | złote pola Ludzi z Równin | 512 × 512 | `forest.webp` |
| `ore.webp` | górskie kopalnie Mitrilu | 512 × 512 | `forest.webp` |
| `icon-wood.webp` | pradawne drewno | 256 × 256 | `icon-wood.webp` |
| `icon-brick.webp` | runiczny kamień | 256 × 256 | `icon-brick.webp` |
| `icon-sheep.webp` | wiązka ziół | 256 × 256 | `icon-sheep.webp` |
| `icon-wheat.webp` | zapasy zboża | 256 × 256 | `icon-wheat.webp` |
| `icon-ore.webp` | bryły Mitrilu | 256 × 256 | `icon-ore.webp` |

## Zestaw promptów

Poniżej zapisano zastosowane kierunki i ograniczenia promptów. Język roboczy generowania: angielski. Obrazy źródłowe przekazano bezpośrednio do narzędzia jako `referenced_image_paths`.

**Nagłówek:** Edit the attached panoramic watercolor game header. Repaint for the fantasy board game Kroniki Aetherii: Korona i Cień. Preserve the aged cream parchment background, quiet large blank center and panoramic composition. Replace the Mediterranean coast on the left with ancient elven forests, pale stone spires, and on the far right a dwarven mountain citadel with faint blue mithril veins. Tiny distant dark storm clouds at the right edge suggest an approaching raid. Warm antique watercolor and fine ink engraving, detailed but restrained. Wide panoramic image 1536 x 576, subjects at bottom and outer edges, center and top largely blank parchment so HTML title is readable. No text, UI, lettering or border.

**Las:** Edit this square watercolor board-game forest texture into an ancient elven forest for Kroniki Aetherii. Preserve overhead top-down camera, dense forest filling all four edges, natural finely painted leaves and restrained contrast for a number token overlay. Add old twisting silver trunks, deep emerald foliage and tiny blue luminous magical motes. No buildings, text, number tokens or hexagon outline. A single 1024x1024 terrain texture, not a mockup or a sheet. Hand-painted antique fantasy atlas watercolor on parchment.

**Mitril:** Use the current forest tile's hand-painted top-down antique atlas style. Create a square 1024x1024 terrain texture: mountain mithril mines, pale jagged blue-silver rock, exposed glowing cyan mithril crystal veins, a small dark dwarven mine entrance embedded in rock. Terrain fills the entire square. Overhead near-top-down view, detailed watercolor and ink, readable large masses at small tile sizes, restrained contrast for a cream number token. No outline, text, numbers, UI or border.

**Zioła:** Create a single square 1024x1024 texture: an overhead fantasy meadow of ethereal herbs, large lush sage-green leaves, recognizable glowing violet and turquoise medicinal flowers, moss and little wisps of magic. Dense ground cover fills the square. Antique watercolor fantasy atlas, warm parchment undertone, fine detail, readable color masses at small tile size. Leave center free of a large landmark for a number token overlay. No sheep, animals, text, numbers, hexagon border, UI or multiple panels.

**Kamień:** Single 1024x1024 square full-bleed terrain: runic stone quarry of the rock elves, terracotta and ochre cliffs, angular warm red sandstone blocks engraved with delicate teal runes and small ancient stone circles embedded into landscape. Overhead top-down view, finely painted rock, clear warm red color identity distinct from green forests and blue mithril mountains. No words, numbers, UI, sheet, hexagon outline or borders; avoid a central landmark because a number token overlays center.

**Zapasy:** Single 1024x1024 square full-bleed fantasy terrain: golden terraced fields and fertile plains of humans, subtle winding path, tiny weathered stone granary at upper edge, scattered pale standing stones, faint magical light in golden wheat. Top-down overhead antique fantasy atlas watercolor with fine ink details, warm gold identity, terrain covers all edges, calm center for overlaid game number. Match reference density and scale. No text, numbers, border, hexagonal outline, UI or sheet.

**Ikona Ziół:** Replace the sheep resource icon with a compact bundle of ETHEREAL HERBS. Preserve finely hand-painted antique watercolor and dark ink contour, isolated single centered object, fills about 85% width, clean silhouette readable at 48px. Tied bundle of sage-green medicinal leaves and three violet glowing flowers with a subtle turquoise magical glint. Single 1024x1024 icon, actual transparent background, no shadow beyond object, frame, text, UI, sheep or sheet. Not cartoon emoji or photoreal.

**Ikona Mitrilu:** Replace gray ordinary rocks with a compact group of angular blue-silver MITHRIL rocks and luminous cyan crystal veins. Preserve finely painted watercolor and thin dark ink contour, centered isolated object and wide compact silhouette readable at 48px. Single 1024x1024 asset, fills 85% width, actual transparent background, subtle shading on object, no cast shadow beyond object, text, frame, UI or sheet; not emoji or 3D.

**Ikona Kamienia:** Rework the orange bricks into a compact stack of three ancient warm terracotta RUNIC STONE blocks engraved with faint teal angular abstract magical glyphs. Preserve finely hand-painted watercolor and thin dark ink contour, wide compact centered silhouette, clear at 48px. Single 1024x1024 asset, actual transparent background, fills 85% width, no cast shadow beyond object, recognizable letters, frame, UI or sheet; not emoji or 3D.

**Ikona Drewna:** Repaint as PRADAWNE DREWNO: three dark honey-brown logs with twisted old bark, silver rings visible on cut ends, deep green moss and subtle turquoise magical flecks. Preserve finely painted antique watercolor with dark ink contours, centered wide compact silhouette readable at 48px, fills about 85% width. Single 1024x1024 icon, actual transparent background, no ground shadow beyond object, frame, text, UI or sheet; not emoji or 3D.

**Ikona Zapasów:** Repaint as ZAPASY: a compact tied sheaf of golden wheat resting against a small rustic cloth grain sack, a wooden clasp bearing an abstract golden sun mark. Preserve finely hand-painted watercolor and dark ink contours, warm antique fantasy board-game icon, centered compact wide silhouette readable at 48px, fills 85% width. Single 1024x1024 asset, actual transparent background, no cast shadow beyond object, frame, readable text, UI or sheet; not emoji or 3D.

## Kontrola

Sprawdzono kompletne ładowanie wszystkich terenów i pięciu ikon, zachowanie przezroczystości, brak owcy przy Ziołach, czytelność numerów na terenach oraz nagłówek przy 320/393/1440 px. Zrzuty: `artifacts/aetherii-game-*.png`, `artifacts/aetherii-defense-mobile.png`. Wyniki funkcjonalne: `artifacts/aetherii-browser-results.json`.

## Strażnice frakcji

Cztery dodatkowe grafiki powstały w osobnych wywołaniach wbudowanego Image Gen, na podstawie stylu `icon-ore.webp`. Pliki 256 × 256 WebP z przezroczystością, bez przycinania ani deformowania:

- `app/public/game/aetherii/watchtower-dwarves.webp`: przysadzista kamienna wieża, mosiężne wzmocnienia i Mitril.
- `app/public/game/aetherii/watchtower-rock-elves.webp`: jasna smukła wieża z kryształową iglicą.
- `app/public/game/aetherii/watchtower-forest-elves.webp`: żywe drzewo z balkonem i zieloną koroną.
- `app/public/game/aetherii/watchtower-humans.webp`: drewniana wieża z czerwonym dachem i palisadą.

Dokładne prompty i ścieżki oryginałów: [watchtower-prompts.json](watchtower-prompts.json). Te same grafiki pojawiają się przy Strażnicach na planszy oraz obok imion na pasku punktacji. Kolorowa podstawka pozostaje dodatkowym oznaczeniem właściciela. Cytadele i podświetlanie miejsc budowy zachowują dotychczasowe oznaczenia.

Kontrola w przeglądarce potwierdza cztery różne pliki, zgodność frakcji pomiędzy planszą a punktacją, pełne ładowanie obrazów i brak poziomego przewijania przy 320/393/1440 px. Zrzuty: `artifacts/watchtower-score-*.png`, `artifacts/watchtower-board-*.png`.
