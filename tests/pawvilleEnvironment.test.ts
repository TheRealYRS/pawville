import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  COZY_DAY_MS, WEATHERS, WEATHER_SLOT_MS, computeEnvironment, darknessFor, gradeFor, isAvailable, phaseFor, seasonFor, weatherForSlot,
  type EnvSettings,
} from '../src/pawville/world/environment.ts';

const live: EnvSettings = { clock: 'cozy', weatherOverride: null, hourOverride: null };

test('shared weather: same slot → same weather on every client; seasons constrain it', () => {
  for (let slot = 0; slot < 200; slot++) assert.equal(weatherForSlot(slot, 'autumn'), weatherForSlot(slot, 'autumn'));
  const summer = new Set(Array.from({ length: 400 }, (_, i) => weatherForSlot(i, 'summer')));
  assert.ok(!summer.has('snow'), 'no snow in summer');
  const winter = new Set(Array.from({ length: 400 }, (_, i) => weatherForSlot(i, 'winter')));
  assert.ok(winter.has('snow'));
  const all = new Set(['spring', 'summer', 'autumn', 'winter'].flatMap((s) => Array.from({ length: 300 }, (_, i) => weatherForSlot(i, s as 'spring'))));
  for (const w of WEATHERS) assert.ok(all.has(w), `${w} occurs`);
  assert.equal(seasonFor(new Date(Date.UTC(2026, 0, 5))), 'winter');
});

test('two devices at the same instant compute the same environment (cozy clock)', () => {
  const now = Date.UTC(2026, 9, 24, 10, 7, 3);
  const a = computeEnvironment(now, live, new Date(now));
  const b = computeEnvironment(now, live, new Date(now + 3_600_000)); // different local timezone
  assert.equal(a.weather, b.weather);
  assert.equal(a.hour, b.hour);
  assert.equal(a.localOnly, false);
});

test('weather transitions blend over 90 seconds instead of switching abruptly', () => {
  const slotStart = 1_000 * WEATHER_SLOT_MS;
  assert.equal(computeEnvironment(slotStart, live).blend, 0);
  assert.ok(Math.abs(computeEnvironment(slotStart + 45_000, live).blend - 0.5) < 1e-9);
  assert.equal(computeEnvironment(slotStart + 120_000, live).blend, 1);
});

test('day phases, darkness curve and cozy cycle', () => {
  assert.equal(phaseFor(8), 'morning');
  assert.equal(phaseFor(14), 'afternoon');
  assert.equal(phaseFor(18), 'sunset');
  assert.equal(phaseFor(20), 'evening');
  assert.equal(phaseFor(1), 'night');
  assert.equal(darknessFor(13), 0);
  assert.equal(darknessFor(0), 1);
  assert.ok(darknessFor(19) > 0 && darknessFor(19) < 1);
  const h0 = computeEnvironment(0, live).hour;
  const hHalf = computeEnvironment(COZY_DAY_MS / 2, live).hour;
  assert.equal(h0, 6);
  assert.equal(hHalf, 18);
});

test('overrides are flagged local-only; rain makes puddles available; grading darkens nights', () => {
  const rainy = computeEnvironment(5_000_000, { clock: 'real', weatherOverride: 'heavy-rain', hourOverride: 23 });
  assert.equal(rainy.localOnly, true);
  assert.ok(rainy.wetness > 0.9);
  assert.equal(isAvailable('wet', rainy), true);
  assert.equal(isAvailable('night', rainy), true);
  const sunnyNoon = computeEnvironment(5_000_000, { clock: 'real', weatherOverride: 'sunny', hourOverride: 12 });
  assert.equal(isAvailable('wet', sunnyNoon), false);
  assert.ok(gradeFor(rainy).tintAlpha > gradeFor(sunnyNoon).tintAlpha);
  const snow = computeEnvironment(5_000_000, { clock: 'real', weatherOverride: 'snow', hourOverride: 12 });
  assert.equal(snow.snowCover, 1);
});
