# Milestone 10 — progress checklist

This file is the continuation point for Milestone 10. Statuses:
**Verified** (implemented and checked by tests and/or in a real Chromium browser) ·
**Implemented, unverified** · **Partial** · **Not started** · **Blocked** (with reason).

Last updated: batch 1–2 ("fixes and quick wins" + "cats and characters").
Baseline at start of batch: 201/201 tests (8.2 + build fix). Now: **210/210**.

**Next batch: 3, the living world (NPC system).** Start at section 5 below.

## 2. Preserve earlier milestones
| Item | Status | Evidence |
|---|---|---|
| All 201 earlier tests still pass | Verified | `npm test` 210/210 |
| Map audit / interaction audit | Verified | 0 issues; every spot has a handler (now incl. `activity:ride`) |
| Café Rush, Fish Frenzy, cinema, karaoke code | Verified unchanged | No edits except karaoke pads now share the fixed voice path (`padTone` level re-balanced) |
| Footsteps | Verified unchanged | `world/footsteps.ts` untouched; voices now share its AudioContext |
| Green Thumb earnable | **Verified** | Awarded on the first home-garden harvest (browser test: achievement written to save) |

## 3. Defects
| Item | Status | Evidence / root cause |
|---|---|---|
| 3.1 Dialogue clipping | **Verified** | Root cause: bottom-anchored sheet with no max-height and no wrapping. Browser test at 360×640, 320×480, 812×375, 1100×640 with a very long line: box inside the viewport, button visible, no horizontal overflow |
| 3.1 Other panels (shops, notes, nametags) wrap long words | Implemented, unverified | `overflow-wrap:anywhere` added; not individually screenshot-tested |
| 3.2 World geometry audit | Partial | Map audit 0 issues. Fixed: trees growing through the Ferris wheel. Full visual audit of every map: **not done** |
| 3.3 Animation regression | Partial | Fixed facing flicker on diagonals (hysteresis, tested). Gait from 8.1 kept. Turning/start/stop transition frames: **not done** |
| 3.3 Idle life: grooming, tail flick | Implemented, unverified visually | In `planCat`; not captured in a screenshot |
| 3.3 Sleeping (loaf) | **Verified** (art) | New loaf with head/ears/eyes/paws (sprite test + sheet) — cats only; Racon's sleeping pose unchanged |
| 3.4 Benches face the fountain | **Verified** | Root cause: south benches used the front sprite and front approach. Now `faces:'up'`, back-view sprite, approach from the fountain side, cat faces up. Test + browser screenshot |
| 3.4 Ducks stay in water | **Verified** | Root cause: ducks placed on the plank bridges, 14 px loops crossed them. Now one duck per pond quarter (positions computed from water tiles), 10×4 loops, test checks every loop point is water. Bobbing + ripples added |
| 3.5 Tab title / metadata / favicon | **Verified** | `<title>Pawville</title>`, og tags, author "Yash Raj Sondhi", new paw favicon; browser title read back as "Pawville" |
| 3.5 Travel prompt positions | Partial | Ferris marker/prompt/boarding point share one constant (tested). Full audit of every travel trigger: **not done** |

## 4. Graphics overhaul
| Item | Status |
|---|---|
| Cat shading (all cats, all views) | **Verified** (≥8 colours per front sprite, sheet in `docs/milestone-10/`) |
| Back view with separate head, neck, tail | **Verified** (sprite test + sheet) |
| Chutki visually distinct from Puchu | **Verified** (orange ear + saddle patch; test) |
| Front/side views redrawn | Not done (shading only) |
| Racon redrawn | Not done |
| Signature emotes improved | Not started (existing emotes untouched and still working) |
| Environment art (village, city, regions) | Not started |
| Lighting / weather / foreground layers | Not started |

## 5. Living world (NPCs) — Not started (batch 3)
## 6. Whiskerwick ten districts — Not started (batch 4)
## 7. Funfair — complete (batch 5)
| Item | Status |
|---|---|
| Walled funfair park (own region, gate from the city boardwalk, exit back) | **Verified** in browser: city → arch → park → exit → boardwalk |
| Ferris wheel (8 gondolas, one slow turn, cat rides IN its gondola) | **Verified** in browser + unit tests |
| Moonbeam Carousel (8 mounts, bobbing, two turns) | **Verified** in browser + unit tests |
| Cloud Swing Ride (loads slow, spins up, chairs fly out, spins down; everybody steps off while it is slow) | **Verified** in browser (boarding, full spin, exit onto free ground) + unit tests |
| Bumper Paws (real car physics, 3 bots, bumps score, 60 s, capped tokens) | **Verified** in browser + unit tests (bounds, no overlap, no stuck cars, determinism) |
| Ring Toss (aim, charge, throw, arc, rim clinks, ringed pegs go inactive, 6 rings, capped tokens) | **Verified** in browser (6 throws, score, round end, replay) + unit tests |
| Shared rides with your partner | Seat claims over the existing pair channel (`{t:'fair'}`), shared UTC clock, deterministic tie-break, TTL so a ghost rider can never stay — **unit tested; two-device run not possible here** |
| Nutmeg the ticket-taker (dialogue, friendship, tips) | **Verified** in browser |
## 8. Telescope — exists since 8.1 (unchanged this batch)
## 9. Navigation markers / world map — Not started
## 10. Home
| Item | Status |
|---|---|
| Gardening (plant, water, stages, harvest, decor, wildlife, persistence, no offline death) | **Verified** (unit tests + browser: plant → water → ripe → harvest → items + Green Thumb) |
| Gardening together (partner sync) | Not started |
| Furniture placement | Exists from earlier milestones; not changed |
| Cooking | New recipe *Garden salad* (carrot + herbs + berries) |
## 11. Audio
| Item | Status |
|---|---|
| Character voices audible | **Verified by measurement**: old peak 0.012–0.024 (4–8× quieter than UI sounds), new 0.08–0.15 in Chromium OfflineAudioContext. In-game: one shared AudioContext, state `running`, oscillators created on emotes for all 7 characters |
| Racon trill + snuffle; Magic/Puchu purr when sleepy | Implemented (rendered in the measurement test); listening not possible here |
| Footsteps / karaoke preserved | Verified (code paths unchanged; karaoke uses the same `syllable`) |
| Separate ambience / music volume | Not started (voice volume slider already exists) |
## 12–16. Little Moments, multiplayer, title screen, onboarding, events — Not started (batches 6–8)
## 17. Save safety
| Item | Status |
|---|---|
| Old saves load | Verified: no schema change to the world save except new optional items; home garden is a new separate store (`pawville:home-garden`) |
| Duplicate harvest / double tap | Verified (idempotent op ids, test) |

## Verification environment notes
- `npm run build` (real Vite): **not run here** — the package registry is blocked. Run it locally.
- Type check: run with stand-in types (React/Node types unavailable). No new errors other than the
  "implicitly any" ones caused by the missing React types, the same kind already present before.
- Browser checks: real Chromium, the game bundled with a small TypeScript-transpiling bundler.
- Two-device multiplayer: **not tested**.
