/**
 * Plays the karaoke band on the game's ONE shared AudioContext (lib/soundService: sound is off until the player turns it on,
 * which is also the game's autoplay-safe gesture). Notes come from karaokeBacking.ts and are scheduled in short look-ahead
 * windows, so a song never creates thousands of audio nodes at once and can be stopped instantly and cleanly:
 * when it ends, when the player picks another song, when the panel closes, and when the component unmounts.
 *
 * Settings (backing volume, vocals-only) are one tiny versioned record, like every other Pawville preference.
 */
import { scheduleWebAudio, type Note } from '../audio/synth.ts';
import { sharedAudioContext } from '../../lib/soundService';
import { bool, createStore, isObj, num } from '../persistence.ts';
import { buildBacking, countIn, tapAccent } from './karaokeBacking.ts';
import type { KaraokeSong } from './karaoke.ts';

export interface KaraokeAudioPrefs { /** 0..1 */ backing: number; vocalsOnly: boolean }
export const karaokePrefs = () => createStore<KaraokeAudioPrefs>({
  key: 'karaoke-audio', version: 1,
  defaults: () => ({ backing: 0.7, vocalsOnly: false }),
  sanitize: (raw) => ({ backing: isObj(raw) ? num(raw.backing, 0.7, 0, 1) : 0.7, vocalsOnly: isObj(raw) ? bool(raw.vocalsOnly) : false }),
});

export interface BandHandle {
  /** Milliseconds between calling startBand() and song time 0 (the lyrics clock must start this much later). */
  leadMs: number;
  stop(): void;
  setVolume(v: number): void;
  setVocalsOnly(on: boolean): void;
  /** A tiny musical accent for an accurate tap. */
  accent(grade: 'perfect' | 'good', freq: number): void;
}

const LEAD_S = 0.12;
const WINDOW_S = 4;

/** Starts the count-in and the band. Returns null when sound is off or unavailable (the song is still playable: just silent). */
export function startBand(song: KaraokeSong, prefs: KaraokeAudioPrefs): BandHandle | null {
  const ac = sharedAudioContext();
  if (!ac) return null;
  try {
    const compressor = ac.createDynamicsCompressor();
    compressor.threshold.value = -14; compressor.ratio.value = 4;
    const master = ac.createGain();
    master.gain.value = 0.9 * prefs.backing;
    const clicks = ac.createGain();
    clicks.gain.value = 0.6 + 0.4 * prefs.backing;
    master.connect(compressor); clicks.connect(compressor); compressor.connect(ac.destination);

    const t0 = ac.currentTime + LEAD_S;
    const band: Note[] = buildBacking(song);
    let vocalsOnly = prefs.vocalsOnly;
    let next = 0;
    let stopped = false;
    const stoppers: (() => void)[] = [];
    stoppers.push(scheduleWebAudio(ac, clicks, countIn(song), t0));

    const pump = () => {
      if (stopped) return;
      const now = ac.currentTime - t0;
      if (vocalsOnly) { while (next < band.length && band[next].t < now + WINDOW_S) next++; return; }
      const from = next;
      while (next < band.length && band[next].t < now + WINDOW_S) next++;
      if (next > from) {
        const chunk = band.slice(from, next).filter((n) => n.t >= now - 0.05); // never schedule notes that are already in the past
        if (chunk.length) stoppers.push(scheduleWebAudio(ac, master, chunk, t0));
      }
    };
    pump();
    const timer = window.setInterval(pump, 700);

    const stopAll = (fade: boolean) => {
      for (const s of stoppers.splice(0)) { try { s(); } catch { /* ignore */ } }
      if (fade) { try { master.gain.cancelScheduledValues(ac.currentTime); master.gain.setTargetAtTime(0, ac.currentTime, 0.03); } catch { /* ignore */ } }
    };
    return {
      leadMs: LEAD_S * 1000,
      stop() {
        if (stopped) return;
        stopped = true; window.clearInterval(timer); stopAll(true);
        window.setTimeout(() => { try { master.disconnect(); clicks.disconnect(); compressor.disconnect(); } catch { /* ignore */ } }, 400);
      },
      setVolume(v) { try { master.gain.setTargetAtTime(0.9 * v, ac.currentTime, 0.05); clicks.gain.setTargetAtTime(0.6 + 0.4 * v, ac.currentTime, 0.05); } catch { /* ignore */ } },
      setVocalsOnly(on) {
        if (on === vocalsOnly) return;
        vocalsOnly = on;
        if (on) { for (const s of stoppers.splice(1)) { try { s(); } catch { /* ignore */ } } } // keep the count-in's stopper (index 0)
        else { next = band.findIndex((n) => n.t >= ac.currentTime - t0); if (next < 0) next = band.length; pump(); }
      },
      accent(grade, freq) {
        try { stoppers.push(scheduleWebAudio(ac, master, tapAccent(grade, 0, freq), ac.currentTime + 0.005)); } catch { /* ignore */ }
      },
    };
  } catch {
    return null;
  }
}
