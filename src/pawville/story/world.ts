/**
 * Where the story lives in the world: spots, companions, glyphs and the temple map.
 * Existing maps are reused (the village, Whiskerwick, Old Town, the harbour, Whisperwood, the isles, Frostbell…);
 * the only new map is the temple at the end of the trail. Everything is built from the scene data (script*.ts), so a scene
 * and the place it happens can never drift apart.
 */
import { RG, groundBuilder, type AdventureSpot, type NpcDef, type RegionDef, type RegionProp } from '../adventure/regionKit.ts';
import type { AdvView, RegionId } from '../adventure/state.ts';
import { SCENES, lumiAt, sceneAvailable } from './engine.ts';
import { PLACES, TONES } from './model.ts';
import type { Scene, StoryGlyph } from './kit.ts';

const spot = (s: Omit<AdventureSpot, 'kind'>): AdventureSpot => ({ kind: 'adventure', ...s });
const dummyCtx = { phase: 'afternoon', rain: false };

/** A scene's own spot. It stays while there is still something to say after the scene (unless an NPC carries that). */
function sceneSpot(sc: Scene): AdventureSpot {
  const s = sc.spot!;
  const keep = !!sc.after && !sc.npc;
  return spot({
    id: s.id, role: 'use', label: s.label, point: { x: s.x, y: s.y }, radius: s.radius ?? 18, scene: sc.id, hold: sc.hold,
    when: (v) => sceneAvailable(sc, v) || (keep && v.story.unlocked && v.story.done(sc.id) && !!sc.after!(v, dummyCtx)),
  });
}

// ---- Lumi (a companion while the story needs her) ----------------------------------------------------------------------
interface LumiSpot { region: RegionId; at: string; x: number; y: number; night?: { x: number; y: number } }
const LUMI_SPOTS: readonly LumiSpot[] = [
  { region: 'town', at: 'chime', x: 424, y: 470 },
  { region: 'city', at: 'biscuit', x: 516, y: 380, night: { x: 348, y: 644 } },
  { region: 'old-town', at: 'repair', x: 216, y: 314 },
  { region: 'old-town', at: 'gate', x: 40, y: 166 },
  { region: 'temple', at: 'temple', x: 256, y: 140 },
];

function lumiNpcs(region: RegionId): NpcDef[] {
  return LUMI_SPOTS.filter((l) => l.region === region).map((l): NpcDef => ({
    id: 'lumi', name: 'Lumi', coat: 'cloud', species: 'lumi', x: l.x, y: l.y,
    when: (v: AdvView) => { const p = lumiAt(v); return !!p && p.region === region && p.at === l.at; },
    schedule: l.night ? ({ phase, rain }) => (rain || phase === 'evening' || phase === 'night' ? { ...l.night!, doing: 'Keeping Biscuit company' } : { x: l.x, y: l.y, doing: 'Keeping Biscuit company' }) : undefined,
  }));
}

/** Everything extra a region gets for the story. */
export function storyNpcs(region: RegionId): NpcDef[] {
  const out: NpcDef[] = [...lumiNpcs(region)];
  if (region === 'old-town') out.push({ id: 'velvet', name: 'Mr. Velvet', coat: 'midnight', extra: 'glasses', x: 62, y: 172, facing: 'left', when: (v) => v.story.velvetAtGate() });
  if (region === 'purring-cup') out.push({ id: 'biscuit', name: 'Biscuit', coat: 'mochi', extra: 'scarf', x: 250, y: 200, facing: 'down', when: (v) => v.story.epilogue() });
  if (region === 'city-park') out.push({ id: 'velvet', name: 'Mr. Velvet', coat: 'midnight', extra: 'glasses', x: 500, y: 318, facing: 'left', pose: 'sit', when: (v) => v.story.epilogue() });
  if (region === 'temple') {
    out.push({ id: 'biscuit', name: 'Biscuit', coat: 'mochi', extra: 'scarf', x: 322, y: 140, facing: 'down', when: (v) => v.story.gateOpen() });
    out.push({ id: 'velvet', name: 'Mr. Velvet', coat: 'midnight', extra: 'glasses', x: 288, y: 206, facing: 'up', when: (v) => v.story.gateOpen() });
  }
  return out;
}

export const TEMPLE_ENTRY = { x: 288, y: 424 };
export const OLD_TOWN_GATE_EXIT = { x: 46, y: 160 };
const WALL_MARKS = [
  { tone: 'kindness', x: 124, y: 100, line: 'A mark like two paws reaching. Beside it, small worn places where cats have rested, and a faded scratch: “Made room.”' },
  { tone: 'curiosity', x: 124, y: 164, line: 'A mark like an open eye. Dozens of tiny questions are scratched around it, in dozens of hands. Most end in a question mark.' },
  { tone: 'courage', x: 124, y: 228, line: 'A mark like a raised paw, deeply cut. The stone below it is worn smooth. Someone stood here, and said something hard, and stayed.' },
  { tone: 'patience', x: 452, y: 100, line: 'A mark like a closed hand, gently drawn. The floor in front of it holds a long, shallow dip: a great many cats waited here, and none of them left early.' },
  { tone: 'playfulness', x: 452, y: 164, line: 'A mark like a curl of tail. Dozens of small chalk doodles are left beside it, rubbed out and redrawn. Someone clearly lost a game of hopscotch here.' },
] as const;

/** Spots the story adds to a region (scene spots, companions' talk spots, small environmental things). */
export function storySpots(region: RegionId): AdventureSpot[] {
  const out: AdventureSpot[] = SCENES.filter((s) => s.region === region && s.spot).map(sceneSpot);
  for (const n of storyNpcs(region)) {
    const id = `talk-${n.id}-${region}-${Math.round(n.x)}`;
    out.push(spot({ id, role: 'npc', npc: n.id, label: `Talk to ${n.name}`, point: { x: n.x, y: n.y }, radius: 29, when: n.when }));
  }
  if (region === 'old-town') {
    out.push(spot({ id: 'story-gate-passage', role: 'exit', label: 'Walk the old trail to the temple', point: { x: 26, y: 150 }, radius: 16, when: (v) => v.has('region:temple'),
      to: { region: 'temple', x: TEMPLE_ENTRY.x, y: TEMPLE_ENTRY.y, travel: 'trail' } }));
  }
  if (region === 'forest') {
    [[72, 200], [100, 232], [130, 196]].forEach(([x, y], i) => out.push(spot({
      id: `story-gchime-${i}`, role: 'use', label: 'Untangle the silent chime', point: { x, y }, radius: 14,
      when: (v) => v.story.unlocked && v.story.done('a1-end') && !v.story.mark(`garden:${i}`),
      story: { mark: [`garden:${i}`] },
      text: (v) => ([0, 1, 2].filter((j) => j !== i).every((j) => v.story.mark(`garden:${j}`)) ? 'The last knot gives. All three chimes ring at once, and somewhere nearby the garden’s quiet heart hums.' : 'You work the knot loose with a paw and a lot of patience. The chime says a small, silver hello.'),
    })));
  }
  if (region === 'temple') {
    out.push(spot({ id: 'temple-exit', role: 'exit', label: 'Walk back down the old trail', point: { x: 288, y: 464 }, radius: 18, to: { region: 'old-town', x: OLD_TOWN_GATE_EXIT.x, y: OLD_TOWN_GATE_EXIT.y, travel: 'trail' } }));
    for (const m of WALL_MARKS) {
      out.push(spot({ id: `story-mark-${m.tone}`, role: 'use', label: `Read the ${m.tone} mark`, point: { x: m.x, y: m.y }, radius: 14, when: (v) => v.story.done('a3-quiet'),
        story: { mark: [`temple:${m.tone}`] }, text: m.line }));
    }
    out.push(spot({ id: 'story-temple-hear', role: 'use', label: 'Listen to the completed Hearthsong', point: { x: 288, y: 150 }, radius: 18, when: (v) => v.story.epilogue(), cue: 'hearthsong',
      text: 'You stand where the worn paths meet, and the Hearthsong plays itself, softly, the way it was finished: the way you listened.' }));
  }
  return out;
}

/** The glyphs (small drawn objects) of a region for the current story state. */
export function storyGlyphs(region: RegionId, v: AdvView): StoryGlyph[] {
  const s = v.story;
  if (!s.unlocked) return [];
  const g: StoryGlyph[] = [];
  const phrase = (p: string) => s.phrase(p);
  switch (region) {
    case 'town': g.push({ id: 'chime', glyph: 'chime', x: 440, y: 452, state: s.done('a1-chime') ? 'alive' : 'old' }); break;
    case 'old-town':
      if (s.done('a1-clues')) g.push({ id: 'repair', glyph: 'chime', x: 232, y: 296, state: s.chime() ?? 'broken' });
      if (s.done('a1-chime-repair') || s.gateOpen()) g.push({ id: 'gate', glyph: 'gate', x: 26, y: 148, state: s.gateOpen() ? 'open' : 'closed' });
      break;
    case 'harbor':
      if (s.done('a1-biscuit')) g.push({ id: 'fogbell', glyph: 'fogbell', x: 136, y: 262 });
      if (s.done('a1-end')) g.push({ id: 'lantern', glyph: 'lantern5', x: 410, y: 288, state: phrase('lantern') ? 'lit' : 'cold' });
      break;
    case 'city-park': if (s.done('a1-biscuit')) g.push({ id: 'stone', glyph: 'stone', x: 640, y: 420, state: s.clue('clue:garden') ? 'bloom' : 'plain' }); break;
    case 'library': if (s.done('a1-biscuit')) g.push({ id: 'archive', glyph: 'archive', x: 240, y: 150 }); break;
    case 'rooftops': if (s.done('a1-end')) g.push({ id: 'steps', glyph: 'steps', x: 120, y: 330, state: phrase('wind') ? 'heard' : 'silent' }); break;
    case 'forest':
      if (s.done('a1-end')) {
        [[72, 200], [100, 232], [130, 196]].forEach(([x, y], i) => g.push({ id: `gchime${i}`, glyph: 'gardenchime', x, y, state: s.mark(`garden:${i}`) ? 'free' : 'tangled' }));
        g.push({ id: 'gheart', glyph: 'gardenchime', x: 100, y: 200, state: phrase('garden') ? 'singing' : 'free' });
      }
      break;
    case 'isles': if (s.done('a1-end')) g.push({ id: 'echo', glyph: 'echo', x: 192, y: 248, state: phrase('echo') ? 'answered' : 'quiet' }); break;
    case 'highlands': if (s.done('a1-end')) g.push({ id: 'rise', glyph: 'rise', x: 484, y: 200, state: s.done('a2-rise') ? 'seen' : 'cracked' }); break;
    case 'purring-cup': if (s.epilogue()) g.push({ id: 'hearth', glyph: 'hearth', x: 230, y: 150 }); break;
    case 'temple': for (const m of WALL_MARKS) g.push({ id: `mark-${m.tone}`, glyph: 'mark', x: m.x, y: m.y, state: m.tone, read: s.mark(`temple:${m.tone}`) }); break;
    default: break;
  }
  return g;
}

// =================================================================================================
// The temple (36 x 30): the end of the old trail. A weathered hall open to the sky, a forecourt and the trail.
// =================================================================================================
export function buildTemple(): RegionDef {
  const cols = 36, rows = 30;
  const b = groundBuilder(cols, rows, RG.Cliff);
  b.rect(15, 19, 20, 29, RG.Path); // the old trail
  b.rect(8, 19, 27, 22, RG.Grass); b.rect(9, 22, 14, 22, RG.Flowers); b.rect(21, 22, 26, 22, RG.Flowers); // the hill terrace
  b.rect(10, 16, 25, 18, RG.Paving); // the forecourt
  b.rect(7, 4, 28, 14, RG.Cobble); // the hall
  b.rect(7, 15, 28, 15, RG.Brick); b.rect(16, 15, 19, 15, RG.Paving); // the front wall, with the doorway
  b.rect(16, 7, 19, 14, RG.Paving); // the aisle
  b.rect(13, 4, 22, 6, RG.Stone); // the dais

  const props: RegionProp[] = [
    { kind: 'hearthsong', x: 288, y: 100, variant: 0, when: (v) => !v.story.done('a3-hearthsong') },
    { kind: 'hearthsong', x: 288, y: 100, variant: 1, when: (v) => v.story.done('a3-hearthsong') },
  ];
  for (const [x, y] of [[148, 120], [148, 184], [148, 232], [428, 120], [428, 184], [428, 232]] as const) props.push({ kind: 'templepillar', x, y });
  for (const [x, y] of [[168, 70], [408, 70], [208, 214], [368, 214]] as const) {
    props.push({ kind: 'templelamp', x, y, variant: 0, when: (v) => !v.story.done('a3-hearthsong') });
    props.push({ kind: 'templelamp', x, y, variant: 1, when: (v) => v.story.done('a3-hearthsong') });
  }
  for (const [x, y] of [[184, 150], [392, 150], [232, 100], [344, 100]] as const) props.push({ kind: 'templebowl', x, y });
  for (const [x, y] of [[262, 400], [314, 372], [264, 340], [316, 316]] as const) props.push({ kind: 'trailstone', x, y });

  const spots = storySpots('temple');
  const npcs = storyNpcs('temple');
  return {
    id: 'temple', name: 'The Temple of Many Voices', cols, rows, ground: b.g, props, spots, npcs, gates: [],
    spawn: { x: TEMPLE_ENTRY.x, y: TEMPLE_ENTRY.y },
    areas: [
      { name: 'The Old Trail', rect: { x: 240, y: 300, w: 96, h: 180 } },
      { name: 'Temple Terrace', rect: { x: 130, y: 300, w: 320, h: 70 } },
      { name: 'Forecourt', rect: { x: 160, y: 256, w: 260, h: 44 } },
      { name: 'Hall of Many Voices', rect: { x: 112, y: 64, w: 352, h: 176 } },
      { name: 'The Hearthsong', rect: { x: 208, y: 64, w: 160, h: 56 } },
    ],
    climate: {},
  };
}

export const ALL_TONES = TONES;
export const ALL_PLACES = PLACES;
