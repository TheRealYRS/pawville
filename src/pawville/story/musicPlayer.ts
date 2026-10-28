/**
 * Plays story music cues on the game's ONE shared AudioContext (lib/soundService). Kept separate from music.ts so the
 * note data stays pure (testable in Node, renderable to WAV previews). Sound off or unavailable = silently nothing.
 */
import { scheduleWebAudio } from '../audio/synth.ts';
import { sharedAudioContext } from '../../lib/soundService';
import type { StoryState } from './model.ts';
import { cueClip } from './music.ts';

let stopCurrent: (() => void) | null = null;
let master: GainNode | null = null;

/** Stop whatever story music is playing (cleanly). Safe to call at any time. */
export function stopStoryMusic(): void {
  try { stopCurrent?.(); } catch { /* ignore */ }
  stopCurrent = null;
}

/** Play a cue. Returns false when sound is off or unavailable (nothing breaks). */
export function playCue(cue: string, s?: StoryState, volume = 0.8): boolean {
  const ac = sharedAudioContext();
  if (!ac) return false;
  const c = cueClip(cue, s);
  if (!c) return false;
  stopStoryMusic();
  try {
    if (!master || master.context !== ac) { master = ac.createGain(); master.connect(ac.destination); }
    master.gain.cancelScheduledValues(ac.currentTime);
    master.gain.setValueAtTime(volume, ac.currentTime);
    stopCurrent = scheduleWebAudio(ac, master, c.notes, ac.currentTime + 0.05);
    return true;
  } catch { return false; }
}
