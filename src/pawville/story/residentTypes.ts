/** Types + helper for the resident personality profiles (residentsA/B/C.ts). Pure data; the logic is in residents.ts. */
export type RTone = 'friendly' | 'curious' | 'playful' | 'comforting' | 'skeptical' | 'mysterious';
export interface RChoice {
  tone: RTone; label: string;
  /** What they say right away. */
  reply: string;
  /** What they say on a LATER visit, remembering your answer (persistent memory). */
  back: string;
  /** How a friend would describe your answer: "{Friend} mentioned you {told}." (only friends hear about it). */
  told: string;
}
export const c = (tone: RTone, label: string, reply: string, back: string, told: string): RChoice => ({ tone, label, reply, back, told });

/**
 * When the follow-up conversation opens (besides friendship): 'morning' | 'day' | 'night' | 'rain' | 'flag:<adventure flag>' | 'story:<scene id>'.
 * Whatever the trigger, EVERY follow-up opens once the second act of the story is finished (nobody is ever locked out by the weather).
 */
export interface RProfile {
  id: string;
  /** Something they care about / a worry / a quirk (their own voice). Also shown in the journal's "People" page. */
  cares: string; worry: string; quirk: string;
  friend?: string;
  /** The personality-revealing conversation: a question and 2–3 replies. */
  q: string; opts: readonly RChoice[];
  /** The follow-up, unlocked by `ftrig`. */
  fq: string; fopts: readonly RChoice[]; ftrig: string;
  /** Something they plausibly know about, from local events: [adventure flag, their line]. */
  hear?: readonly [string, string];
}
