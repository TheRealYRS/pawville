/**
 * Optional ambient soundscape (rain, wind, water, birds, night insects), synthesised with Web
 * Audio — no audio files. OFF by default; it only starts after the player turns it on (a user
 * gesture), and fades gently between weathers. Independent from the game's effect sounds.
 */
import type { Environment } from './world/environment.ts';

export interface Ambience {
  set(env: Environment, nearWater: boolean): void;
  stop(): void;
}

export function startAmbience(volume = 0.5): Ambience | null {
  const AC = (window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }).AudioContext
    ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  const ctx = new AC();
  const master = ctx.createGain();
  master.gain.value = volume * 0.5;
  master.connect(ctx.destination);
  const noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const data = noiseBuffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const layer = (type: BiquadFilterType, freq: number, q = 0.7) => {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = freq;
    filter.Q.value = q;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    src.connect(filter).connect(gain).connect(master);
    src.start();
    return gain;
  };
  const rain = layer('highpass', 1200);
  const wind = layer('bandpass', 400, 0.4);
  const water = layer('lowpass', 500);
  const chirps = ctx.createGain();
  chirps.gain.value = 0;
  chirps.connect(master);
  let mode: 'birds' | 'insects' | 'none' = 'none';
  const chirpTimer = window.setInterval(() => {
    if (mode === 'none' || chirps.gain.value < 0.01) return;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'sine';
    const base = mode === 'birds' ? 2400 + Math.random() * 1600 : 4200 + Math.random() * 300;
    o.frequency.setValueAtTime(base, ctx.currentTime);
    if (mode === 'birds') o.frequency.exponentialRampToValueAtTime(base * 1.3, ctx.currentTime + 0.08);
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(mode === 'birds' ? 0.08 : 0.03, ctx.currentTime + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + (mode === 'birds' ? 0.15 : 0.06));
    o.connect(g).connect(chirps);
    o.start();
    o.stop(ctx.currentTime + 0.2);
  }, 700);
  const ramp = (g: GainNode, v: number) => g.gain.setTargetAtTime(v, ctx.currentTime, 1.2);
  return {
    set(env, nearWater) {
      if (ctx.state === 'suspended') void ctx.resume();
      const r = env.weather === 'heavy-rain' ? 0.5 : env.weather === 'light-rain' ? 0.25 : 0;
      ramp(rain, r);
      ramp(wind, env.weather === 'windy' ? 0.35 : Math.abs(env.wind) * 0.12);
      ramp(water, nearWater ? 0.25 : 0.04);
      const rainy = r > 0 || env.weather === 'snow';
      mode = rainy ? 'none' : env.darkness > 0.5 ? 'insects' : 'birds';
      ramp(chirps, mode === 'none' ? 0 : 1);
    },
    stop() {
      window.clearInterval(chirpTimer);
      void ctx.close();
    },
  };
}
