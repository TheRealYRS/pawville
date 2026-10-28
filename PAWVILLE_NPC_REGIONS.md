# Milestone 10b — residents for the empty regions

The harbor, Frostbell, the forest, the cave, the Star Isles, the Old Library and the Purring Cup used to have only their quest NPCs (or nobody at all).
They now each have a small community of wandering residents: **20 new characters** (the game now has 44 living residents).

| Resident | Place | Job | Voice | Friend | Landmarks (px) |
|---|---|---|---|---|---|
| **Dory** | Pawport harbor | ferry ticket clerk | chatty | Kelp | (104,184) ↔ (136,200) |
| **Kelp** | Pawport harbor | net mender | weathered | Dory | (200,280) ↔ (312,280) |
| **Pearl** | Pawport harbor | shell diver | adventurous | Tide | (88,424) ↔ (232,440) |
| **Tide** | Pawport harbor | lighthouse apprentice | studious | Pearl | (520,72) ↔ (552,104) |
| **Burdock** | Whisperwood | forager | woodsy | Thistle | (264,168) ↔ (344,232) |
| **Thistle** | Whisperwood | herbalist | shy | Burdock | (56,168) ↔ (56,232) |
| **Acorn** | Whisperwood | trail scout | playful | Burdock | (472,360) ↔ (568,328) |
| **Flurry** | Frostbell highlands | sled racer | playful | Mittens | (504,168) ↔ (488,248) |
| **Mittens** | Frostbell highlands | cabin cook | foodie | Flurry | (72,152) ↔ (56,200) |
| **Snowdrop** | Frostbell highlands | aurora watcher | observant | Boreal | (344,376) ↔ (424,376) |
| **Boreal** | Frostbell highlands | frost trader | hardy | Snowdrop | (232,200) ↔ (312,264) |
| **Geode** | Crystal cave | crystal collector | curious | Echo | (88,104) ↔ (152,184) |
| **Echo** | Crystal cave | echo listener | shy | Geode | (328,104) ↔ (344,184) |
| **Starling** | Star Isles | star charter | dreamy | Comet | (504,216) ↔ (552,216) |
| **Comet** | Star Isles | pond fisher | relaxed | Starling | (344,376) ↔ (360,424) |
| **Dewey** | Old Library | librarian | organised | Folio | (88,104) ↔ (296,136) |
| **Folio** | Old Library | night reader | sleepy | Dewey | (40,152) ↔ (152,152) |
| **Latte** | The Purring Cup | barista | chatty | Mocha | (152,104) ↔ (72,136) |
| **Mocha** | The Purring Cup | window-seat regular | relaxed | Latte | (296,136) ↔ (296,104) |
| **Crumpet** | The Purring Cup | karaoke fan | musical | Latte | (104,200) ↔ (104,152) |

Each resident walks between their two landmarks, idles in their own way (sit / groom / watch / stretch / nap), stops and turns to face you when you talk to them,
and speaks in a voice that fits them. What they say changes with the weather and the time of day, and (like the existing residents) a bit more once you are friends.
Four new voices were written for this: **weathered** (harbor), **hardy** (highlands), **woodsy** (forest), **dreamy** (isles). The rest reuse the existing voices.
Lines are timeless on purpose — nobody spoils a quest or says a place is restored/lit/open before it is.

## Bugs found and fixed while building this
1. **The forest stray "Bramble" never got his own dialogue.** Residents were looked up by id alone, and the town resident Bramble shares that id, so talking to the shy forest stray
   gave you the *town* Bramble's greeting ("Evening— ah. Good day.") instead of the quest dialogue. Lookups are now scoped to the region (`residentFor` in `living/roster.ts`).
2. **Residents could freeze mid-stride for ever** (engine, `living/engine.ts`). Three causes, all fixed:
   - the route planner only checked that each tile's *centre* was open, not the straight walk between two centres — a crystal or pole standing between two open tiles blocked the walk but not the plan;
   - the first leg of a route (from wherever the resident was standing to the first node) was never checked, so a landmark on the corner of a counter left a resident unable to take one step;
   - a landmark whose tile centre sat inside scenery could never be *reached* (the planner needed to end on that tile's centre).
   Now: routes are validated edge by edge, every route starts from the resident's own tile centre, `safeSpot` always returns a walkable tile centre, and a resident who is still blocked after three replans gives up that leg and idles instead of freezing.
   This also un-froze the **existing** park gardener **Clover**, who had never moved at all.

## How it was checked
- Geometry: every landmark is a walkable tile centre, the two landmarks connect both ways, each is reachable from where you arrive, nobody stands on an arrival point, door, activity spot or quest NPC.
- Five-minute simulation of **every** resident in the game (all 11 areas): nobody is frozen (this found Echo, Latte, Dory and Clover while building).
- Real browser: walked into the harbor, Frostbell, forest, cave, Star Isles, library and café; every new resident is there, shows "Talk to …", and speaks.
- `tests/pawvilleNpcRegions.test.ts` (13 tests) + the existing `pawvilleLiving.test.ts`.
