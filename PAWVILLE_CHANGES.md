# Pawville — Milestone 2 change log & verification report

## 1. Victory overlay could stay on screen after "Back to Pawville" / "Back to lobby"

**What I could inspect:** `GameRoomPage.tsx`, `OfflineGamePage.tsx`, `HomePage.tsx`, `TopBar.tsx`, `Modal.tsx`, `Button.tsx`, `CustomizeModal.tsx` and my Milestone 1 `App.tsx` / `navigation.ts`. I could **not** open `src/router.ts` (OneDrive serves `.ts` files as video) or `VictoryOverlay.tsx` (file access limit), so the exact behaviour of the original `navigate()` and the overlay internals is inferred, not read.

**Root cause (Milestone 1 integration):**
1. **Two sources of truth for "which screen".** Milestone 1's `App` picked the screen from *both* the original router's state (`useRoute()`) and a separate Pawville pathname store, and `goTo()` assumed the original `navigate()` updates the URL synchronously. For paths the original router doesn't know (`/arcade`) or if it applies the change later, the URL and the rendered screen could disagree, so the finished game page — and its victory overlay — stayed mounted.
2. **Online "Back to lobby" awaited `room.leave()` before navigating** with no error handling: a slow or failed leave left the player stuck on the result card.
3. The overlay's `open` prop depended only on match state, so nothing closed it when the player chose to leave.

**Fix:**
- `routes.ts` → `matchAppPath()` derives **every** screen (town, arcade, room, offline modes, games, 404) from `window.location.pathname`; `App` keys each screen (`screenKey`) so leaving unmounts everything the old screen owned (timers, listeners, overlays).
- `goTo()` still calls the original `navigate()`; if the URL didn't change synchronously it applies it with `history.pushState` and dispatches `popstate`, so the URL always matches the screen.
- Both game pages: an `exiting` flag is set with `flushSync` **before** navigating; `VictoryOverlay open={!exiting && …}`. Online leave uses `try/finally`, so navigation happens even if the leave request fails.
- Play again, Change appearance, View the board (minimize), rematch votes, scores and room lifecycle code are unchanged.
- The route-change curtain animates opacity only (no transforms), so it never changes the containing block of fixed overlays.

## 2. New files
`src/pawville/games/**` (engines), `src/pawville/pages/{PawType,Battleship,MemoryPaws,WhackACat,PuzzleGarden}Page.tsx`, `src/pawville/components/{GameShell,ResultPanel,PixelCat,GameMark}.tsx`, `src/pawville/sound.ts`, `src/pawville/styles/{pawville-tokens,games}.css`, tests `pawvilleGames/Battleship/MemoryWhack/Puzzles.test.ts`.

## 3. Changed files
`src/App.tsx`, `src/main.tsx`, `src/pages/{HomePage,GameRoomPage,OfflineGamePage}.tsx`, all Milestone 1 `src/pawville/*` files (re-delivered, with routing/navigation changes, all games marked playable, booth sprite now open, townsfolk cat palettes), `ComingSoonPage.tsx` (now an unused generic page so stale copies still compile), `package.json` (version 2.0.0 + `verify:files`), `README.md`, `scripts/verify-pawville-files.mjs`. No dependency changes, no database changes.

## 4. Verification actually performed (sandbox: no npm registry, no browser, no Supabase)

| Check | Result |
|---|---|
| `node --test --experimental-strip-types "tests/pawville*.test.ts"` — 55 tests (movement, interaction, presence wiring, routes, PawType, Battleship incl. AI and hidden-board separation, Memory, Whack-a-Cat, Puzzle solutions/uniqueness/daily) | ✅ 55 passed, 0 failed |
| `tsc --noEmit` (strict, noUnused*) over all new/changed files | ✅ passed — **against hand-written type stubs** for React and for the original modules I couldn't read |
| Server-side render of `App` for `/`, `/arcade`, `/play/computer` (with overlay open), back to `/` (overlay gone), `/room/:id`, all five `/games/*`, `/games/nope`, plus all 8 pattern, 1 flower-bed and 3 nap-spot views and the shared ResultPanel | ✅ passed (runtime stubs for the original modules) |
| `goTo()` with a router that ignores unknown paths | ✅ URL and screen still change |
| Town render (skia-canvas) | ✅ visually checked; `docs/pawville-town-preview.png` |

## 5. Not verified here — please run
1. `npm install && npm run verify:files && npm test && npm run build` on your machine (real React/Vite types, your original modules and original tests).
2. Browser journey (no browser was available in my sandbox):
   - [ ] Town → Arcade → vs Computer → finish → **Back to Pawville**: town shows, no overlay, URL `/`.
   - [ ] Play again → finish → **Back to lobby**: lobby shows, no overlay, URL `/arcade`. Repeat twice.
   - [ ] Online room (Supabase): finish → Back to lobby (leaves room) and Back to Pawville (keeps room; Rejoin works).
   - [ ] PawType: each mode; typing blocked before Go; wrong char stops the cat; finish → results → town.
   - [ ] Battleship: place manually + rotate + random; win and lose vs each level.
   - [ ] Memory Paws: all three sizes; pause; restart.
   - [ ] Whack-a-Cat: keyboard + touch; round ends at 0.0; PB banner.
   - [ ] Puzzle Garden: one of each type, hints, daily; refresh → solved state and bests persist.
   - [ ] Phone portrait/landscape, tablet, 1366×768 and 1920×1080: no horizontal scroll; Battleship board toggle on narrow screens.
3. Live multiplayer (town presence, online Paw vs Paw) is **not** verified by these tests; the presence test uses an in-memory channel.

## 6. Known limitations
- PawType Pass & Play and Battleship are local/AI only; online races and friend battles are future work (the engines are pure and ready to be driven by a server).
- Records are per device (localStorage).
- Lint: the project has no ESLint config in the files I could see, so no lint step was run.
