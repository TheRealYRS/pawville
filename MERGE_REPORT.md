# Pawville — your old project merged with all fixes and additions

## What this is
Your uploaded project (the story + karaoke + music build) with everything from the later milestones applied on top. The merge was done as a real git three-way merge (baseline → your project, then the fix commits replayed onto it), not by overwriting files.

## Your music and story are untouched
Byte-for-byte identical to your upload (checked with `cmp`): `audio/synth.ts`, `story/music.ts`, `story/musicPlayer.ts`, `story/pairing.ts`, `story/script1.ts`, `script2.ts`, `script3.ts`, `script_clues.ts`, `story/journal.ts`, `city/karaoke.ts`, `karaokeBacking.ts`, `karaokeAudio.ts`, `components/ShowPanels.tsx`, `scripts/render-previews.ts`.
Only two lines differ, in `city/karaokeSongs.ts` and `story/engine.ts`. **The context export you uploaded had replaced two code fragments with `[REDACTED: Credential assignment]` (false positives on a parameter called `token` and a field called `secret`).** I restored them exactly: `token: string` and `secret: ask.secret`. If your real files are fine (they should be), these two lines are identical to yours.

## What was added on top of your project
**Fixes (replayed from the fix milestone)**
* Benches seat two cats side by side (per-seat occupancy, 18 px apart, drawn in front of the bench); region benches, window seats, blankets and gazebos too.
* Funfair rides: seats are claimed by player id for *every* player in the park; conflicts resolve identically on all clients; remote riders are drawn from the shared ride clock (no lagging, no floating, correct draw order).
* Eyes: the night-glow / glowing-eye overlay now follows the body bob (walk, run, sit) and head tilt.
* PC conversation keys: **E / Space / Enter** next line, **1–9** pick a reply, **↑↓** highlight then **E/Enter** confirm, **Esc** close. Held keys can't skip; typing fields and modals keep the keyboard. They are wired into **your** dialogue sheet, so your partner-waiting, paired choices and "♪ Hear" button all still work (while waiting for a partner only Esc acts).
* Multiplayer ownership: audited; cross-control **not reproduced** (see below).

**Part 7 — NPC personalities (on your story engine)**
* All 63 characters (44 residents + 19 quest characters; Lumi keeps her story arc) get a personality conversation with 2–3 replies, a follow-up that opens on its own trigger (weather / time / a world event / a story step — and always after Act II), remembered answers, friend-only gossip, and a new **People** journal page. Before: 8 characters had choices; 0 of 44 residents.
* Resident chats feed the same gentle tone tendency as your story (never a score).
* **Latent save bug fixed:** saved choices/friendships were silently cut at 60 entries (63 characters × 2 answers would lose memories on reload). Caps raised.
* The personality layer never overrides a conversation that already offers choices, and your story scenes take priority over it.

## What was NOT carried over (and why)
In the previous milestone I had rewritten the story from scratch (35 scenes) because your earlier story wasn't in the workspace. **That rewrite is not in this build.** Your story (38 scenes: Act I 13 · Act II 18 · Act III 4 · Epilogue 3, with paired choices, secret choices, music cues, the Hear buttons and the hold-still listening sheet) already covers Part 8 and does more, so I kept yours and dropped the duplicate. Nothing of yours was replaced by it.

## Conflicts I had to resolve by hand (3 files)
* `adventure/AdventureLayer.tsx` — kept your story wiring (listening, pairing, music) + my seat/bench changes.
* `components/AdventurePanels.tsx` — your `DialogueSheet` (pages, partner waiting, Hear button) is the base; the keyboard layer was added to it.
* `styles/adventure.css` — both sets of rules kept.
Automatic merges: `interaction-audit.ts`, `mapAudit.ts`, `package.json` (your `previews` script kept).
**One regression I caught and fixed during testing:** after the merge, ↓ then Enter picked the first reply because the highlight keys were being debounced; the fix from the other branch hadn't come across. Fixed and re-verified.

## Verification — what was actually run on THIS merged tree
* `tsc --noEmit` (stand-in React/Supabase types): clean. **350 / 350** unit tests (your 310 + 31 fix tests + 9 resident tests). `map-audit` 0 issues, `interaction-audit` OK, `verify:files` 191 files OK.
* Real Chromium, real game code (one tab = one player; realtime mocked in the browser, **not Supabase**); logs in `tests/browser/logs/`:
  * ownership / disconnect / reconnect **9/9** · conversation keys **7/7** · rides: Ferris **10/10**, Carousel **9/9**, Swing **9/9** · two players on one bench: x=321 and x=339, side by side · two players boarding the same ride seat at once: 16 samples, 0 on the same seat
  * story + residents **17/17** (a story scene played with the keyboard; a resident's answer remembered after a fresh page load; People and Story So Far pages) · Wind Steps stand-still + temple **9/9**
  * **karaoke + music 16/16** with sound ON: nine songs listed (your three originals + six new), unlock locks, band controls, singing and leaving the stage, the journal's Hear button — no console errors.
* Music previews regenerated from this tree (35 MP3s).

## NOT verified — be careful
* **Nobody has listened to any audio.** Headless Chromium proves the audio code runs without errors; it does not prove the music sounds good. The preview MP3s are an offline approximation of the in-browser sound.
* **Real Supabase / real devices / real latency**: all multiplayer runs used the in-browser mock. Paired story answers between two real players were not run.
* Your paired-choice "waiting for partner" flow with the new keyboard keys: logic reviewed and type-checked, **not run in a browser**.
* Acts II–III beyond the Wind Steps and temple walk, the epilogue scenes, and the two-rider Carousel/Swing were not driven in a browser (the story simulator in your own test suite covers the logic).
* `npm run build` (real Vite) was not run (registry blocked).
* **"Control shifts between cats":** not reproduced in 2–3 real tabs; no fix made. If you still see it on real devices, send me the steps.

## Binary files
The context export contains text files only, so this zip has **no binary assets** (icons, `public/favicon.svg`, `package-lock.json`, fonts, `node_modules`). Copy the zip's contents over your existing project folder; do not use it as a standalone project. I deliberately left `public/favicon.svg` out so yours is not overwritten.

## Changed vs your old project (45 files, excluding logs)
24 new, 21 modified — listed in `CHANGES_VS_OLD.txt`.
