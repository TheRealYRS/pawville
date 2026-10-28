# Pawville Milestone 4: visual polish, characters, emotes, photo mode, furnished home

## 0. Source, baseline and checkpoint

- **Source used:** your ContextForge package (`PROJECT_CONTENTS.md`, generated 2026-10-23 16:22 UTC from `paw-vs-paw-main`). I rebuilt all 168 text files from it and checked every one against the SHA-256 in `PACKAGE_MANIFEST.json`: **168 of 168 matched exactly**, so no file was reconstructed or guessed.
- **Not in the package:** `package-lock.json`, `public/favicon.svg` and the three `docs/*.png` images. None of these were changed; your copies stay as they are.
- **Checkpoint:** I kept an untouched copy of the rebuilt baseline separately. Your folder is unchanged until you copy this overlay over it. **Back up your project folder first.**
- **Baseline before any change:** `npm test` → **109 tests, 109 passed, 0 failed**.

## 1. Results after the changes (what actually ran)

| Check | Result |
|---|---|
| `node --test --experimental-strip-types "tests/*.test.ts"` (same command as `npm test`) | **136 tests, 136 passed, 0 failed.** That is the 109 original tests plus 27 new ones; all original tests still pass. |
| Type check (`tsc --noEmit`, strict, same compiler options as your tsconfig) | **No errors in any new or changed file.** Caveat: no npm registry was available, so React and Supabase types were hand-written stand-ins. The only 5 reported errors are in **unchanged** files (`lib/multiplayerService.ts`, `lib/roomService.ts`). They come from the Supabase stand-in typing callbacks as `any` and do **not** appear with the real `@supabase/supabase-js` types. |
| Server-side render of the real `App` and the new components (React 19) | `/`, `/arcade`, `/home`, `/scrapbook`, `/play/computer` and `/games/pawtype` render without errors. Also checked: PhotoMode (Mini vs Puchu), EmoteMenu (signature row, tooltips, waiting state), QuickEmotes, Wardrobe (six characters) and HomeRoom. |
| Headless canvas renders (skia-canvas) of sprites, emotes, the room, the furniture catalogue and a composed photo | Inspected visually during development. |
| `npm run build` (real `tsc` + Vite) | **Not run.** Vite and the real React types could not be installed here. **Please run it.** |
| Browser testing | **Not possible here** (no browser could be installed). See the checklist in section 8. |
| Live multiplayer between two sessions | **Not tested.** No Supabase credentials or browser were available. Covered by unit tests and an in-memory transport only. |

## 2. Files changed (overlay) and why

**New**
- `src/pawville/render/emoteAnim.ts`: one timeline per emote, deterministic in time, with a bounded particle list, Starpaw Serenade and a single "finished = idle" rule.
- `src/pawville/home/homeArt.ts`: the furnished-room renderer and 37 illustrated furniture pieces.
- `src/pawville/home/homeWalk.ts`: home collisions, pathfinding and contextual furniture actions.
- `src/pawville/memories/photoFraming.ts`: photo framings and the camera shift that keeps the cat clear of the controls.
- `src/pawville/memories/photoCompose.ts`: filters, vignette, frames (including the "Starry" Magic Moment frame) and captions, applied to the **captured** scene only.
- `src/pawville/components/EmoteIcon.tsx`: one SVG icon set for emotes, with no emoji.
- `src/pawville/components/HomeRoom.tsx`: the canvas room, an accessible grid of hit areas, walking, interactions and catalogue thumbnails.
- `tests/pawvilleCharacters.test.ts`, `tests/pawvilleEmotes.test.ts`, `tests/pawvilleBenches.test.ts` and `tests/pawvillePhotoHome.test.ts`.

**Changed**
- `appearance.ts`: Puchu, Chutki, Mini and Magic, with marking definitions shared by every renderer; the `CHARACTERS` registry; `ALL_COATS`; and `normalizeCoat`. `COATS` (the 8 palettes) is unchanged.
- `render/catSprites.ts`: markings; expressions (eyes, ears, cheeks); raised, waving and forward paws; whiskers; running; a breathing highlight; and a safe fallback for unknown ids.
- `render/townRenderer.ts`: the per-cat plan (emotes, idle blinks and ear twitches), a two-tone shadow, an effects pass after the day/night grade, an eye glint at night, falling leaves, nodding flowers, harbour ripples and reflections, rain ripples in puddles, and an interaction ring.
- `render/townArt.ts`: layered ambient occlusion where buildings meet the ground.
- `world/townMap.ts`: the `BENCHES` registry. Props, interactions and seats are all derived from it, which adds the previously decorative park bench as `bench-4`.
- `components/ActivityDock.tsx`: bench seats come from the registry.
- `couple/emotes.ts`: the catalogue (15 required emotes plus the Mini exclusive) with tips, icons, groups, exclusivity checks, a spam limiter and the quick bar.
- `net/presenceProtocol.ts`: protocol **v3**. Adds the new appearance ids, `emoteAge` and `emoteSeq`, `run`, explicit version handling, exclusivity validation, protection against stale replays and a receive-side spam guard.
- `usePlazaPresence.ts`: sends the new fields.
- `components/TownCanvas.tsx`: emote state for local, remote and partner cats; the photo camera shift; capture with framings and background blur.
- `components/PhotoMode.tsx`: redesigned (see section 4).
- `components/TownMenus.tsx`: new emote menu and quick-emote bar.
- `pages/TownPage.tsx`: emote sequence numbers, the limiter, exclusivity checks, validated partner emote messages, photo pose looping and camera bias, and quick favourites.
- `components/Wardrobe.tsx`: a character selector with sprite, name, markings, eye colour and description.
- `home/decor.ts`: 16 new pieces, groups and actions; curtains may hang over windows. Existing ids are unchanged.
- `pages/CoupleHomePage.tsx`: uses `HomeRoom`, a grouped catalogue with illustrated thumbnails, and the wardrobe action.
- `styles/world.css`: photo-mode layout, emote UI, room scene and character cards.
- `src/components/CatCharacter.tsx`: **additive only**. Markings are drawn when a named coat is passed. Without a coat (as in every Paw vs Paw screen) the output is identical to before.
- `tests/pawvillePresence.test.ts`: the snapshot helper gains the three new v3 fields. No assertion was changed.

**Not touched:** `src/game/*`, `src/hooks/*`, `src/lib/*`, `src/pages/*`, `router.ts`, `App.tsx`, all Paw vs Paw components except the additive `CatCharacter` change, `supabase/migrations/*` (**no new migration**), and `package.json` (no new dependencies).

## 3. Characters

| Id | Look | How to tell them apart |
|---|---|---|
| `puchu` | White, small scattered orange dots, honey eyes | Dots on the cheeks, body and back, plus one dot on the tail |
| `chutki` | White, small orange dots, leaf-green eyes | **Orange heart on the forehead**, **orange tail tip**, fewer dots placed differently |
| `mini` | Grey (light and dark variations), **emerald eyes** (#2EE86A) | Eyes are re-lit after the night grade so they never disappear |
| `magic` | Warm brown, darker back markings, **white tummy and chest**, brown eyes | The tummy shows when standing facing forward and when sitting; there is a white chest blaze in the vector art |

- **One definition everywhere:** the town sprite, `PixelCat`, `CatCharacter` (vector art), the wardrobe, the home, photos and presence all read the same `COAT_INFO` entry.
- **Identity vs nickname:** the character id is stored as the appearance `coat`. Nicknames are separate.
- **Paw vs Paw:** the seat stays `T`/`M` and the accessory whitelist is unchanged (tested).

## 4. Photo mode

- **Layout:**
  - Desktop (≥ 900 px wide, landscape): a 360 px side panel.
  - Smaller screens: a bottom sheet that can be collapsed with a "Hide controls" button.
  - The live camera shifts so your cat sits in the middle of the **uncovered** area and stops clamping at the edge of the world.
  - A test checks 1920×1080, 1366×768 and 390×844: neither the cat's feet nor its face is ever under the panel.
- **Live preview:** a canvas in the panel shows the exact final photo (framing, filter, frame and caption). It refreshes about 4 times per second so animated poses can be timed (1.25 per second with reduced motion).
- **Framings:** close-up, medium, wide, couple (always fits both cats, and warns if your partner isn't there) and scene (cat in the lower third).
- **Options:**
  - Filters: Natural, Warm, Dusk, Film and Mono, toned down so coat colours stay recognisable.
  - Frames: Polaroid, Plain and **Starry** (the Magic Moment frame).
  - Toggles: soft vignette, simulated background blur (only where the browser supports canvas filters), date on the frame, name tags.
  - Caption, and a capture timer (now, 1 s or 3 s).
  - Poses: every solo emote, including Starpaw Serenade for Mini. Poses loop while photo mode is open.
  - Couple poses: shown only while a consented shared emote is running.
- **Capture:**
  - The photo is rendered offscreen from the game scene, so no DOM, controls or cursor can end up in it.
  - Composition is applied to the captured canvas, and a test asserts nothing but the scene is drawn into it.
  - Everything is drawn locally (no external images), so canvases stay origin-clean.
  - Size is capped (1280 px when captured, 960 px in the existing scrapbook store).
  - Encode and save failures show a message and keep the photo so you can try again.
- **Closing** clears the pose and camera shift and restores normal controls.

## 5. Emotes and multiplayer

- **Emotes:** all 15 required emotes animate the cat itself (paw, eyes, ears, cheeks, sway, bounce, pose), and the effects are drawn as pixel art. Every timeline ends at its duration, and "finished" always means idle, so cats can't get stuck.
- **Emote menu:**
  - Consistent SVG icons, tooltips, clear hover and selected states, and visible focus outlines.
  - A **Signature** row with a "MINI EXCLUSIVE" badge.
  - A pulsing "Waiting for your partner…" state.
  - ★ favourites for a quick bar that replaces the old "Emotes" text button. A ⋯ button opens the full menu.
- **Starpaw Serenade (`mini-starpaw-serenade`, 3.8 s):** intro glow and sparkles → left-right-left paw wave ×2 with body sway, tail in time, glowing eyes and a green-gold paw-print trail → blink, paw flick, heart-shaped constellation and emerald flash → paw lowered with a proud smile → idle.
  - Reduced motion: no sway or trail, at most 6 particles, eyes still glow.
  - Exclusivity is checked by character id when choosing it, when sending it, in the presence sanitiser and in pair messages. A Puchu named "Mini" gets an ordinary wave (tested).
- **Protocol v3:**
  - Emotes travel as `{ emote id, emoteAge, emoteSeq }`, and each client renders the animation locally from the same start point.
  - Presence metadata never starts an emote, and an emote whose age is past its duration is dropped, so reconnects don't replay old emotes.
  - Rate limits apply on both send and receive.
  - v2 payloads are accepted; versions newer than v3 are rejected rather than misread.
  - Old v2 clients show unknown characters as their default coat.
- **Couple interactions** (hug, high-five, paw bump, nose boop, sit together) use the existing consent coordinator: invite → accept or decline → start, with cancel and disconnect cleanup. Shared emotes face and lean toward the partner.
- **Honesty about authority:** presence and pair messages are client-authoritative. Validation protects rendering; it is not a security boundary. Shared emotes only work between the two members of a pair (private pair channel), not with strangers in the plaza.

## 6. Benches and home

- **Benches:**
  - All 5 bench props now come from one `BENCHES` list. `bench-0` to `bench-3` keep their ids; `bench-4` is the park bench, which was previously not sittable.
  - A test enumerates every bench prop and checks that each has exactly one interaction, that its standing spot is free and reachable from spawn (flood fill), that the prompt appears there, and that its seats sit on the bench.
  - Bench interaction points don't overlap any other interaction.
  - The seated pose survives sanitisation, so other players see you sitting.
- **Home:**
  - **Room:** a slightly elevated, top-down room drawn on canvas: floorboards, wall pattern, wainscot, rails, baseboard with ambient occlusion, a side wall with a panelled door and doormat, light pools from windows and lamps, and a night tint.
  - **Furniture:** 37 illustrated pieces with outlines, legs and shadows. Every catalogue id has art (tested).
  - **Walking:** tap a tile or use the arrow keys / WASD while the room is focused. Floor furniture is solid; rugs and wall items are not.
  - **Using furniture:** tap a piece, or press Enter/E on it.

    | Furniture | What the cat does |
    |---|---|
    | Bed | Sleeps |
    | Sofa or armchair | Sits |
    | Cat bed | Rests |
    | Cat tree or climbing shelves | Climbs |
    | Window perch | Sits facing the window |
    | Box or tunnel | Hides (head peeking out) |
    | Scratching post | Scratches |
    | Toys or plushies | Plays |
    | Bowls | Eats |
    | Photos, painting or books | Takes a closer look, with a memory count |
    | Wardrobe | Doors open and the Wardrobe opens |
    | Desk | Sits at the desk |

    "Get up" ends the action.
  - **Decorating:** catalogue grouped as Furniture, Cozy decor and For cats; a ghost preview with a green/red overlay; move, rotate and put away; save and cancel; ownership rules unchanged.
  - **Saves:** existing Milestone 3 saves load unchanged (tested).

## 7. Backend: what is and isn't shared

- **No new migration.** Nothing in this milestone needs one: characters and emotes travel in the existing realtime messages.
- **Room layout is per device** (localStorage), and the page says so. A genuinely shared home would need:
  - a `pawville_homes` table keyed by `pair_id`, with RLS so only the two members can read it;
  - an RPC that updates items optimistically by `uid` and `version`, so conflicting edits are rejected rather than overwritten;
  - the existing per-piece `placedBy` ownership enforced server-side.

  This is designed but **not implemented**.
- "Sit together" in the home with a live partner is **not** implemented, because the home has no live presence. Sit together works in town as a consented shared emote.

## 8. Commands and manual test checklist

```bash
npm install
npm test            # expect 136 passed
npm run build       # please report any output
npm run dev
````
