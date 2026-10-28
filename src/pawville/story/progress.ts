/**
 * Story progress as a read-only VIEW (pure). The adventure view (AdvView.story) is built from this, so every
 * spot, NPC and region in the game can ask "where is the story?" with a normal `when: (v) => v.story...` condition.
 *
 * Nothing in this file knows any dialogue; scene text lives in script*.ts and the engine (engine.ts).
 */
import { emptyStory, finaleVariant, leadingTones, PLACES, type Companion, type ChimeVariant, type Place, type StoryState, type Tone } from './model.ts';

export interface StoryBase {
  /** An adventure flag. */
  has(flag: string): boolean;
  /** An adventure quest is complete. */
  questDone(id: string): boolean;
}

export interface StoryView {
  readonly state: StoryState;
  /** The Lost Star is found: Lumi is free to wander and the old song can start to matter. */
  readonly unlocked: boolean;
  done(scene: string): boolean;
  clue(id: string): boolean;
  phrase(id: string): boolean;
  mark(id: string): boolean;
  cameo(id: string): boolean;
  pick(ask: string): string | undefined;
  partnerPick(ask: string): string | undefined;
  tone(t: Tone): number;
  leading(): Tone[];
  bond(c: Companion): number;
  chime(): ChimeVariant | null;
  finale(): string | null;
  epilogue(): boolean;
  /** 0 = not started (locked), 1..3 = the acts, 4 = epilogue. */
  act(): 0 | 1 | 2 | 3 | 4;
  placesDone(): Place[];
  phraseCount(): number;
  cluesFound(): number;
  /** Mr. Velvet stands at the old gate (instead of in his shop) from the broken-chime scene until the temple is open. */
  velvetAtGate(): boolean;
  gateOpen(): boolean;
}

/** The three optional clue spots of Act I (any one of them is enough to go on). */
export const CLUE_PLACES = ['harbor', 'garden', 'archive'] as const;

export function makeStoryView(s: StoryState = emptyStory(), base: StoryBase = { has: () => false, questDone: () => false }): StoryView {
  const done = new Set(s.done), clues = new Set(s.clues), phrases = new Set(s.phrases), marks = new Set(s.marks), cameos = new Set(s.cameos);
  const unlocked = base.questDone('lost-star') || base.has('lumi-home') || base.has('constellation-lumi');
  const act = (): 0 | 1 | 2 | 3 | 4 => (!unlocked ? 0 : !done.has('a1-end') ? 1 : !done.has('a2-gate') ? 2 : !done.has('a3-letgo') ? 3 : 4);
  return {
    state: s, unlocked,
    done: (id) => done.has(id), clue: (id) => clues.has(id), phrase: (id) => phrases.has(id), mark: (id) => marks.has(id), cameo: (id) => cameos.has(id),
    pick: (a) => s.picks[a], partnerPick: (a) => s.partner[a],
    tone: (t) => s.tones[t], leading: () => leadingTones(s), bond: (c) => s.bonds[c],
    chime: () => s.chime, finale: () => s.finale ?? (done.has('a3-hearthsong') ? finaleVariant(s) : null), epilogue: () => s.epilogue || done.has('a3-letgo'),
    act,
    placesDone: () => PLACES.filter((p) => phrases.has(p)),
    phraseCount: () => PLACES.filter((p) => phrases.has(p)).length,
    cluesFound: () => CLUE_PLACES.filter((c) => clues.has(`clue:${c}`)).length,
    velvetAtGate: () => unlocked && done.has('a1-chime-repair') && !done.has('a3-letgo'),
    gateOpen: () => done.has('a2-gate'),
  };
}
