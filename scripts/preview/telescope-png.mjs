// Milestone 8.1 preview: renders the real telescope renderer with skia-canvas (a real Canvas2D) to PNGs.
// usage: NODE_PATH=... node --experimental-strip-types scripts/preview/telescope-png.mjs out-dir
import { createRequire } from 'node:module';
const { Canvas } = createRequire(import.meta.url)(process.env.SKIA_CANVAS ?? 'skia-canvas');
const { drawTelescope } = await import('../../src/pawville/render/telescopeArt.ts');
const { SKY } = await import('../../src/pawville/adventure/telescope.ts');
const out = process.argv[2] ?? '.';
globalThis.window = { devicePixelRatio: 1 };
const shots = [
  ['night-dipper', { site: 'city', darkness: 1, clear: true, moonPhase: 0.32, flags: new Set(), time: 3 }, { az: 28, alt: 44, zoom: 1 }],
  ['night-moon-x2', { site: 'city', darkness: 1, clear: true, moonPhase: 0.32, flags: new Set(), time: 3 }, { az: 150, alt: 34, zoom: 2 }],
  ['comet-x3', { site: 'city', darkness: 1, clear: true, moonPhase: 0.32, flags: new Set(), time: 3 }, { az: 212, alt: 56, zoom: 3 }],
  ['lighthouse-lit-x2', { site: 'city', darkness: 0.9, clear: true, moonPhase: 0.32, flags: new Set(['lighthouse-lit']), time: 3 }, { az: 205, alt: 4, zoom: 2 }],
  ['rooftop-day-clock-x2', { site: 'rooftops', darkness: 0, clear: true, moonPhase: 0.32, flags: new Set(), time: 3 }, { az: 120, alt: 6, zoom: 2 }],
  ['rooftop-dusk-ferris', { site: 'rooftops', darkness: 0.55, clear: true, moonPhase: 0.32, flags: new Set(), time: 3 }, { az: 250, alt: 8, zoom: 1 }],
  ['cloudy-night', { site: 'town', darkness: 1, clear: false, moonPhase: 0.32, flags: new Set(), time: 3 }, { az: 30, alt: 14, zoom: 1 }],
];
for (const [name, c, v] of shots) {
  const cv = new Canvas(560, 400);
  drawTelescope(cv.getContext('2d'), 560, 400, v, c, 1);
  await cv.toFile(`${out}/${name}.png`);
}
console.log('rendered', shots.length, 'views;', SKY.length, 'sky objects');
