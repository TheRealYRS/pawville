/**
 * The Bijou cinema (Milestone 8.2): short animated films you actually watch.
 *
 * A film is a list of scenes; each scene names a backdrop and the actors in it and runs for a
 * fixed time with a caption. `render/filmArt.ts` paints a scene at any moment (pixel art on a
 * canvas). Which films are showing depends on what you've done in the world. Pure and unit tested.
 */
import type { AdvView } from '../adventure/state.ts';

export type FilmBackdrop = 'sea-night' | 'sea-storm' | 'harbor-dawn' | 'forest-night' | 'sky-fall' | 'meadow' | 'clock-square' | 'clock-face' | 'rooftops-night' | 'title';
export type FilmActor = 'boat' | 'sailor' | 'lighthouse' | 'lighthouse-lit' | 'star' | 'star-fall' | 'lumi' | 'two-cats' | 'kitten' | 'clock-11' | 'clock-12' | 'lamplighter' | 'key' | 'moon' | 'fireflies' | 'birds';

export interface FilmScene {
  backdrop: FilmBackdrop;
  actors: readonly FilmActor[];
  caption: string;
  ms: number;
  /** Old films are shown in black and white. */
  mono?: boolean;
}

export interface Film {
  id: string;
  title: string;
  blurb: string;
  /** Shown only when this returns true (default: always). */
  showing?: (v: AdvView) => boolean;
  scenes: readonly FilmScene[];
}

export const TICKET_PRICE = 1;

export const FILMS: readonly Film[] = [
  {
    id: 'whiskers-at-sea', title: 'Whiskers at Sea', blurb: 'An old black-and-white picture about a sailor cat called Marlow.',
    scenes: [
      { backdrop: 'title', actors: [], caption: 'WHISKERS AT SEA — a Bijou Picture', ms: 3200, mono: true },
      { backdrop: 'harbor-dawn', actors: ['boat', 'sailor', 'birds'], caption: 'Every morning, young Marlow rowed out past the harbour wall.', ms: 4200, mono: true },
      { backdrop: 'sea-storm', actors: ['boat', 'sailor'], caption: 'One night a storm rolled in. The waves were taller than the mast.', ms: 4200, mono: true },
      { backdrop: 'sea-storm', actors: ['boat', 'lighthouse-lit'], caption: 'Then, through the rain: a light on the far shore.', ms: 4000, mono: true },
      { backdrop: 'sea-night', actors: ['boat', 'sailor', 'lighthouse-lit', 'moon'], caption: 'He followed it home, and promised to keep that light burning forever.', ms: 4600, mono: true },
      { backdrop: 'title', actors: [], caption: 'THE END', ms: 2400, mono: true },
    ],
  },
  {
    id: 'star-who-fell', title: 'The Star Who Fell', blurb: 'A tiny glowing creature lands in a forest… you could swear you’ve met her.',
    showing: (v) => v.done('lost-star'),
    scenes: [
      { backdrop: 'title', actors: ['star'], caption: 'THE STAR WHO FELL', ms: 3000 },
      { backdrop: 'sky-fall', actors: ['star-fall', 'moon'], caption: 'High above the bay, one small star slipped out of her constellation.', ms: 4200 },
      { backdrop: 'forest-night', actors: ['lumi', 'fireflies'], caption: 'She landed in Whisperwood, lost and far too dim to fly.', ms: 4200 },
      { backdrop: 'forest-night', actors: ['lumi', 'two-cats', 'fireflies'], caption: 'Two cats found her. They didn’t know the way to the sky — so they made one.', ms: 4800 },
      { backdrop: 'sky-fall', actors: ['lumi', 'moon'], caption: 'Five stars, one tail. She waves at them every clear night.', ms: 4400 },
      { backdrop: 'title', actors: ['star'], caption: 'THE END', ms: 2400 },
    ],
  },
  {
    id: 'stopped-at-eleven', title: 'Stopped at Eleven', blurb: 'The true story of the Whiskerwick clock — now that the mystery is solved.',
    showing: (v) => v.has('clock-fixed'),
    scenes: [
      { backdrop: 'title', actors: [], caption: 'STOPPED AT ELEVEN', ms: 3000 },
      { backdrop: 'clock-square', actors: ['clock-11', 'lamplighter'], caption: 'A hundred years ago, the lamplighter wound the great clock every night.', ms: 4400 },
      { backdrop: 'rooftops-night', actors: ['lamplighter', 'key', 'moon'], caption: 'When she retired, she hid the key up among her beloved chimneys.', ms: 4400 },
      { backdrop: 'clock-face', actors: ['clock-11'], caption: 'And so the clock waited. Eleven o’clock, for a whole century.', ms: 4000 },
      { backdrop: 'clock-face', actors: ['clock-12', 'birds'], caption: 'Until two curious cats climbed the rooftops — and set it ringing again.', ms: 4600 },
      { backdrop: 'title', actors: [], caption: 'THE END', ms: 2400 },
    ],
  },
];

export function filmById(id: string): Film | undefined {
  return FILMS.find((f) => f.id === id);
}

export function showingFilms(v: AdvView): Film[] {
  return FILMS.filter((f) => !f.showing || f.showing(v));
}

export function filmLength(f: Film): number {
  return f.scenes.reduce((a, s) => a + s.ms, 0);
}

/** Which scene is on screen `ms` after the film started, and how far into it (0..1). */
export function filmAt(f: Film, ms: number): { index: number; scene: FilmScene; k: number; sceneMs: number; done: boolean } {
  let t = Math.max(0, ms);
  for (let i = 0; i < f.scenes.length; i++) {
    const s = f.scenes[i];
    if (t < s.ms) return { index: i, scene: s, k: t / s.ms, sceneMs: t, done: false };
    t -= s.ms;
  }
  const lastI = f.scenes.length - 1;
  return { index: lastI, scene: f.scenes[lastI], k: 1, sceneMs: f.scenes[lastI].ms, done: true };
}

/** Fade to/from black at scene changes (0 = black, 1 = full picture). */
export function sceneFade(sceneMs: number, sceneLen: number, fadeMs = 350): number {
  return Math.max(0, Math.min(1, sceneMs / fadeMs, (sceneLen - sceneMs) / fadeMs));
}
