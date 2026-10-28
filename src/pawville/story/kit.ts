/** Tiny helpers for writing scenes as data (script*.ts). */
import type { StoryFx, Tone } from './model.ts';
import type { AdvView, RegionId } from '../adventure/state.ts';

/** One spoken (or narrated) line. */
export interface L { w: string; t: string }
export interface Opt { id: string; label: string; tone: Tone; say: L[]; fx?: StoryFx; next?: Page }
export interface Ask { id: string; secret?: boolean; opts: Opt[] }
/** A page: lines, then either a question or the end of the scene. */
export interface Page { say: L[]; ask?: Ask; /** A button on the last line that plays a music cue (see music.ts). */ listen?: { label: string; cue: string } }

export interface Ctx { phase: string; rain: boolean }

export interface Scene {
  id: string;
  act: 1 | 2 | 3 | 4;
  title: string;
  region: RegionId;
  /** Triggered by talking to this NPC (the NPC's spot already exists)… */
  npc?: string;
  /** …or by using this spot (created by story/world.ts). */
  spot?: { id: string; label: string; x: number; y: number; radius?: number; glyph?: Glyph };
  /** Lumi waits here while this scene is the next thing to do (so she can be found). */
  lumi?: { x: number; y: number };
  /** Stand still this many ms before the scene opens (the Wind Steps). */
  hold?: number;
  avail: (v: AdvView) => boolean;
  page: (v: AdvView, c: Ctx) => Page;
  /** What finishing the conversation changes (questions apply their own effects as you answer). */
  done?: StoryFx;
  /** Shown instead of the normal conversation once the scene is done (null = fall back to normal talk). */
  after?: (v: AdvView, c: Ctx) => Page | null;
  /** The objective line for the journal / tracker while this scene is next. */
  goal: string;
  hint: string;
}

/** One story object to draw on the current map (computed from the story state by world.ts). */
export interface StoryGlyph { id: string; glyph: Glyph; x: number; y: number; state?: string; read?: boolean }

/** What a story spot looks like on the map (drawn by render/storyArt.ts). */
export type Glyph = 'chime' | 'chime-fixed' | 'fogbell' | 'stone' | 'archive' | 'gate' | 'steps' | 'lantern5' | 'gardenchime' | 'echo' | 'rise' | 'mark' | 'hearth';

export const say = (w: string, t: string): L => ({ w, t });
export const lumi = (t: string): L => say('lumi', t);
export const biscuit = (t: string): L => say('biscuit', t);
export const velvet = (t: string): L => say('velvet', t);
export const crumpet = (t: string): L => say('crumpet', t);
export const narr = (t: string): L => say('narr', t);

export const opt = (id: string, tone: Tone, label: string, lines: L[], fx?: StoryFx, next?: Page): Opt => ({ id, tone, label, say: lines, fx, next });
export const ask = (id: string, opts: Opt[], secret = false): Ask => ({ id, opts, secret });
