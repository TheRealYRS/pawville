# Pawville — "The Song Beneath the Stars" + Karaoke expansion

## What was added
**Story (Acts I–III + epilogue)** — `src/pawville/story/`
| File | Role |
|---|---|
| `model.ts` | Story state (5 tones, scenes, picks, clues, phrases, bonds, cameos, journal, chime variant, finale) + sanitiser. Lives in `AdventureState.story`. |
| `progress.ts` | Read-only story view on `AdvView.story` (`v.story.done(...)`, `act()`, `velvetAtGate()`…). |
| `kit.ts`, `cast.ts` | Scene data helpers; speakers/portraits (Lumi, Biscuit, Mr. Velvet, Crumpet + residents). |
| `script1.ts` | Act I: chime, Biscuit, clues, broken chime (4 ways), closed gate, five notes. |
| `script_clues.ts` | 3 clue places, alternate sources (Kelp, Pemberton, Dewey, Lumi's notebook), resident memories. |
| `script2.ts` | Act II: 5 trail places, Biscuit's truth, Velvet's account, arrangement, gate opens. |
| `script3.ts` | Act III (temple, missing phrase, Hearthsong, Velvet lets go) + epilogue (Purring Cup, music evening, Velvet in the park). |
| `engine.ts` | Scene lookup, conversation building, resume-after-answers, apply/complete (idempotent), Lumi placement, objective line. |
| `journal.ts` | "The Story So Far" entries written as memories (text depends on your answers). |
| `world.ts` | Spots, companions, glyphs, and the new **temple** region. Reuses existing maps. |
| `pairing.ts` | Paired answers: `story:pick` messages, same outcome on both clients, each keeps their own tone, 25 s wait with "carry on". |
| `music.ts`, `musicPlayer.ts` | Original lullaby + 5 phrases + Hearthsong; arrangement follows your leading tone(s). Pure note data / Web Audio player. |

Also: `render/storyArt.ts` (chimes/bell/stone/gate/lantern/temple art), `components/StoryPanels.tsx` (Story So Far tab, hold-still "Listen" sheet), `audio/synth.ts` (shared synth + offline renderer).

**Karaoke** — `city/karaokeSongs.ts`, `karaokeBacking.ts`, `karaokeAudio.ts`
Existing songs untouched. Six new originals: *Pocket Full of Biscuits* (pop), *Cat Walk Groove* (funk), *Lighthouse Shanty* (6/8 sea shanty), *The Yarn Ball Disaster* (funny oom-pah), *Two Paws, One Umbrella* (duet, parts A/B/together), *Winter Lanterns* (cozy waltz). Each has its own tempo, mode, chords and arrangement (kick/snare/hat/shaker/tambourine/cowbell, bass, chords, counter-melody, count-in, fills, instrumental breaks). Lyric timing and band both derive from the song's bpm. Accurate taps add an accent; misses never stop the song. Band-volume slider + vocals-only (saved), clean stop on end/close/unmount. Unlocks (all persistent world state): Shanty = Pawport restored; Duet = Biscuit's Song done or Act I finished; Winter Lanterns = Frostbell reached.

## Edited existing files
`adventure/state.ts` (adds `story`, store v1→v2 migration, `sshared:` shared prefix, `AdvView.story`), `dialogue.ts` (types), `regionKit.ts` (spot fields, temple prop colliders), `regions.ts` (story NPCs/spots, temple), `content.ts` (temple in region list), `AdventureLayer.tsx` (scenes, answers, pairing, music, Listen sheet, glyphs), `AdventurePanels.tsx` (multi-speaker dialogue, Story tab, tracker), `ShowPanels.tsx` (karaoke band UI), `karaoke.ts`, `cityDistricts.ts` (Velvet leaves shop for the gate during the story), `render/adventureFx.ts`, `render/regionArt.ts`, `world/mapAudit.ts`, `styles/adventure.css`, `styles/city.css`, `scripts/interaction-audit.ts`, `package.json` (`npm run previews`), new `public/favicon.svg`.

## Design rules honoured
- Offline only; no AI service. Old saves load (story starts fresh). Existing quests/regions untouched.
- No soft locks: the test suite plays the whole story with 17 different answer policies and always reaches the epilogue; Act I clues each have 2–3 sources; Act II places in any order.
- Tones are tendencies, never a score; the journal never prints numbers.
- Lullaby is a story motif only, **not** a karaoke song.
- Secret choices / paired play: each partner's tone is their own; differences are recorded and never judged.

## Verified here
- 310/310 tests (31 new: story simulator, save migration, pairing, music, world reachability, karaoke/band), `map-audit` 0 issues, `interaction-audit` OK, `verify:files` OK.
- Type-check with `tsc --noEmit` against **stand-in React/Supabase types** (0 errors) — registry blocked, so the real `npm run build` was **not** run here.
- Temple map rendered and checked visually.
- 35 WAV preview recordings rendered; analysed objectively only (no clipping, non-silent, tempo on grid).

## NOT verified (please check locally)
1. `npm install && npm run build` (real React/Vite types).
2. **Listening**: nobody has listened to the previews or the live Web Audio output. Sound quality/mix is unjudged. Previews use an offline filter approximation of the browser's.
3. Real two-device paired play of story answers.
4. Visual look of the new glyphs and temple in a real browser (art was only checked in the software rasteriser).
5. Browser run-through of the Wind Steps hold-still sheet and the dialogue sheet on mobile.

## Apply
Copy the overlay over your project (same relative paths), then:
```
npm install
npm test
npm run build
npm run dev
npm run previews     # optional: re-render WAVs into ./previews
```
