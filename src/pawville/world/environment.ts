/**
 * Weather and time of day.
 *
 * Shared by construction: weather is derived from a deterministic schedule keyed on UTC time
 * (20-minute slots, seeded by the slot number), so every client that shows "live" weather sees
 * the same conditions at the same moment without a server. Time of day follows either the
 * player's local clock ("real") or a 24-minute "cozy" loop shared via UTC. A manual override is
 * possible for photos but is clearly LOCAL ONLY.
 */
import { clamp, hashString, seededRandom } from './geometry.ts';

export type Weather = 'sunny' | 'cloudy' | 'light-rain' | 'heavy-rain' | 'snow' | 'windy' | 'fog';
export const WEATHERS: readonly Weather[] = ['sunny', 'cloudy', 'light-rain', 'heavy-rain', 'snow', 'windy', 'fog'];
export type DayPhase = 'morning' | 'afternoon' | 'sunset' | 'evening' | 'night';
export type Season = 'spring' | 'summer' | 'autumn' | 'winter';

export const WEATHER_SLOT_MS = 20 * 60 * 1000;
export const COZY_DAY_MS = 24 * 60 * 1000;

export interface EnvSettings {
  clock: 'real' | 'cozy';
  /** null = live shared weather. */
  weatherOverride: Weather | null;
  /** null = follow the clock. 0..24 hours. LOCAL ONLY. */
  hourOverride: number | null;
}

export const DEFAULT_ENV_SETTINGS: EnvSettings = { clock: 'cozy', weatherOverride: null, hourOverride: null };

export interface Environment {
  weather: Weather;
  /** Previous weather and transition progress 0..1 (1 = fully current). */
  fromWeather: Weather;
  blend: number;
  hour: number; // 0..24
  phase: DayPhase;
  season: Season;
  /** 0 = full daylight, 1 = deepest night. */
  darkness: number;
  /** -1..1 wind strength for sway and particles. */
  wind: number;
  /** 0..1: how wet the ground is (puddles). Persists a while after rain. */
  wetness: number;
  /** 0..1: snow cover on the ground. */
  snowCover: number;
  /** true when the result doesn't come from the shared schedule. */
  localOnly: boolean;
}

export function seasonFor(date: Date): Season {
  const m = date.getUTCMonth();
  if (m <= 1 || m === 11) return 'winter';
  if (m <= 4) return 'spring';
  if (m <= 7) return 'summer';
  return 'autumn';
}

const TABLE: Record<Season, [Weather, number][]> = {
  spring: [['sunny', 4], ['cloudy', 3], ['light-rain', 3], ['heavy-rain', 1], ['windy', 2], ['fog', 1]],
  summer: [['sunny', 7], ['cloudy', 2], ['light-rain', 1], ['heavy-rain', 1], ['windy', 1]],
  autumn: [['sunny', 3], ['cloudy', 3], ['light-rain', 2], ['heavy-rain', 1], ['windy', 3], ['fog', 2]],
  winter: [['sunny', 2], ['cloudy', 3], ['snow', 5], ['fog', 2], ['windy', 1]],
};

/** The shared weather for a UTC slot. Same input → same weather on every device. */
export function weatherForSlot(slot: number, season: Season): Weather {
  const rand = seededRandom(hashString(`pawville-weather:${slot}`));
  const table = TABLE[season];
  const total = table.reduce((n, [, w]) => n + w, 0);
  let roll = rand() * total;
  for (const [w, weight] of table) {
    roll -= weight;
    if (roll < 0) return w;
  }
  return table[0][0];
}

export function hourFor(nowMs: number, settings: EnvSettings, localHourOfDate: number): number {
  if (settings.hourOverride !== null) return ((settings.hourOverride % 24) + 24) % 24;
  if (settings.clock === 'real') return localHourOfDate;
  // Cozy: one full day every 24 minutes, starting at 06:00 on the UTC epoch.
  return (((nowMs % COZY_DAY_MS) / COZY_DAY_MS) * 24 + 6) % 24;
}

export function phaseFor(hour: number): DayPhase {
  if (hour >= 5.5 && hour < 11) return 'morning';
  if (hour >= 11 && hour < 17) return 'afternoon';
  if (hour >= 17 && hour < 19.5) return 'sunset';
  if (hour >= 19.5 && hour < 21.5) return 'evening';
  return 'night';
}

/** Smooth darkness curve: dawn 5–7, dusk 17.5–21. */
export function darknessFor(hour: number): number {
  const s = (a: number, b: number, x: number) => {
    const t = clamp((x - a) / (b - a), 0, 1);
    return t * t * (3 - 2 * t);
  };
  if (hour < 12) return 1 - s(5, 7.5, hour);
  return s(17.5, 21, hour);
}

const isWet = (w: Weather) => w === 'light-rain' || w === 'heavy-rain';

export function computeEnvironment(nowMs: number, settings: EnvSettings, localDate: Date = new Date(nowMs)): Environment {
  const season = seasonFor(new Date(nowMs));
  const slot = Math.floor(nowMs / WEATHER_SLOT_MS);
  const liveNow = weatherForSlot(slot, season);
  const livePrev = weatherForSlot(slot - 1, season);
  const intoSlot = (nowMs - slot * WEATHER_SLOT_MS) / WEATHER_SLOT_MS;
  const weather = settings.weatherOverride ?? liveNow;
  const fromWeather = settings.weatherOverride ?? livePrev;
  // 90 seconds of cross-fade at the start of each slot.
  const blend = settings.weatherOverride ? 1 : clamp((intoSlot * WEATHER_SLOT_MS) / 90_000, 0, 1);
  const localHour = localDate.getHours() + localDate.getMinutes() / 60;
  const hour = hourFor(nowMs, settings, localHour);
  const windBase = weather === 'windy' ? 0.9 : weather === 'heavy-rain' ? 0.55 : weather === 'snow' ? 0.25 : 0.1;
  const wind = windBase * Math.sin(nowMs / 7000) * 0.4 + windBase * 0.6;
  // Ground stays wet for a while after rain stops.
  const wetness = isWet(weather) ? (weather === 'heavy-rain' ? 1 : 0.7) * blend + (isWet(fromWeather) ? 1 - blend : 0)
    : isWet(fromWeather) ? clamp(1 - intoSlot * 2.5, 0, 1) * 0.8 : 0;
  const snowCover = weather === 'snow' ? blend : fromWeather === 'snow' ? clamp(1 - intoSlot * 2, 0, 1) : 0;
  return {
    weather, fromWeather, blend, hour, phase: phaseFor(hour), season, darkness: darknessFor(hour), wind,
    wetness: clamp(wetness, 0, 1), snowCover, localOnly: settings.weatherOverride !== null || settings.hourOverride !== null,
  };
}

export function isAvailable(when: 'always' | 'wet' | 'night' | undefined, env: Pick<Environment, 'wetness' | 'darkness'>): boolean {
  if (!when || when === 'always') return true;
  if (when === 'wet') return env.wetness > 0.25;
  return env.darkness > 0.5;
}

/** Colour grade for the scene: multiply tint + additive glow. */
export interface Grade {
  tint: string;
  tintAlpha: number;
  glow: string;
  glowAlpha: number;
}

export function gradeFor(env: Environment): Grade {
  const overcast = env.weather === 'cloudy' || env.weather === 'fog' || env.weather.includes('rain') || env.weather === 'snow' ? 0.18 : 0;
  if (env.phase === 'sunset') return { tint: '#5a2d4f', tintAlpha: 0.18 + overcast * 0.5, glow: '#ff8a35', glowAlpha: 0.12 };
  if (env.phase === 'morning' && env.hour < 8) return { tint: '#3d3a6b', tintAlpha: 0.1 + env.darkness * 0.5, glow: '#ffc9a0', glowAlpha: 0.08 };
  const night = env.darkness;
  return { tint: '#4a3f7a', tintAlpha: Math.min(0.62, night * 0.6 + overcast), glow: '#ffd27a', glowAlpha: 0 }; // 8.1: lighter plum night (was #1b1840)
}

export const WEATHER_LABEL: Record<Weather, string> = {
  sunny: 'Sunny', cloudy: 'Cloudy', 'light-rain': 'Light rain', 'heavy-rain': 'Heavy rain', snow: 'Snow', windy: 'Windy', fog: 'Misty',
};
export const PHASE_LABEL: Record<DayPhase, string> = { morning: 'Morning', afternoon: 'Afternoon', sunset: 'Sunset', evening: 'Evening', night: 'Night' };

export function clockLabel(hour: number): string {
  const h = Math.floor(hour);
  const m = Math.floor((hour - h) * 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
