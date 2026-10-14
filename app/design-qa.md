# Product Design verification

final result: passed

## Evidence

- Source visual truth: `/home/vs/.codex/generated_images/01a12282-6437-7020-a601-e5eb0f2bbaab/exec-b88fd166-377d-4e65-b8e4-e2ade2172f07.png` (first selected image, Papierowa wyspa).
- Source pixels: 853 × 1844. Normalized proportionally to 393 × 850 for comparison; no device bezel in source.
- Native browser implementation: `../artifacts/game-mobile.png`, 393 × 852 CSS and raster pixels, deviceScaleFactor 1, own turn before dice roll after four-player setup.
- Same-input full-view evidence: `../artifacts/comparison-mobile.png`. Source left, rendered implementation right.
- Focused control comparison: `../artifacts/comparison-controls.png`. Both control regions shown together; resource imagery, labels, type hierarchy, primary action and bottom navigation remain readable.
- Desktop evidence: `../artifacts/game-desktop.png`, 1440 × 1000 viewport, full-page capture. Small phone: `../artifacts/game-small-mobile.png`, 320 × 740 viewport.
- Protected template evidence: `../artifacts/template-mobile.png`, device screen element 393 × 852 at scale 1 inside a 1400 × 1200 browser viewport. All 28 protected runtime files pass integrity checks.
- Functional browser evidence: `../artifacts/browser-results.json`, four isolated Chrome contexts, zero console/page errors in final run.

## Findings and comparison history

Initial review found actionable issues and remained blocked:

1. [P1] Settlement hit areas intercepted adjacent legal-road pointer clicks. Disabled pieces now have `pointer-events:none`; all sixteen setup placements and confirmations pass using actual pointer clicks.
2. [P2] Enlarged desktop island extended below the board viewport. Desktop world now uses a separate 94% width; final desktop capture shows all 19 tiles and nine ports.
3. [P2] Port labels extended beyond the narrow mobile viewport or under zoom controls. Port positions now clamp inside the viewport and shift away from the controls; recapture shows all labels.
4. [P2] Room code competed with the title on small phones. Title sizes and 320px brand alignment were adjusted; final small-phone capture shows separate title, code and share targets without horizontal overflow.
5. [P2] A composed resource illustration strip clipped sheep/wheat and showed a tinted rectangular background. Replaced it with five individually generated, transparent, independently fitted raster assets. Final focused comparison shows complete motifs.
6. [P2] Primary mobile action was partly behind persistent navigation. Native board proportions were compacted; final 393px capture shows the complete action above navigation, while the document remains scrollable on shorter screens.

Final review found no remaining actionable P0/P1/P2 issues.

## Required fidelity surfaces

- **Typography:** Libre Baskerville for display/control headings, DM Sans for forms and supporting UI. Both self-hosted with Polish character subsets. Dark green hierarchy, serif player names, large resource counts and legible mobile copy match the selected direction.
- **Spacing/layout rhythm:** illustrated header, player row, dominant ocean board, centered turn prompt, five-column resource hand, primary action and persistent menu preserve the source hierarchy. Compact board height and slightly larger touch controls are intentional adaptations to keep the main action visible. Desktop uses a board/control split because the source is mobile-only.
- **Colors/tokens:** warm ivory parchment, dark green text/actions, ochre tile edges, muted blue ocean, and four distinct player colors. Error/disabled/active states are explicit.
- **Asset quality:** newly generated woodcut/watercolor forest, pasture, wheat, clay, mountains, desert, ocean, coastal header and paper texture. Individual transparent resource illustrations avoid clipping/halos. Assets optimized to WebP. UI and functional piece markers use Radix icons; no handcrafted decorative SVG or placeholder image art.
- **Copy/content:** Polish throughout. Live names, numbers, starting scores and hands differ from the static mock by design. Legal board topology, random terrain and server state determine tile numbers and piece placement. Empty, waiting, lobby, errors, selection and reconnect states have actionable copy.

## Primary interactions tested

Room creation, copying invitation field, joining from link in four independent contexts, host start, snake setup via real clicks, confirmations, zoom buttons, drag pan, touch pinch via Chrome touch events, center reset, development-card panel, refresh retaining identity, dice roll, turn transfer, no horizontal overflow at 320px, desktop rendering and preserved mobile template. API tests additionally cover capacity, private hands, unauthorized access, stale revisions, simultaneous actions, atomic rejection, persistence across server restart and static production routes.

## Follow-up polish (P3)

- Standard icon piece markers have flatter shading than the wooden pieces in the mock. Their colors and positions represent actual playable state.
- Extra Dziennik navigation exposes the session history and rules; source showed four core destinations.
- Verify pinch feel on physical iOS/Android devices. Browser touch dispatch tests gesture behavior but cannot assess device-specific feel.
- Docker configuration is supplied; Docker image build and public HTTPS deployment were not performed.

## Implementation checklist

- [x] Compare full screen and focused controls against selected source.
- [x] Resolve visual/usability P1/P2 findings and recapture.
- [x] Verify phone, small phone and desktop.
- [x] Test four-player core flow and console errors.
- [x] Preserve Product Design runtime and pass production build.
- [x] Document public hosting requirement and persistence scope.

## AI two-player follow-up

Added a native mode selector with friends, human-versus-AI and two-human practice options. AI mode immediately starts a two-player training game. The header opens the game history instead of inviting another player to a full AI session; the player row identifies the computer with `(AI)` and uses the space available for two names. Existing board, textures, palette and navigation are retained.

Evidence: `../artifacts/ai-mode-mobile.png`, `../artifacts/ai-game-mobile.png`, `../artifacts/ai-browser-results.json`. Chrome checks cover the selector, both human setup pairs via pointer, both automatic AI setup pairs, refresh, dice, automatic AI turn, history and 320px overflow. The four-human browser regression also passes. All 25 engine/API/AI tests pass, including three complete games to 10 points and automatic AI resumption after a server restart. AI decisions use the same private snapshot available to a human player. No new font suppressions or protected runtime changes.

## Dice gains and four-settlement start

Two-player setup now uses four settlement/road pairs per player (1–2–2–1–1–2–2–1), with initial resources only from the last placement. Existing started sessions keep their stored setup order. The latest roll summary displays the current player's actual production below the dice, including zero gains; it survives turn changes, refresh and server restart. Backend snapshots expose only that player's gains. Instructions and README reflect the variant.

Validation: all 28 tests pass, including two-player setup order, initial resource allocation, production blocked by robber, seven, bank shortage, private summaries and saved results after restart. Production build and all 28 protected runtime files pass. Chrome mobile check completes all four human placements and AI placements, asserts the roll summary, and completes an automatic AI turn without errors. Inspected `../artifacts/ai-game-mobile.png` for final layout.

## Accounts, alerts, cards and board containment

Preserved the parchment, illustrated island and display/body fonts. Added an account strip above the header, email/password account sheet, Google sign-in configuration state and account game list. Disabled construction options now retain full text contrast and state the reason they are unavailable. Development cards show descriptions even when unplayable; an expandable reference includes all five types. Popup alerts identify new turns and incoming offers, support dismissal and navigation to the offer, and avoid duplicate alerts during polling. Optional browser notifications are requested only after a user click, with in-app fallback.

Board content is clipped to `.board-world`; pan bounds derive from actual content, viewport and zoom dimensions and adapt on resize. Native and protected phone runtimes remain separate; fixed alerts stay outside the scrolling phone content. Final captures: `account-mobile.png`, `build-readable-mobile.png`, `card-descriptions-mobile.png`, `trade-alert-mobile.png`, `features-desktop.png` in `../artifacts/`. Reviewed mobile and desktop in a batched pass; corrected a shrinking card icon and moved notification controls into the action panel to remove excess page space.

Evidence: `../artifacts/features-browser-results.json` covers registration/logout, new-device email login and game recovery, all five descriptions, disabled build readability, turn/trade popups, hidden-tab title, mocked browser Notification dispatch, deduplication, pan bounds and 320px/desktop. Both four-player and AI browser regressions pass. Engine/API/account tests cover hashing and private sessions, account room access, restart, OAuth state/PKCE, nonce/audience verification through a mocked Google library boundary, explicit linking, throttling, independent dice and drawing development cards without replacement. Actual Google login awaits the owner's OAuth credentials; no live Google account was used. Mechanical detector reported no findings. No new design suppressions.
