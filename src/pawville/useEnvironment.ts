import { useEffect, useState } from 'react';
import { createStore, isObj, num, oneOf } from './persistence.ts';
import { DEFAULT_ENV_SETTINGS, WEATHERS, computeEnvironment, type EnvSettings, type Environment, type Weather } from './world/environment.ts';

export const envSettingsStore = () =>
  createStore<EnvSettings & { ambience: boolean; lowPower: boolean; voices?: number }>({
    key: 'env-settings',
    version: 1,
    defaults: () => ({ ...DEFAULT_ENV_SETTINGS, ambience: false, lowPower: false }),
    sanitize: (raw) => {
      const r = isObj(raw) ? raw : {};
      return {
        clock: oneOf(r.clock, ['real', 'cozy'] as const, 'cozy'),
        weatherOverride: r.weatherOverride === null || r.weatherOverride === undefined ? null : oneOf<Weather>(r.weatherOverride, WEATHERS, 'sunny'),
        hourOverride: r.hourOverride === null || r.hourOverride === undefined ? null : num(r.hourOverride, 12, 0, 24),
        ambience: r.ambience === true,
        lowPower: r.lowPower === true,
        // Milestone 7: character voice volume (0 = off). Missing in older settings = 0.7.
        voices: num(r.voices, 0.7, 0, 1),
      };
    },
  });

/** Recomputes the environment once a second (cheap; rendering interpolates per frame). */
export function useEnvironment() {
  const [settings, setSettings] = useState(() => envSettingsStore().load());
  const [env, setEnv] = useState<Environment>(() => computeEnvironment(Date.now(), settings));
  useEffect(() => {
    const tick = () => setEnv(computeEnvironment(Date.now(), settings));
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [settings]);
  const update = (patch: Partial<typeof settings>) => {
    const next = { ...settings, ...patch };
    envSettingsStore().save(next);
    setSettings(next);
  };
  return { env, settings, update };
}
