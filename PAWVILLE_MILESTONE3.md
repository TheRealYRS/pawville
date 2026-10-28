# Pawville Milestone 3: changes, verification and known limits

## 0. Baseline and source recovery (read this first)

- **Workspace:** my working sandbox had been reset. The Milestone 2 code was rebuilt **verbatim from my own Milestone 2 deliverable**, recorded in this conversation, and then extended. It is not a reconstruction of your original files.
- **Original Paw vs Paw sources I could read from OneDrive this time:** `VictoryOverlay.tsx`, `CatCharacter.tsx`, `CustomizeModal.tsx`, `designTokens.css` and the presence SQL migration. Uploaded root files included `package.json`, `tsconfig.json`, the README and `.env.example`. Your `.env.local` was uploaded too. I only read the variable **names** and did not copy it into the package.
- **Still not readable:** OneDrive serves `.ts` files as video, so I could not read `router.ts`, `lib/*.ts`, `game/*.ts`, `hooks/*.ts` or the original tests. Code that touches them uses only the APIs the existing pages already use. The export name of the Supabase client is resolved at runtime (see `net/backend.ts`); if it isn't found, online features say so instead of faking success.
- **Checkpoint:** before this milestone, the uploaded root files were copied untouched to a separate baseline folder in my sandbox. Your project on disk is untouched until you copy this overlay over it. **Make a backup copy of your project folder first.**

## 1. Victory overlay (checked against the real component)

`VictoryOverlay.tsx` (read this time) is a plain component with no portal. It renders whenever its `open` prop is true. That confirms the Milestone 2 diagnosis: the overlay stayed because the page that owned it stayed mounted. The fix is unchanged from Milestone 2:
- one URL-derived route table, with a keyed screen per route;
- an `exiting` flag set with `flushSync` before navigating;
- `try/finally` around the online leave request.

## 2. What's new

| Area | Status |
|---|---|
| Park: swing, seesaw, picnic meadow, stargazing hill, shared garden, pond, photo arch; Ring; Home; new objects | ✅ Implemented; all spots proven reachable by a flood-fill test |
| Weather (7 states, cross-fades, puddles, snow cover + pawprints, wind leaves, fog), day/night with lit lamps and fireflies, shared schedule | ✅ Implemented and tested; rendered previews in `docs/` |
| 8 coat palettes, 5 Pawville extras (2 unlocked by play), wardrobe with live preview, reset, save and cancel | ✅ (`CatCharacter` has an optional `coat`; without it, rendering is identical to before) |
| Couple pairing: invite code/link, accept, decline, cancel, expiry, rejoin, leave with confirmation, one pair per user, no seat stealing | ✅ Client + SQL written; ⚠️ **SQL not run against a live database** |
| Shared-activity coordinator: invite, ready, start, cancel, disconnect grace, rejoin, rematch, duplicate-start prevention | ✅ Implemented; unit tested with two coordinators wired together |
| Paw-holding (consent, coordinated pace, either can release, auto-release on separation), 11 emotes (4 shared and consent-based) | ✅ Implemented; pure logic tested; ⚠️ not tried in a browser |
| Swing (pumping, synced pair swinging), seesaw (hop, synced), benches, picnic (blankets, snacks, offer to partner, umbrella in rain), stargazing (constellations, deterministic shooting stars, wish), fishing (bite timing, 8 fish), garden (planting, spaced growth, joint watering, ownership) | ✅ Implemented; rules tested |
| Photo mode (captures the real rendered scene, framing, poses, filters, polaroid frame, caption), IndexedDB album (bounded), scrapbook (real events only; suggestions labelled) | ✅ Implemented; ⚠️ capture and IndexedDB need a real browser (not tested here) |
| Home decoration (placement preview, validity, rotate, move, remove, save and cancel, ownership), mailbox (server mail with a backend pair; local otherwise) | ✅ Implemented and tested; ⚠️ home layout is per device |
| PawType simplified (lowercase phrase bank in 6 categories, 15 s / 30 s / race, pace cat, couple duel with shared seed and start, plausibility check) | ✅ Implemented and tested |
| Cat Boxing (fixed-step engine, 5 moves, AI on 3 levels, practice, couple match with the inviter's device as host, forfeit on disconnect, keyboard and touch) | ✅ Implemented and tested; ⚠️ couple mode is not server-authoritative |
| Paw Snap (new lightweight two-player game), Memory Paws 2-player | ✅ Implemented and tested |
| Optional ambient audio (rain, wind, water, birds, insects; Web Audio, off by default), low-power mode | ✅ Implemented; ⚠️ not listened to in a browser |
| Online Battleship, shared home layout across devices, server-validated competitive results | ❌ Not built: each needs a server referee or a new table (see §5) |

## 3. Files

**New:** everything under `src/pawville/` that didn't exist in Milestone 2:
- `couple/*`, `activities/park.ts`, `home/*`, `memories/photoStore.ts`;
- `games/boxing`, `games/reflex`, `games/pawtype/phrases.ts`;
- `world/environment.ts`, `persistence.ts`, `appearance.ts`, `worldSave.ts`, `useEnvironment.ts`, `useWorldSave.ts`, `ambience.ts`, `net/backend.ts`;
- components `ActivityDock`, `SessionBar`, `CouplePanel`, `Wardrobe`, `PhotoMode`, `ConfirmDialog`, `TownMenus` (new panels);
- pages `BoxingPage`, `PawSnapPage`, `CoupleHomePage`, `ScrapbookPage`, `PairInvitePage`;
- `styles/world.css`;
- the migration `supabase/migrations/20261024000001_pawville_pairs.sql`;
- tests `pawvilleEnvironment`, `pawvillePersistence`, `pawvilleCouple`, `pawvillePark`, `pawvilleBoxing`, `pawvilleHome`.

**Changed original Paw vs Paw files:**
- `src/components/CatCharacter.tsx`: optional `coat` prop only;
- `src/App.tsx`, `src/main.tsx`;
- `src/pages/HomePage.tsx`, `GameRoomPage.tsx`, `OfflineGamePage.tsx`: same as Milestone 2;
- `package.json`: version 3.0.0 and `verify:files`. The lockfile is unchanged and there are no new dependencies.

**Changed Milestone 2 files:** the town map, renderer, sprites, presence protocol (v2 with coat, pose and emote), routes, the destinations registry, all game pages, and the M2 tests with the same names (updated so old copies don't fail). `src/pawville/games/pawtype/passages.ts` from Milestone 2 is no longer used and can be deleted.

## 4. Verification actually performed here

No npm registry, browser or Supabase was available in my environment.

| Check | Result |
|---|---|
| `node --test --experimental-strip-types "tests/pawville*.test.ts"`: 80 tests across 14 files | ✅ **80 passed, 0 failed** |
| `tsc --noEmit` (strict, noUnused*) over every new and changed file | ✅ Passed, but against **hand-written stubs** for React and the original modules I couldn't read. Your `npm run build` is the real check. |
| Server-side render of the whole `App` (stubbed originals) for `/`, `/arcade`, `/play/computer` (overlay open), back to `/` (overlay gone), `/room/:id`, all 7 game routes, `/home`, `/scrapbook`, `/pair/:code`, plus all 26 activity and object docks, Wardrobe, Couple panel, Sky & sound, Bag, Emotes, Map and Photo panels | ✅ All rendered without errors |
| Town renders (skia-canvas): map, park, 6 weather and time combinations | ✅ Checked visually; see `docs/pawville-map.png` and `docs/pawville-weather.png` |
| Relative imports | ✅ All resolve (`npm run verify:files`) |
| Browser, two-device multiplayer, SQL migration, IndexedDB, photo capture, audio | ❌ **Not run.** Mocks (an in-memory channel and BroadcastChannel) test the state logic only. They do not prove live multiplayer. |

## 5. Known limits and next steps

1. **Server referee for competitive modes:** move PawType results and Cat Boxing simulation into an Edge Function or RPCs, and add online Battleship with hidden boards stored server-side.
2. **Shared home and garden tables:** add `pawville_home` and `pawville_garden` with per-piece `placed_by` and RLS. The client already uses ownership-aware, idempotent operations, so it can switch over.
3. **Weather:** shared by deterministic schedule (same UTC slot gives the same weather). A server clock isn't needed for this; device clocks that are far off will disagree.
4. **Presence fallback:** if the Supabase client export can't be resolved, presence uses a session-less client for the public plaza channel only. It never signs in, so it can't disturb the Paw vs Paw session.

## 6. Commands

```bash
npm install
npm run verify:files
npm test
npm run typecheck
npm run build
npm run dev
````
