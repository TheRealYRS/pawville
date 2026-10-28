# Milestone 10 report — batches 1–2

**Milestone 10 is NOT complete.** This delivery covers batch 1 (fixes and quick wins) and batch 2
(cats and characters). The full requirement-by-requirement status is in `MILESTONE10_PROGRESS.md`.

## What changed
### Fixes
- **Fountain benches face the fountain.** The two benches south of the fountain used the
  front-facing sprite, so cats sat with their backs to it. They now use a back-view sprite, you
  approach from the fountain side, and your cat faces the fountain. (`world/townMap.ts`,
  `render/townArt.ts`, `components/ActivityDock.tsx`)
- **Ducks stay in the water.** The park ducks were placed on the plank bridges that cross the
  pond, and their loops crossed the planks. Each duck now has its own quarter of the pond, chosen
  from the actual water tiles. They paddle in small loops, bob, and leave ripples.
  (`city/cityDistricts.ts`, `render/districtArt.ts`)
- **Dialogue no longer clips.** The dialogue box had no maximum height and no word wrapping. It
  now fits on any screen, its text scrolls inside the box, and the buttons stay visible.
  (`styles/adventure.css`)
- **No more facing flicker on diagonals.** Your cat no longer flips between side and front views
  when you move diagonally. (`world/movement.ts`)
- **No trees through the Ferris wheel.** (`city/cityRegion.ts`)
- **Branding:** the tab title, description and social preview now say Pawville, with the author
  set to "Yash Raj Sondhi" and a new paw favicon. (`index.html`, `public/favicon.svg`,
  `lib/share.ts`)

### New
- **Ferris wheel ride.** Board, then one slow revolution with the live city in view, then step
  out at the exit. Esc leaves at any time. It's free with no opening hours, and the first full
  ride saves a scrapbook memory. (`city/ferrisRide.ts`, `components/FerrisRideView.tsx`)
- **Home garden** (new **Garden** tab on the home page):
  - **Crops:** six beds and four crops (herbs, berries, carrots, catnip).
  - **Growing:** water a crop and it grows one stage after its growing time. Plants never wilt.
  - **Harvest:** crops go into your bag, and herbs and berries grow back.
  - **Decorations:** five decorations unlock as you harvest.
  - **Wildlife:** butterflies, bees, a bird at the birdbath, and fireflies at night.
  - **Green Thumb:** awarded on your first harvest, along with a scrapbook memory.
  - **Cooking:** new *Garden salad* recipe.
  - Files: `home/homeGarden.ts`, `render/gardenArt.ts`, `components/GardenPanel.tsx`.

### Cats and characters
- **Shading** on every cat: fur catches the light on top and falls into shadow below.
- **Back view redrawn:** a rounded head, a narrower neck and a tail that rises beside the body.
- **Loaf (sleeping) pose redrawn:** a head with ears, closed eyes, tucked paws and a curled tail.
- **Chutki** now has her own orange ear and saddle patch, so she can't be mistaken for Puchu.
- **Idle life:** cats that stand still groom and flick their tails.
- Before-and-after sheets are in `docs/milestone-10/`.

### Audio: why the cats and Racon were silent
Root cause: each voice was a sawtooth wave through one narrow band-pass filter centred on a high
harmonic, and that harmonic carries only about 1/`bright` of the wave's energy.

**Measured in Chromium** (OfflineAudioContext, at the default 70% voice volume):

| | Peak | RMS |
|---|---|---|
| Before | 0.012–0.024 | 0.0016–0.0034 |
| After | 0.08–0.15 | 0.014–0.036 |

The UI blips peak around 0.1, so the old voices were 4–8 times quieter than them.

**What changed:**
- A low-passed "body" path now carries the pitch, and the filter's gain is compensated.
- Voices share the game's single AudioContext on every page.
- Racon trills and snuffles. Magic and Puchu purr when sleepy.
- Files: `city/voices.ts`, `lib/soundService.ts`, `main.tsx`.

## Test and build results (actually run)
| Check | Result |
|---|---|
| `npm test` | **210 / 210 pass** (201 earlier + 9 new in `tests/pawvilleM10.test.ts`) |
| `npm run audit:map` | 0 issues |
| `npm run audit:interactions` | every spot has a handler |
| TypeScript (stand-in types) | no new real errors (see progress file) |
| `npm run build` (Vite) | **not run here** (package registry blocked) — run locally |
| Chromium checks | tab title; sitting on a south bench; ducks; Ferris ride start → top → Esc → walking again; garden plant → water → harvest → Green Thumb in save; dialogue at 4 sizes; voices on a shared, running context for all 7 characters |
| Two devices / multiplayer | **not tested** |

## Known gaps in this batch
- **Art not yet redrawn:**
  - Front and side cat views only gained shading.
  - Racon's art is unchanged.
  - The signature emotes are unchanged.
  - No environment art was redrawn.
- **Animation:** there are no new turning or start/stop frames.
- **Ferris wheel:** riding together is only half done. A message is sent to your partner, but
  their game doesn't act on it yet.
- **Garden:** it isn't synced between partners yet.
- **Not started:** everything in batches 3–8 (NPCs, the city districts, the funfair, navigation,
  Little Moments, multiplayer, title screen, onboarding and events).

## Applying and running
**Full project:** unzip `Pawville_Milestone10_Complete.zip`, then:
```bat
npm install
npm test
npm run build
npm run dev
````
