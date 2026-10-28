# Pawville — Milestone 6: World expansion, quests, Racon, installable apps

This release extends the existing Pawville. Nothing was removed: Paw vs Paw, PawType, Cat Boxing, Battleship, Memory Paws, Whack-a-Cat, Puzzle Garden, Paw Snap, the couple features, homes, the scrapbook and photo mode all still work. All 150 original tests still pass.

## What's new

**Characters**
- **Racon**, a raccoon (not a cat). He's a selectable character with his own pixel sprites (mask, ringed tail, raccoon ears) and a vector portrait. His exclusive emote is the **Fence Dance**: he stands up, crosses his forearms over and over in time, sways left and right with his head bobbing and his tail counter-swaying, then finishes with a "ta-da" pose and goes back to idle. The YouTube reference couldn't be opened from the build environment, so the choreography follows the written description in the brief.
- **Signature emotes**, each locked to one character ID (a nickname never grants one):
  - Magic: Long Stretch
  - Chutki: Upside-Down Nap
  - Puchu: Loud Purr (synthesised, soft, silent when sound is off)
  - Tangerine: Curious Tilt
  - Midnight: Playful Pounce
  - Mini: Starpaw Serenade (kept)

  Every emote has a reduced-motion version and always returns to idle.

**World**
New regions, built on a shared scene system (movement, collision, camera, presence, emotes and photo mode are the same code in every region):

| Region | How it opens |
|---|---|
| Whiskerwood Village (the original town) | Always open; adds Mabel, the pier, the bramble gate and a cable-car stop |
| Pawport Harbor | The Lost Navigation Chart: mend Marlow's chart, gather driftwood, fetch the toolbox, repair the pier, then sail over |
| Whisperwood Forest + Waterfall Cave | The Lost Star: glowing pawprints at the south gate |
| Frostbell Highlands | The Vanishing Trail: find the map in a bottle for Juniper |
| The Dreaming Isles | Finish The Lost Star: the observatory telescope opens a star bridge |

**Quests and progress**
- A reusable, data-driven quest engine (`src/pawville/adventure/engine.ts`). It supports prerequisites, ordered objectives, counted and unique objectives, start events, rewards and follow-up quests. Rewards are granted only once.
- 11 quests:
  - The Lost Navigation Chart
  - The Lighthouse Mystery (lens puzzle)
  - The Lost Star (signature adventure: trail, letter, compass, waterfall cave, two-plate co-op door, Lumi, constellation puzzle, observatory)
  - The Missing Kitten
  - The Vanishing Trail
  - The Forgotten Cable Car
  - A Constellation for Two (co-op pedestals)
  - Shells of Pawport
  - A Clean Beach
  - The Two-Paw Symbols (a hidden quest that seeds the unfinished Two-Paw Temple mystery)
  - Bramble the Stray
- **Discovery journal (J):** quests with fair hints, clues and letters, discoveries, and key items. Quest-critical items can't be lost.
- **World map (M):** fog of war, locked regions with clear unlock requirements, routes, a quest marker per region, and travel to places you've already visited.
- **Co-op puzzles:** both plates (or pedestals) must be pressed at once, by two cats or by one cat plus a carried stone (the solo option). The stone always returns to your bag.
- **Regional activities:** fishing (catch depends on place, time and weather, and a miss costs nothing), shell collecting, beach clean-up, bottle messages, sledding, Aurora Point at night, the stream fox and moon moths.
- **Restoration you can see:** the mended pier and Marlow's boat, the lit lighthouse and its beam, open stalls and bunting, Lumi's constellation in the night sky, and Pip and Bramble moving into town.
- **NPCs:** Mabel, Captain Marlow, Finn, Coral, Pip, Juniper, Bramble and Lumi. Their dialogue is chosen from the current world state, so they react to what you've done.
- **Rewards:** new items (herring, lanternfish, sea glass, glowing mushroom, pine cone, frost crystal, moon pearl, star shard), 7 achievements, 2 wardrobe extras (captain's hat, star charm) and scrapbook memories.

**Multiplayer**
- The presence protocol is now **v4** and adds `region`, so you only see cats in the same place. v2 and v3 clients are still understood (they're treated as being in the town). A cat that changes region jumps rather than gliding across maps.
- **Shared world flags** (region unlocks and restorations) travel over the private couple channel and are merged as a whitelisted set union. That makes them idempotent and safe against duplicate or out-of-order messages, and they can't undo progress. If your partner finishes a step, it completes for you too, so neither of you gets stuck.
- Quest steps, the journal and key items are **personal**.

**Installable**
- **PWA:** `public/manifest.webmanifest`, icons, and `public/sw.js`.
  - Pages are network-first (new deploys show up straight away); hashed assets are cache-first.
  - Supabase and every other cross-origin request is never cached.
  - Updates wait until the player taps "update", and there's an offline fallback for the app shell.
  - `netlify.toml` and `vercel.json` set `no-cache` on `sw.js` and the manifest.
- **Android:** Capacitor (`capacitor.config.json`, plus npm scripts).
- **Desktop:** Electron (`desktop/`). It serves the same build from a private `app://` origin, opens external links in the system browser, and keeps Node.js out of the page. There's an NSIS Windows installer target, plus macOS and Linux targets.

## Run and build

```bash
npm install                    # also updates package-lock.json for the new Capacitor deps; commit it
cp .env.example .env.local     # VITE_SUPABASE_URL + VITE_SUPABASE_PUBLISHABLE_KEY (public keys only)
npm run dev                    # http://localhost:5173
npm test                       # 157 unit tests
npm run build                  # → dist/
```

No new Supabase tables or migrations are needed. Deploy `dist/` exactly as before (Netlify or Vercel).

## Phone

**Install the PWA**
- **Android Chrome:** open the HTTPS site, then use the menu → *Install app*.
- **iPhone Safari:** Share → *Add to Home Screen*.

**Build a debug APK** (needs Android Studio / the Android SDK and JDK 17)

```bash
npm install
npx cap add android      # first time only; creates android/
npm run android:apk      # build + sync + gradlew assembleDebug
# APK: android/app/build/outputs/apk/debug/app-debug.apk
