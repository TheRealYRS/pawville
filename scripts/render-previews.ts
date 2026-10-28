/**
 * Renders PREVIEW recordings of the new music to WAV so a human can listen to it before shipping:
 *   node --experimental-strip-types scripts/render-previews.ts [outDir] [sampleRate]
 *
 *   outDir/karaoke/<song>.wav   the band + a soft whistle guide of the melody (all nine songs, full length)
 *   outDir/story/<cue>.wav      every story cue, and the Hearthsong arranged for each of the five tones
 *
 * They are rendered with the SAME note data and voice recipes the game plays (audio/synth.ts), but with an offline
 * approximation of the browser's filters. Whether any of it SOUNDS good is a human judgement: nobody has listened to these yet.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { SONGS } from '../src/pawville/city/karaoke.ts';
import { buildBacking, countIn, guideVocal } from '../src/pawville/city/karaokeBacking.ts';
import { renderOffline, toWav } from '../src/pawville/audio/synth.ts';
import { CUES, arrange, cueClip, PLACE_ORDER } from '../src/pawville/story/music.ts';
import { TONES, emptyStory } from '../src/pawville/story/model.ts';

const out = process.argv[2] ?? 'previews';
const sr = Number(process.argv[3] ?? 22050);
mkdirSync(join(out, 'karaoke'), { recursive: true });
mkdirSync(join(out, 'story'), { recursive: true });

let n = 0;
const save = (dir: string, name: string, notes: Parameters<typeof renderOffline>[0]) => {
  const pcm = renderOffline(notes, sr, 1.5);
  writeFileSync(join(out, dir, `${name}.wav`), toWav(pcm, sr));
  n++;
  console.log(`${dir}/${name}.wav  ${(pcm.length / sr).toFixed(1)}s`);
};

for (const s of SONGS) save('karaoke', s.id, [...countIn(s), ...buildBacking(s), ...guideVocal(s)]);

const full = { ...emptyStory(), phrases: [...PLACE_ORDER] };
for (const c of CUES) {
  const clip = cueClip(c, full);
  if (clip) save('story', c, clip.notes);
}
for (const t of TONES) save('story', `hearthsong-${t}`, arrange({ lead: [t], chime: null, phrases: [...PLACE_ORDER], finale: true }).notes);
save('story', 'hearthsong-mixed', arrange({ lead: [], chime: null, phrases: [...PLACE_ORDER], finale: true }).notes);
for (const c of ['careful', 'craft', 'improv', 'wait'] as const) save('story', `chime-${c}`, cueClip('chime-phrase', { ...emptyStory(), chime: c })!.notes);
console.log(`\n${n} recordings written to ${out}/ (sample rate ${sr} Hz, mono, 16-bit). Not yet listened to by a human.`);
