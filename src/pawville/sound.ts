/**
 * Game sound cues on top of the existing Paw vs Paw sound service (so the global mute toggle and
 * autoplay rules are respected). Each cue is rate-limited to avoid sound spam.
 */
import { sfx } from '../lib/soundService';

type Cue = 'tap' | 'pop' | 'nope' | 'click' | 'join' | 'victory' | 'purr';
const lastAt: Partial<Record<Cue, number>> = {};
const MIN_GAP: Record<Cue, number> = { tap: 45, pop: 70, nope: 120, click: 60, join: 400, victory: 800, purr: 3000 };

export function cue(name: Cue): void {
  const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
  if (now - (lastAt[name] ?? -Infinity) < MIN_GAP[name]) return;
  lastAt[name] = now;
  try {
    if (name === 'purr') sfx.purr();
    else sfx[name]();
  } catch {
    /* audio not available */
  }
}
