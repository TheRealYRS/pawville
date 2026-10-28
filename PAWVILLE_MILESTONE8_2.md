# Pawville — Milestone 8.2: Arcade, cinema, karaoke & footsteps

Built on top of Milestone 8.1. No new dependencies. Old saves load unchanged (new data only adds records, claims and achievements).

## New
- **Cat Café Rush** (arcade cabinet, bottom row): serve cats their orders before they lose patience. 90 s, 3 hearts, tips for speed. Keys 1–4 / Q W E / X.
- **Fish Frenzy** (arcade cabinet, bottom row): move the hook between 4 lanes, snap fish, build combos, avoid boots. 60 s. Keys ↑ ↓ / Space, or tap.
- **The Bijou cinema** now plays real animated pixel-art films (1 token): *Whiskers at Sea* (always), *The Star Who Fell* (after The Lost Star), *Stopped at Eleven* (after the clock is fixed). Watching records a scrapbook memory.
- **Karaoke** at The Purring Cup (new stage by the counter): 3 original songs. Tap Space on each word; your cat sings it in its own voice. 1–3 stars.
- **Footsteps** that change with the ground (grass, dirt, stone, wood, sand, snow, water, carpet, roof), synced to the walk cycle. Follows the sound switch.
- 5 new achievements; the arcade score board shows the new records.

## Checks run
- `npm test`: **201/201 pass** (190 existing + 11 new in `tests/pawvilleM82.test.ts`).
- `npm run audit:map`: 0 issues. `npm run audit:interactions`: every spot has a handler.
- TypeScript: no new errors (only the 2 environment errors for missing `node`/`vite` type packages, same as before).
- Real Chromium: arcade, Café Rush (orders served), Fish Frenzy (fish caught), Bijou (film plays), karaoke (words graded) all ran with no page errors.

## Not done (still open)
- Animated train, home gardening beyond the herb planter, more walk-in shops, synced shared homes, redrawn original art.
- `npm run build`, two-device multiplayer, APK and Windows installer were not run here.
