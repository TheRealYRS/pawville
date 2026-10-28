/**
 * "The Song Beneath the Stars" — story state (pure, no React, no audio).
 *
 * The story lives INSIDE the adventure save (AdventureState.story), so it is versioned, sanitised and size-capped
 * like every other Pawville record, merges with the existing flag/choice/friend systems and never needs a second store.
 * Old saves have no `story` field: sanitizeStory() simply starts them at the beginning.
 *
 * The five tones of nature are a *tendency*, not a morality score: nothing here punishes a preferred tone.
 */
import { arr, isObj, num } from '../persistence.ts';

export const TONES = ['kindness', 'curiosity', 'courage', 'patience', 'playfulness'] as const;
export type Tone = (typeof TONES)[number];

export const TONE_INFO: Record<Tone, { name: string; gist: string; color: string }> = {
  kindness: { name: 'Kindness', gist: 'noticing needs and making room for others', color: '#ff9db0' },
  curiosity: { name: 'Curiosity', gist: 'asking questions and looking past first impressions', color: '#7fc8ff' },
  courage: { name: 'Courage', gist: 'speaking honestly and taking responsibility', color: '#ffb85c' },
  patience: { name: 'Patience', gist: 'listening, waiting and letting others set the pace', color: '#9fe0c0' },
  playfulness: { name: 'Playfulness', gist: 'laughing, improvising and easing the fear', color: '#c8a2ff' },
};

/** Resident conversation tones map onto the five tones, so ordinary chats feed the same gentle tendency (never a score). */
export const CHOICE_TONE: Record<string, Tone> = { friendly: 'kindness', comforting: 'kindness', curious: 'curiosity', mysterious: 'curiosity', skeptical: 'courage', playful: 'playfulness' };
export const toneOfChoice = (t: string): Tone | null => ((TONES as readonly string[]).includes(t) ? (t as Tone) : CHOICE_TONE[t] ?? null);

export const COMPANIONS = ['lumi', 'biscuit', 'velvet', 'crumpet'] as const;
export type Companion = (typeof COMPANIONS)[number];

/** The five places on the old trail, in the order the five notes of the melody name them. */
export const PLACES = ['wind', 'lantern', 'garden', 'echo', 'rise'] as const;
export type Place = (typeof PLACES)[number];
export const PLACE_NAMES: Record<Place, string> = { wind: 'The Wind Steps', lantern: 'The Harbour Lantern', garden: 'The Listening Garden', echo: 'The Echo Bridge', rise: 'The Watcher’s Rise' };

/** How the first broken chime was mended (changes its look, a resident's reaction and a musical variation). */
export type ChimeVariant = 'careful' | 'craft' | 'improv' | 'wait';
export const CHIME_VARIANTS: readonly ChimeVariant[] = ['careful', 'craft', 'improv', 'wait'];

export interface StoryState {
  /** Times each tone was chosen (0..60). */
  tones: Record<Tone, number>;
  /** Finished scene ids. */
  done: string[];
  /** MY answer to each question (ask id → option id). */
  picks: Record<string, string>;
  /** My partner's answer where we answered together and differently (kept for the recap only). */
  partner: Record<string, string>;
  clues: string[];
  /** Musical phrases collected: the five places, plus 'lullaby', 'biscuit', 'crumpet', 'temple'. */
  phrases: string[];
  bonds: Record<Companion, number>;
  /** Small environmental things done (garden strings untangled, temple wall marks read…). */
  marks: string[];
  /** Residents who have shared a memory with you (they are mentioned in the finale and epilogue). */
  cameos: string[];
  /** Journal entries unlocked, in the order you found them. */
  journal: string[];
  chime: ChimeVariant | null;
  /** The shape of your ending: 'kindness' | … | 'mixed'. */
  finale: string | null;
  epilogue: boolean;
}

export const emptyStory = (): StoryState => ({
  tones: { kindness: 0, curiosity: 0, courage: 0, patience: 0, playfulness: 0 },
  done: [], picks: {}, partner: {}, clues: [], phrases: [],
  bonds: { lumi: 0, biscuit: 0, velvet: 0, crumpet: 0 },
  marks: [], cameos: [], journal: [], chime: null, finale: null, epilogue: false,
});

const idOk = (x: unknown, max = 48): string | null => (typeof x === 'string' && x.length > 0 && x.length <= max && /^[a-z0-9:_\-.]+$/i.test(x) ? x : null);
const uniq = (xs: string[]) => [...new Set(xs)];

export function sanitizeStory(raw: unknown): StoryState {
  const r = isObj(raw) ? raw : {};
  const e = emptyStory();
  const tones = { ...e.tones };
  if (isObj(r.tones)) for (const t of TONES) tones[t] = Math.floor(num(r.tones[t], 0, 0, 60));
  const bonds = { ...e.bonds };
  if (isObj(r.bonds)) for (const c of COMPANIONS) bonds[c] = Math.floor(num(r.bonds[c], 0, 0, 10));
  const map = (x: unknown, max: number): Record<string, string> => {
    const out: Record<string, string> = {};
    if (isObj(x)) for (const [k, v] of Object.entries(x).slice(0, max)) { const id = idOk(k, 60); const val = idOk(v, 40); if (id && val) out[id] = val; }
    return out;
  };
  const chime = CHIME_VARIANTS.includes(r.chime as ChimeVariant) ? (r.chime as ChimeVariant) : null;
  return {
    tones, bonds, chime,
    done: uniq(arr(r.done, (x) => idOk(x), 80)),
    picks: map(r.picks, 90), partner: map(r.partner, 90),
    clues: uniq(arr(r.clues, (x) => idOk(x), 40)),
    phrases: uniq(arr(r.phrases, (x) => idOk(x), 12)),
    marks: uniq(arr(r.marks, (x) => idOk(x), 40)),
    cameos: uniq(arr(r.cameos, (x) => idOk(x), 40)),
    journal: uniq(arr(r.journal, (x) => idOk(x), 100)),
    finale: idOk(r.finale, 20),
    epilogue: r.epilogue === true,
  };
}

// ---- effects ---------------------------------------------------------------------------------

/** Everything a choice or a finished scene can change. All fields are optional and idempotent. */
export interface StoryFx {
  /** Extra tones on top of the option's own tone. */
  tone?: Tone | readonly Tone[];
  bond?: Partial<Record<Companion, number>>;
  clue?: readonly string[];
  phrase?: readonly string[];
  mark?: readonly string[];
  cameo?: readonly string[];
  /** Story-journal entries (see journal.ts). */
  journal?: readonly string[];
  chime?: ChimeVariant;
  finale?: string;
  epilogue?: boolean;
  /** Adventure-save flags (world flags, e.g. 'region:temple'). */
  flags?: readonly string[];
  /** A music cue to play (see music.ts CUES). */
  play?: string;
}

const addTo = (xs: string[], add: readonly string[] | undefined, max: number): string[] => {
  if (!add?.length) return xs;
  const have = new Set(xs);
  const fresh = add.filter((a) => !have.has(a));
  return fresh.length ? [...xs, ...fresh].slice(0, max) : xs;
};

/** Applies story-owned fields of an effect (flags and music are handled by the caller). */
export function applyStoryFx(s: StoryState, fx: StoryFx | undefined, ownTone?: Tone, sceneDone?: string): StoryState {
  let n = s;
  const extra: readonly Tone[] = fx?.tone === undefined ? [] : typeof fx.tone === 'string' ? [fx.tone] : fx.tone; const tones: Tone[] = [...(ownTone ? [ownTone] : []), ...extra];
  if (tones.length) {
    const t = { ...n.tones };
    for (const k of tones) t[k] = Math.min(60, t[k] + 1);
    n = { ...n, tones: t };
  }
  if (fx?.bond) {
    const b = { ...n.bonds };
    for (const [k, v] of Object.entries(fx.bond) as [Companion, number][]) b[k] = Math.max(0, Math.min(10, b[k] + v));
    n = { ...n, bonds: b };
  }
  const clues = addTo(n.clues, fx?.clue, 40);
  const phrases = addTo(n.phrases, fx?.phrase, 12);
  const marks = addTo(n.marks, fx?.mark, 40);
  const cameos = addTo(n.cameos, fx?.cameo, 40);
  const journal = addTo(n.journal, fx?.journal, 100);
  const done = sceneDone ? addTo(n.done, [sceneDone], 80) : n.done;
  if (clues !== n.clues || phrases !== n.phrases || marks !== n.marks || cameos !== n.cameos || journal !== n.journal || done !== n.done) n = { ...n, clues, phrases, marks, cameos, journal, done };
  if (fx?.chime && n.chime !== fx.chime) n = { ...n, chime: fx.chime };
  if (fx?.finale && n.finale !== fx.finale) n = { ...n, finale: fx.finale };
  if (fx?.epilogue && !n.epilogue) n = { ...n, epilogue: true };
  return n;
}

export function recordPick(s: StoryState, ask: string, opt: string): StoryState {
  return s.picks[ask] === opt ? s : { ...s, picks: { ...s.picks, [ask]: opt } };
}
export function recordPartnerPick(s: StoryState, ask: string, opt: string): StoryState {
  return s.partner[ask] === opt ? s : { ...s, partner: { ...s.partner, [ask]: opt } };
}

// ---- reading the tones gently -------------------------------------------------------------------

/** Tones ordered by how often you chose them (ties keep the canonical order). Only tones you have actually used. */
export function toneRanking(s: Pick<StoryState, 'tones'>): Tone[] {
  return [...TONES].filter((t) => s.tones[t] > 0).sort((a, b) => s.tones[b] - s.tones[a] || TONES.indexOf(a) - TONES.indexOf(b));
}

/** The leading tone(s): everything within one choice of the top. Up to two; none for a fresh save. */
export function leadingTones(s: Pick<StoryState, 'tones'>): Tone[] {
  const r = toneRanking(s);
  if (!r.length) return [];
  const top = s.tones[r[0]];
  const close = r.filter((t) => s.tones[t] >= top - 1);
  return close.length >= 4 ? [] : close.slice(0, 2);
}

/** The finale's shape: a single tone when one clearly leads, otherwise 'mixed'. */
export function finaleVariant(s: Pick<StoryState, 'tones'>): string {
  const lead = leadingTones(s);
  return lead.length === 1 ? lead[0] : 'mixed';
}

/** A gentle sentence about how you tend to approach things (journal). Never a score. */
export function toneSummary(s: Pick<StoryState, 'tones'>): string {
  const lead = leadingTones(s);
  if (!lead.length) return 'You have not settled into one way of doing things yet — and that is perfectly fine.';
  const gist = (t: Tone) => TONE_INFO[t].gist;
  if (lead.length === 1) return `Lately you have leaned towards ${TONE_INFO[lead[0]].name.toLowerCase()}: ${gist(lead[0])}.`;
  return `Lately you have leaned towards ${TONE_INFO[lead[0]].name.toLowerCase()} and ${TONE_INFO[lead[1]].name.toLowerCase()}: ${gist(lead[0])}, and ${gist(lead[1])}.`;
}
