# Pawville — Milestone 8.1: World repair, visual polish & a working telescope

Overlay on top of Milestone 8. Copy into the project folder (allow overwrite). No new dependencies. No save-schema change: old saves load as before. Telescope discoveries use the existing adventure journal and world-save `claims`.

## How the game is built (as inspected)
React 19 + TypeScript + Vite. The game is a hand-written Canvas2D renderer (`render/townRenderer.ts`, `render/regionRenderer.ts`) driven by a requestAnimationFrame loop in `components/TownCanvas.tsx`. Sprites are drawn procedurally from pixel rectangles (`render/*Art.ts`, `render/catSprites.ts`) and cached. Regions are `RegionDef`s (16px tile grid, props with feet-anchored colliders, interaction spots) in `adventure/regions.ts` and `city/*.ts`. Interactions are routed through `AdventureLayer.useSpot`. Multiplayer uses Supabase Realtime: a town Presence + Broadcast channel (`net/townPresence.ts`) and a private pair channel (`couple/*`).

## Bugs reproduced → root cause → fix
| # | Bug | Root cause (from source) | Fix | Status |
|---|---|---|---|---|
| 1 | Sitting text clipped at the left edge | `.pv-sitbar` reused `.pv-dock` (30px radius, `overflow:auto`) with **no padding**; `FishingSheet` had the same problem | New `PanelSheet` (padding ≥ corner inset, wraps long/unbroken words, scrolls past a max height, buttons wrap). Sitting and fishing use it. The interaction prompt and hint hide while a sheet is open | Fixed and tested (Chromium layout test) |
| 2 | Seated cat drawn under the bench/gazebo | `sitAt` put the cat at `spot.y − 13` = 1px **behind** the prop baseline, so the y-sort drew the bench over the cat | `world/seating.ts` resolves the actual seat prop: cat drawn in front, raised by the seat height measured from the sprite art. Café tables use the chair in front | Fixed and tested (unit) |
| 3 | Forest stream crossing was dirt over water | The bridge was written first, then overwritten by the path `rect` | `groundBuilder.road()`: becomes planks wherever it crosses water | Fixed and tested |
| 4 | Park pond path was dirt over water | Pond paths painted after the pond | Same `road()` fix: the pond now has a plank cross-bridge | Fixed and tested |
| 5 | Café Lane ran behind both cafés | Road rows overlapped the café sprites | Lane starts east of The Purring Cup | Fixed and tested |
| 6 | Arcade Row ran under the arcade | Road columns 54–55 overlapped the arcade sprite | Moved to columns 55–56, between the arcade and the cinema | Fixed and tested |
| 7 | Photo booth and vending machine stood in the street | Hand-placed coordinates | Photo booth moved to the grass by the cinema; vending machine moved onto the station platform; both interaction points moved with them | Fixed and tested |
| 8 | Linden Row (park) ran behind the apartments | Road at rows 4–5 behind the buildings | Moved to rows 9–10, in front of the doors | Fixed and tested |
| 9 | Lighthouse path ran under the tower; two isle lanterns stood on the void | Coordinates | Path ends at the door; lanterns moved onto the islands | Fixed and tested |
| 10 | Walking looked like sliding | Walk phase `[0, 1, 0, −1]`: frames 0 and 2 were pixel-identical and legs moved 1px | 4-frame gait: stride → passing → opposite stride → passing, far-side legs shaded. All 7 characters, all directions | Fixed and tested (pixel test) |
| 11 | Cat jittered 1px while walking | Cat and camera rounded independently while the camera eased | `snapCamera` rounds the cat→camera offset once | Fixed and tested (unit) |
| 12 | Night too dark; lamp halos huge | Multiply by near-black `#1b1840` at up to 85%, plus a strong vignette; 38px additive halos | Plum `#4a3f7a` grade capped at 70%, lighter vignette, compact halos with ground light pools (`render/lighting.ts`), in the town and all regions | Fixed, unit tested; not seen in-game |
| 13 | One-time pickups could be claimed twice with a quick double E | The "used" flag only took effect after the next render | Synchronous `claimOnce` guard (collectables and consumable spots) | Fixed, unit tested |
| 14 | Two quick taps on "Reel in" could catch two fish | `reel()` checked stale React state | Live-phase ref guard | Fixed; not tested in a browser |
| 15 | "Reconnecting" after being online a while | Supabase allows **5 Presence calls per client per 30 s** and closes the channel when exceeded. The town presence called `track()` up to every 1.5 s whenever the cat stopped. Pair positions were also sent 10×/s even when standing still | Track budget (≤4 per 30 s plus the re-announce on subscribe, coalesced so the latest state is always delivered). Pair positions are sent only on change, plus a 4 s heartbeat (the partner timeout is 8 s) | Fixed, unit tested; **not verified on two live devices** |

## Telescope: fixed and tested (model + renderer); not played in a browser
- **Where:** the Paw Park telescope (new spot), the boardwalk telescope (city) and the rooftop telescope.
- **Viewing:** a full-screen eyepiece with an opening transition. Movement pauses while it's open and resumes on exit (Esc / Exit; map/journal shortcuts are blocked meanwhile).
- **Controls:** aim by dragging (mouse/touch), arrows/WASD or the on-screen pad. Zoom ×1–×4 with the wheel, +/− keys or buttons.
- **Sky:** follows the game's darkness and weather, the real moon phase (computed from the date) and quest flags. Lumi's constellation only appears after her quest, the lighthouse beam only after it's lit, and the clock reads eleven until it's fixed. Each site has its own horizon.
- **14 discoverable objects:** moon, North Paw, 3 constellations, a planet (×2), a comet (×3 only), a nebula (×4 only), scheduled shooting stars, and landmarks.
- **Discovering:** the object must stay in the reticle for 0.6 s. Each discovery goes to the journal ("Sky" entries), pays 1 paw token once (claim-guarded), persists through the existing save, and notifies your partner over the pair channel ("Your partner spotted …").

## Interaction audit
`npm run audit:interactions`: all 195 spots in 14 regions have a working handler path. These are static checks; I did not click through them in a running game.

## Map audit
`npm run audit:map` checks every explorable region for roads under buildings, paths over water, props on streets or the void, unreachable or blocked spots, and solid spawns.
- **Original Milestone 8 code:** 33 issues.
- **Now:** 0 issues.
- **Not audited:** the Pawville town map uses a separate map system (`world/townMap.ts`) and is covered only by the existing tests.

## Tests and checks run
| Check | Result |
|---|---|
| `npm test` (Node test runner) | **190 / 190 pass** (174 original + 16 new in `tests/pawvilleM81.test.ts`) |
| TypeScript (`tsc`, with stand-in React/Supabase types because the real packages couldn't be installed) | Same 74 stand-in errors before and after → **0 new type errors** |
| Chromium layout test (`npm run test:ui`, real CSS, 7 viewports 320×568 → 1920×1080, short/long/unbroken text) | **8.1 sheet 28/28 pass**; the old Milestone 8 markup fails 28/28 (bug reproduced) |
| Telescope renderer, rendered with skia-canvas | 7 views rendered and inspected (`docs/milestone-8.1/telescope-views.png`) |
| Region maps, rendered with the software rasterizer | Park, forest, city, harbor and isles inspected before and after |

## Not done / not verified (honest list)
- **`npm run build`:** not run (no package registry in this environment). Run it first.
- **The game in a browser:** not run end to end (no bundler available). No in-game screenshots, no console-error check, no frame-rate measurement.
- **Two-device multiplayer:** not tested.
- **Art overhaul:** **partially done.** Gait, lighting and layout are improved. Buildings, interiors, furniture, the home and the Ferris wheel art were **not** redrawn this milestone.
- **Signature emotes:** unchanged (the existing emote system was not modified).
- **Fonts in the layout test:** Chromium used fallback fonts (the bundled Fredoka/Nunito come from npm and weren't installed). The layout wraps, so it can't overflow, but re-check visually after the build.

## Run
```bash
npm install
npm test
npm run audit:map
npm run audit:interactions
npm run build
npm run dev
````
