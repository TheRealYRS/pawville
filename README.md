# 🐾 Pawville

*A cozy pixel-art cat world for two — built around the original **Paw vs Paw** game.*

Developed by **Yash Raj Sondhi**.

Walk your cat around a living little town and a bigger city, swing in the park, hold paws,
have picnics, fish off the pier, chase a falling star, decorate your home, keep a scrapbook,
sing karaoke, ride the Ferris wheel, and play games together — solo or paired up with a
partner in real time.

---

## Table of contents

- [Overview](#overview)
- [Features](#features)
- [Tech stack](#tech-stack)
- [Architecture](#architecture)
  - [High-level layers](#high-level-layers)
  - [Frontend application layer](#frontend-application-layer)
  - [The Paw vs Paw game engine](#the-paw-vs-paw-game-engine)
  - [The Pawville cozy-game layer](#the-pawville-cozy-game-layer)
  - [Rendering and audio](#rendering-and-audio)
  - [Multiplayer & backend (Supabase)](#multiplayer--backend-supabase)
  - [Persistence model](#persistence-model)
  - [Packaging targets](#packaging-targets)
- [Project structure](#project-structure)
- [Getting started](#getting-started)
  - [Prerequisites](#prerequisites)
  - [Installation](#installation)
  - [Environment variables](#environment-variables)
  - [Running the app](#running-the-app)
- [Available scripts](#available-scripts)
- [Testing](#testing)
- [Desktop build (Electron)](#desktop-build-electron)
- [Mobile build (Capacitor / Android)](#mobile-build-capacitor--android)
- [Deployment](#deployment)
- [Supabase / backend setup](#supabase--backend-setup)
- [Progressive Web App](#progressive-web-app)
- [Project documentation](#project-documentation)
- [Credits](#credits)

---

## Overview

Pawville started as **Paw vs Paw**, a two-player tic-tac-toe-style board game with cats
instead of X's and O's, playable offline against an AI or online against a partner over a
shared room code. It has since grown into a full cozy life-sim layered on top of that game:
a walkable town and city, a branching story with personality-driven NPCs, a couple/pairing
system, minigames, home decoration, photography, and music — all running as a single React
web app that can also be packaged as a desktop app and a mobile app.

The project ships as:

- A **web app** (Vite + React + TypeScript), installable as a **PWA**.
- A **desktop app** via **Electron**, wrapping the same web build.
- An **Android app** via **Capacitor**.
- A **Supabase** backend for realtime multiplayer, rooms, presence, and pairing.

## Features

**Paw vs Paw (the original game)**
- Offline play against a minimax AI, or online play against a partner via a shareable room code
- Turn validation, rematch voting, score tracking, reactions, sound and animation feedback

**Pawville — the cozy town & city**
- Free-roam exploration across a town and a connected city, with region-to-region travel, a world map, and a journal
- A multi-act story with dialogue choices, personality-driven NPCs, clues, puzzles, and multiple tone-based endings
- A pairing/"couple" system: invite a partner, share presence, hold paws, sit together, and make certain story choices together
- City districts: café, cinema, arcade, karaoke, funfair (Ferris wheel, bumper paws, ring toss), fishing
- Home life: decorating, cooking, gardening, a mailbox, and a photo scrapbook
- Minigames: Battleship, Boxing, Memory Paws, PawType (typing), Puzzle Garden, Reflex, Whack-a-Cat
- A telescope/stargazing system, emotes with particle effects, and an original in-browser music/audio engine (no external audio files — everything is synthesized)
- Real-time presence: shared plaza/world state, seat claims (benches, rides), and NPC regions

## Tech stack

| Layer | Technology |
|---|---|
| UI framework | React 18 + TypeScript |
| Build tool / dev server | Vite |
| Routing | Custom lightweight router (`src/router.ts`) |
| Styling | Hand-written CSS (design tokens + component sheets), no CSS framework |
| Fonts | `@fontsource/fredoka`, `@fontsource/nunito` |
| Backend / realtime | Supabase (Postgres, Row Level Security, RPC functions, Realtime channels, anonymous auth) |
| Rendering | Custom canvas-based pixel-art renderer (no game engine library) |
| Audio | A custom synthesizer (`src/pawville/audio/synth.ts`) — all music and SFX are generated in code |
| Desktop packaging | Electron + electron-builder |
| Mobile packaging | Capacitor (Android) |
| PWA | A hand-written service worker (`public/sw.js`) |
| Testing | Node's built-in `node:test` runner (TypeScript, via `--experimental-strip-types`) + Playwright-driven real-browser test scripts |
| Hosting | Netlify and/or Vercel (both configs included) |

## Architecture

### High-level layers

```
┌─────────────────────────────────────────────────────────────────┐
│                         React Application                       │
│  (src/App.tsx, src/main.tsx, src/router.ts)                     │
├───────────────────────────┬───────────────────────────────────┤
│   Paw vs Paw game layer    │        Pawville cozy-game layer     │
│   src/game, src/components │        src/pawville/**              │
│   src/hooks, src/lib        │  (adventure, city, couple, games,   │
│   src/pages                 │   home, living, story, world, net,  │
│                              │   render, memories, components)    │
├───────────────────────────┴───────────────────────────────────┤
│              Rendering & Audio (canvas + synthesizer)            │
│   src/pawville/render/**        src/pawville/audio/synth.ts      │
├───────────────────────────────────────────────────────────────┤
│         Realtime / Multiplayer client (src/lib, pawville/net)    │
│         Supabase JS client  →  Postgres + Realtime + RLS + RPC   │
├───────────────────────────────────────────────────────────────┤
│                     Persistence (localStorage)                   │
│        src/pawville/worldSave.ts, persistence.ts, preferences.ts │
└───────────────────────────────────────────────────────────────┘
                               │
            ┌──────────────────┼──────────────────┐
            ▼                  ▼                  ▼
     Web / PWA build     Electron desktop     Capacitor Android
     (public/sw.js)      (desktop/*.cjs)      (capacitor.config.json)
```

### Frontend application layer

- `src/App.tsx` / `src/main.tsx` — app bootstrap and mounting.
- `src/router.ts` — a small, dependency-free client-side router (no `react-router`).
- `src/pages/*` — the original Paw vs Paw screens: `HomePage`, `GameRoomPage`,
  `OfflineGamePage`, `NotFoundPage`.
- `src/pawville/pages/*` — the cozy-game screens layered on top: `TownPage`,
  `CoupleHomePage`, `ScrapbookPage`, `PuzzleGardenPage`, `PawTypePage`, `MemoryPawsPage`,
  `BoxingPage`, `WhackACatPage`, `PawSnapPage`, `PairInvitePage`, `ComingSoonPage`.
- `src/pawville/navigation.ts` / `src/pawville/destinations.ts` / `src/pawville/routes.ts` —
  define how regions, destinations, and in-game travel map onto routes.

### The Paw vs Paw game engine

Pure, UI-independent game logic lives in `src/game/`:

- `types.ts` — the shared type definitions (the single most-referenced module in the project).
- `gameRules.ts` — win/draw detection and move legality.
- `matchEngine.ts` — the authoritative match state machine, shared by both the offline and
  online hooks.
- `minimaxAI.ts` — the offline opponent.
- `messages.ts` / `animations.ts` — UI feedback (toasts, board animations).

It's consumed through two hooks that share the same engine but differ in transport:

- `useOfflineMatch.ts` — plays entirely client-side against `minimaxAI`.
- `useOnlineRoom.ts` — drives a live match over Supabase (`roomService`,
  `multiplayerService`, `sessionService`, `supabaseClient`).

### The Pawville cozy-game layer

Everything under `src/pawville/` is additive on top of the original game and is organized by
subsystem:

| Folder | Responsibility |
|---|---|
| `adventure/` | The exploration/story runtime: regions, interaction spots, dialogue, puzzles, telescope, and the `AdventureLayer` component that renders it all |
| `story/` | The narrative data and engine: scripted acts, NPC casts/residents, the journal, pairing-aware story progress, and the music tied to story beats |
| `city/` | City-district activities: café rush, cinema, arcade games, funfair + ring toss + bumper paws, karaoke (songs, backing tracks, vocals), fishing, the city's economy |
| `couple/` | The pairing system: pair invites/hub/model/service, shared emotes, paw-holding, and the transport layer that keeps two players' state in sync |
| `games/` | Self-contained minigame engines: Battleship, Boxing, Memory, PawType, Puzzle (flowerbeds, nap spots, patterns), Reflex, Whack-a-Cat |
| `home/` | Home life: decorating, cooking, gardening, dragging furniture, the mailbox |
| `living/` | The town's "alive" layer: NPC roster and town simulation engine |
| `memories/` | Photo booth composition, framing, and the scrapbook store |
| `net/` | The realtime presence protocol: backend abstraction, channel registry, occupancy tracking, and town presence |
| `world/` | Shared spatial systems: geometry, movement, collision/claims, seating/bench logic, footsteps, and map auditing |
| `render/` | The entire pixel-art renderer: sprites, lighting, region/town/city art, the telescope view, film/cutscene art, emote animation, and a custom pixel font |
| `components/` | Shared Pawville UI: panels, the town canvas, the virtual joystick, wardrobe, photo mode, title screen, menus |
| `audio/synth.ts` | A from-scratch audio synthesizer used for every sound effect and piece of music in the game |

Cross-cutting Pawville modules at the top level handle identity (`identity.ts`,
`instanceId.ts`), appearance/customization (`appearance.ts`), ambience (`ambience.ts`),
sound routing (`sound.ts`), environment/weather (`useEnvironment.ts`), and save data
(`worldSave.ts`, `useWorldSave.ts`, `persistence.ts`).

### Rendering and audio

There is **no external game engine or sprite/audio asset pipeline** — everything you see and
hear is generated in code:

- **Rendering**: `src/pawville/render/*` draws pixel art procedurally onto `<canvas>`
  (characters, regions, lighting, weather, UI chrome, film/cutscene frames) using shared
  primitives in `canvasTypes.ts`.
- **Audio**: `src/pawville/audio/synth.ts` synthesizes notes and voices in real time;
  `city/karaoke*.ts` and `story/music*.ts` build backing tracks, guide vocals, and story
  cues from that synthesizer rather than shipping audio files.
- `scripts/render-previews.ts` and `scripts/preview/*` exist purely to export WAV/PNG
  previews of that generated content for human review — they are dev tooling, not part of
  the shipped build.

### Multiplayer & backend (Supabase)

Real-time multiplayer (for both the original board game and Pawville's shared-world
presence/pairing) is backed by Supabase:

- **Client**: `src/lib/supabaseClient.ts` initializes the client from environment variables;
  `roomService.ts`, `multiplayerService.ts`, and `sessionService.ts` wrap room creation,
  joining, and session handling; `src/pawville/net/*` layers presence, occupancy, and a
  channel registry on top for the town/city.
- **Server**: four SQL migrations under `supabase/migrations/` define the schema and
  security model:
  - `20261023000001_paw_vs_paw_core.sql` — core rooms/players/moves schema and RPC functions
    (`create_room`, `join_room`, `make_move`, `request_rematch`, `decline_rematch`,
    `send_reaction`, etc.)
  - `20261023000002_realtime_presence_auth.sql` — realtime + presence + anonymous-auth
    policies
  - `20261024000001_pawville_pairs.sql` — the partner-pairing schema
  - `20261026000001_pawville_invite_status.sql` — invite/status tracking for pairs
- **Security model**: all game-state mutation goes through **Postgres RPC functions**, not
  direct table writes — clients never have `UPDATE`/`INSERT` access to gameplay tables
  directly, and **Row Level Security** prevents a player from reading or writing a room they
  haven't joined. A dedicated smoke test (`npm run smoke`) exercises this against a real
  Supabase project: room isolation, turn validation, concurrent-move race handling, rematch
  voting, and reaction rate limiting.
- **Local development without Supabase**: `scripts/browser/devserver.mjs` can run the app
  against an **in-browser mock Supabase client** (`--mock-realtime`) that simulates presence
  and broadcast over `BroadcastChannel`, so multiple tabs behave like multiple players
  without needing a live backend — this is what the Playwright-based browser tests use.

### Persistence model

Pawville is designed to work fully offline for a single player and only reach out to
Supabase for multiplayer/pairing features:

- **`localStorage`** holds per-device data: world save state (`worldSave.ts`), sound/display
  preferences (`preferences.ts`), and adventure/story progress.
- **Supabase** holds only what needs to be shared between players: room/match state,
  presence, and pairing status. A small number of story flags (e.g. temple access) are
  explicitly marked as *shared* between paired partners, while personal dialogue choices and
  quest history stay local to each player.

### Packaging targets

The same `dist/` web build is reused across all three shells:

- **Web / PWA** — served as-is; `public/sw.js` does network-first navigation with an offline
  app-shell fallback, cache-first static assets, and never caches Supabase traffic.
- **Desktop (Electron)** — `desktop/copy-web.cjs` copies `dist/` into `desktop/web`;
  `desktop/main.cjs` serves it from a private `app://` origin (so routing and
  `localStorage` behave identically to the website), handles SPA fallback routing, and opens
  external links in the system browser; `desktop/preload.cjs` exposes nothing but a
  `platform` marker to the page (no Node integration).
- **Android (Capacitor)** — `capacitor.config.json` points Capacitor at the same `dist/`
  output (`webDir`) to produce a native Android shell.

## Project structure

```
paw-vs-paw-main/
├── desktop/                 # Electron shell (main process, preload, packaging scripts)
├── public/                  # Static assets, manifest, service worker
├── scripts/                 # Dev server, audits, preview renderers, smoke/verify scripts
│   ├── browser/              # Playwright devserver + Python test helpers
│   └── preview/               # Offline canvas rasterizer + PNG/WAV preview tools
├── src/
│   ├── components/           # Paw vs Paw board-game UI
│   ├── game/                 # Paw vs Paw rules, match engine, AI, types
│   ├── hooks/                 # useOfflineMatch, useOnlineRoom, useSound, useToast, ...
│   ├── lib/                   # Supabase client, room/session/multiplayer/sound services
│   ├── pages/                 # HomePage, GameRoomPage, OfflineGamePage, NotFoundPage
│   ├── pawville/              # The entire cozy-game layer (see Architecture above)
│   ├── styles/                # Global design tokens and shared component styles
│   ├── App.tsx, main.tsx, router.ts, pwa.ts
├── supabase/
│   └── migrations/            # SQL schema, RLS policies, RPC functions
├── tests/                     # node:test unit/integration tests + Playwright browser tests
├── capacitor.config.json      # Android packaging config
├── netlify.toml / vercel.json # Hosting configs
├── vite.config.ts
├── tsconfig.json
├── index.html
└── package.json
```

## Getting started

### Prerequisites

- **Node.js** (version pinned in `.nvmrc` — use `nvm use` if you have nvm installed)
- **npm**
- A **Supabase project** if you want live multiplayer/pairing (optional for solo/offline play
  and for local dev against the mock realtime server)

### Installation

```bash
git clone <your-repo-url> pawville
cd pawville
npm install
```

### Environment variables

Copy the example file and fill in your own Supabase project values:

```bash
cp .env.example .env.local
```

```ini
VITE_SUPABASE_URL=your-supabase-project-url
VITE_SUPABASE_PUBLISHABLE_KEY=your-supabase-publishable-key
```

`.env.local` is git-ignored — never commit real credentials. `.env.example` is safe to
commit and only documents which variables are required.

### Running the app

```bash
npm run dev
```

This starts the Vite dev server. Open the printed local URL in your browser.

## Available scripts

| Script | What it does |
|---|---|
| `npm run dev` | Start the Vite dev server |
| `npm run build` | Type-check (`tsc --noEmit`) then produce a production build with Vite |
| `npm run preview` | Preview the production build locally |
| `npm run typecheck` | Run the TypeScript compiler in check-only mode |
| `npm test` | Run the unit/integration test suite with Node's built-in test runner |
| `npm run smoke` | Run the live Supabase smoke test (`scripts/smoke-test.mjs`) against your real project |
| `npm run verify:files` | Sanity-check that key generated/style/migration files are present |
| `npm run android:add` | Add the Android platform via Capacitor |
| `npm run android:sync` | Build the web app and sync it into the Android project |
| `npm run android:open` | Open the Android project in Android Studio |
| `npm run android:apk` | Build, sync, and assemble a debug APK |
| `npm run desktop:start` | Build the web app and launch it inside the Electron shell |

## Testing

Two layers of tests exist:

1. **Unit / integration tests** (`tests/*.test.ts`) — run with Node's native test runner
   against TypeScript directly:
   ```bash
   npm test
   ```
   These cover the game engine, Pawville adventure/story systems, city activities, couple
   pairing, home/decor, NPC regions, persistence, presence, puzzles, seat claims, and more
   (one file per subsystem).

2. **Real-browser tests** (`tests/browser/*.py`) — Playwright-driven scripts that spin up
   `scripts/browser/devserver.mjs` (optionally with `--mock-realtime`, so multiple browser
   tabs simulate multiple players over `BroadcastChannel`) and drive real Chromium to verify
   things that only matter in an actual DOM/canvas: dialogue layout, ride seating across two
   tabs, karaoke/music playback, and story/NPC placement. Logs from recent runs are kept
   under `tests/browser/logs/`.

## Desktop build (Electron)

```bash
npm run build              # build the web app into dist/
cd desktop
npm install
npm start                  # copies dist/ into desktop/web and launches Electron
```

To produce an installer:

```bash
npm run dist:win     # Windows (NSIS)
npm run dist:mac      # macOS (DMG)
npm run dist:linux    # Linux (AppImage)
```
*(run from inside `desktop/`; each target runs `copy-web` first automatically)*

## Mobile build (Capacitor / Android)

```bash
npm run android:add    # one-time: add the Android platform
npm run android:sync   # build + sync the web app into the Android project
npm run android:open   # open in Android Studio
# or, for a quick debug APK:
npm run android:apk
```

## Deployment

The repo includes ready-to-use configs for either host:

- **Netlify** — `netlify.toml` (build command, environment, redirects, headers)
- **Vercel** — `vercel.json` (build command, output directory, rewrites, headers)

Both are configured for a standard Vite SPA build (`npm run build` → `dist/`) with SPA
fallback routing.

## Supabase / backend setup

1. Create a Supabase project.
2. Apply the migrations in `supabase/migrations/` **in order** (core schema → realtime/
   presence/auth → pairing → invite status).
3. Enable **Anonymous sign-ins** under Authentication (the game authenticates players
   anonymously — no accounts/passwords).
4. Copy your project URL and publishable/anon key into `.env.local` as shown above.
5. Validate everything works end-to-end against your live project:
   ```bash
   npm run smoke
   ```

## Progressive Web App

Pawville is installable as a PWA out of the box:

- `public/manifest.webmanifest` describes the app for install prompts.
- `public/sw.js` is a versioned service worker that:
  - serves navigations network-first, falling back to a cached app shell when offline,
  - caches hashed build assets and icons cache-first,
  - **never** caches Supabase or any other cross-origin request, so auth/realtime/data stay
    live-only,
  - waits for the page to explicitly opt in before activating a new version, so a running
    session is never swapped out mid-play.

## Project documentation

The repository keeps a running history of major changes as separate Markdown/text files at
the project root, including (non-exhaustive): per-milestone reports (`PAWVILLE_MILESTONE*`,
`MILESTONE10_*`), subsystem notes (`PAWVILLE_FUNFAIR.md`, `PAWVILLE_HOME_UI.md`,
`PAWVILLE_NPC_REGIONS.md`, `PAWVILLE_BUMPER_COUPLE.md`, `PAWVILLE_STORY_AND_KARAOKE.md`,
`PAWVILLE_MULTIPLAYER_REPAIR.md`), and recovery/merge notes (`MERGE_REPORT.md`,
`RECOVERY_REPORT.md`, `REBUILD_STATUS.md`). Check these for the detailed "why" behind a
given subsystem before changing it.

## Credits

Pawville and Paw vs Paw are developed by **Yash Raj Sondhi**.
