# 🐾 Pawville — a cozy world for long-distance couples

Pawville is a walkable cat town built around the original **Paw vs Paw** game. Walk your cat around with your partner, swing in the park, hold paws, have picnics, fish off the pier, watch for shooting stars, decorate your home, keep a scrapbook, and play games together.

It uses the original Paw vs Paw design system (plum surfaces, Tangerine orange, Fredoka + Nunito, rounded toy-like buttons) and the original Supabase backend and anonymous guest session.

![Map](docs/pawville-map.png)

## Milestone 4 at a glance

- **Six characters:** Tangerine, Midnight, **Puchu** (white with orange dots), **Chutki** (Puchu's look-alike with a forehead heart and orange tail tip), **Mini** (grey with emerald eyes) and **Magic** (brown with a white tummy). Pick one in the Wardrobe; your nickname stays separate.
- **15 animated emotes**, plus Mini's exclusive **Starpaw Serenade**. There's a quick-emote bar with favourites, and couple emotes still need your partner to say yes.
- **Photo mode:** the controls sit beside or below the scene, with a live preview, five framings (including couple), a Starry frame and a capture timer.
- **The home** is a furnished, walkable room with 37 illustrated pieces and things cats actually do with them.
- **Every bench** is sittable, including the park bench.
- **Livelier town:** falling leaves, nodding flowers, harbour ripples, rain rings in puddles, softer ambient occlusion and an interaction ring.

See `PAWVILLE_MILESTONE4.md` for details, test results and the manual test checklist.

## What's in town

| Place | What you can do |
|---|---|
| **Fountain Plaza** | Benches (sit together), coin-toss wish, Event Board (daily challenge, weekly special, live weather) |
| **Arcade** | **Paw vs Paw** (online / vs Computer / Pass & Play), **Paw Snap** (two-player reaction duel), claw machine next door |
| **Typing Arena** | **PawType**: lowercase phrase races (15 s, 30 s, finish-the-phrases), vs a pace cat, or a duel with your partner |
| **The Ring** | **Cat Boxing**: practice, vs Computer (3 levels), couple match |
| **Harbor** | **Cat Battleship** vs the Harbormaster (3 levels), fishing pier with 8 fish (some only at night, in rain or in snow) |
| **Puzzle Garden** | **Memory Paws** (solo or 2 players on one device), **Puzzle Garden** (patterns, flower beds, nap-spot deduction, daily puzzle) |
| **Whack-a-Cat booth** | **Whack-a-Cat** |
| **Paw Park** *(new)* | Couple's swing, seesaw, picnic meadow, stargazing hill, shared garden, lily pond, flower arch for photos |
| **Our Home** *(new)* | Decorate the room, mailbox for notes and gifts, treasures; scrapbook |
| Around town | Apple tree, flowerbeds, snack machine, puddles (when it rains), 3 shells, 3 hidden toys |

The weather (sunny, cloudy, light and heavy rain, snow, wind, mist) and time of day (morning to night) change on a shared schedule. Everyone sees the same sky at the same moment.

## Quick start

Requires **Node.js 22.18+**.

```bash
npm install
npm run verify:files   # original Paw vs Paw files + all Pawville files/imports present?
npm test               # unit tests (original + Pawville)
npm run typecheck
npm run dev            # http://localhost:5173 — you start in the plaza
npm run build
```

Without `.env.local` everything runs **solo**. You can explore, play all the games, use park activities, decorate, take photos and keep a scrapbook. Online features (town presence, couples, cross-device mail, online Paw vs Paw) need Supabase, set up as described below.

### Installing this package over your project

This ZIP is an **overlay**. It contains every new and changed file, but **not** the unchanged original Paw vs Paw sources. Copy it over your project folder and allow overwrites:

```
robocopy "%USERPROFILE%\Downloads\Pawville-Milestone3" "C:\path\to\pvp" /E /XD node_modules
```

Then run `npm run verify:files`. It should print ✔ twice.

## Supabase (online features)

1. Do the original Paw vs Paw setup: enable **anonymous sign-ins** and run migrations `20261023000001` and `20261023000002`.
2. Run the **new** migration **`supabase/migrations/20261024000001_pawville_pairs.sql`** (SQL Editor → paste → Run, or `npx supabase db push`).
3. Set the environment variables (names only, never secrets): `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` (or legacy `VITE_SUPABASE_ANON_KEY`). **Never** use a `service_role` / `sb_secret_` key.

| Feature | Transport | Authority |
|---|---|---|
| Town presence (see other cats) | public Realtime channel `pawville:plaza` | none needed (cosmetic positions, validated + clamped on receipt) |
| Couple pairing, invites, leave | RPCs `pv_create_pair_invite`, `pv_accept_pair_invite`, `pv_my_pair`, `pv_leave_pair`… | **Server**: RLS + SECURITY DEFINER checks on `auth.uid()` |
| Mail (notes and gifts) | RPCs `pv_send_mail`, `pv_my_mail`, `pv_open_mail` | **Server**: only the two pair members can read; rate-limited |
| Shared activities, emotes, paw-holding, garden ops, PawType duels, Cat Boxing couple matches | **private** Realtime channel `pv-pair:<pair id>` | Channel membership is enforced by RLS on `realtime.messages`. Game results are **not** server-validated (see below) |
| Online Paw vs Paw | original rooms and RPCs | **Server** (unchanged) |

**Honest limits:** PawType duels and Cat Boxing couple matches run between the two partners' browsers. Boxing is host-run: the inviter's device simulates the match and the other device sends inputs. The other player's PawType result is plausibility-checked. Both modes are fine for friendly matches between partners, but they are **not** cheat-proof ranked modes. Online Battleship is not offered, because hiding fleets requires a server referee. The shared home layout and the garden save on each device. Garden actions are shared live while you're both online.

### Local two-tab demo (no server)

The couple panel (the ♥ button) has a clearly labelled **local two-tab demo**. Two tabs of the same browser talk over `BroadcastChannel`. You can use it to try swings, emotes, paw-holding, PawType duels and boxing without Supabase. The demo is never shown as an online couple.

## Controls

| | Desktop | Touch |
|---|---|---|
| Walk / run | WASD or arrows / Shift | Drag the pad / push to the edge |
| Interact | `E`, Enter or Space | Paw button |
| Swing pump | Space or **Pump** | Pump button |
| Cat Boxing | A/D move · J jab · K heavy · S block · Space dodge · L flurry | On-screen buttons |
| Paw Snap | A (left cat) · L (right cat) | Big pads |
| Whack-a-Cat | Numpad layout 7-8-9 / 4-5-6 / 1-2-3 | Tap |

## Rules and formulas

- **PawType**: phrases are lowercase words only. Input is lowercased, so capitals never count against you. WPM = correct letters ÷ 5 ÷ minutes. Accuracy = correct keystrokes ÷ all keystrokes. Ranking: in a race, finishing first wins; in timed mode, more correct letters wins. Accuracy breaks ties. Both duellists get identical phrases (shared seed) and the same start time.
- **Cat Boxing**: fixed 30 Hz simulation. Every move has startup, active and recovery frames plus a cooldown, so mashing doesn't win. Jab hit-stun is shorter than a jab, so nobody can be locked forever. Simultaneous hits trade fairly. Rounds last 45 s or end by KO, best of three. A disconnect becomes a forfeit after a 15 s grace period.
- **Garden**: one growth stage per watering, at most every 10 minutes (no grinding). Either partner can water. Only the planter can dig up an unbloomed plant.
- **Daily things** (apple tree, bouquet, coin wish, daily puzzle) are bonuses only. There are **no streaks**, and missing a day costs nothing.

## Saved data

| Data | Where |
|---|---|
| Nickname + original accessory | Paw vs Paw preferences (unchanged) |
| Coat + Pawville extras | `pawville:appearance` (versioned; migrates the Milestone 2 `pawville:cat`) |
| Inventory, secrets, garden, fish, memories, achievements | `pawville:world` (versioned, repaired on load) |
| Home layout | `pawville:home` |
| Photos | **IndexedDB** `pawville-photos` (JPEG, max 960 px, 60 photos, favourites kept). Not localStorage |
| Couple | **Server** (`pawville_pairs`); `pawville:pair-cache` is only a display cache |
| Demo couple | sessionStorage (per tab) |

Every record is size-capped, and corrupt data falls back to defaults instead of crashing.

## Architecture (for future expansions)

