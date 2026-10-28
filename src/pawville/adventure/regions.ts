/**
 * The explorable regions beyond Whiskerwood Village (Milestone 6), plus the adventure layer that
 * sits on top of the original town (NPCs, quest spots, the pier and the bramble gate).
 *
 * Each region is one RegionDef: ground, props, NPCs, spots (interactables), gates and exits.
 * Everything is deterministic, so every device builds the exact same world.
 */
import { NEW_RESIDENTS } from '../living/roster.ts';
import { buildTemple, storyNpcs, storySpots } from '../story/world.ts';
import { lumiAt } from '../story/engine.ts';
import { seededRandom, type Vec2 } from '../world/geometry.ts';
import { buildArcadeHall, buildCity, CITY_PLATFORM } from '../city/cityRegion.ts';
import { buildFunfair } from '../city/funfairRegion.ts';
import { buildCityPark, buildHearth, buildLibrary, buildOldTown, buildPurringCup, buildRooftops } from '../city/cityDistricts.ts';
import type { AdvView, RegionId } from './state.ts';
import {
  RG, RTILE, groundBuilder, scatter, type AdventureSpot, type GateDef, type NpcDef, type RegionDef, type RegionProp,
} from './regionKit.ts';

const T = RTILE;
const at = (c: number, r: number): Vec2 => ({ x: Math.round(c * T), y: Math.round(r * T) });
const spot = (s: Omit<AdventureSpot, 'kind'>): AdventureSpot => ({ kind: 'adventure', ...s });
const npcSpot = (n: NpcDef, label: string, when?: AdventureSpot['when']): AdventureSpot =>
  spot({ id: `talk-${n.id}`, role: 'npc', npc: n.id, label, point: { x: n.x, y: n.y }, radius: 29, when: when ?? n.when });

// ---- shared conditions -------------------------------------------------------------------------
const restored = (v: AdvView) => v.has('harbor-restored');
const step = (q: string, i: number) => (v: AdvView) => v.onStep(q, i);

// =================================================================================================
// Pawport Harbor (44 x 32)
// =================================================================================================
function buildHarbor(): RegionDef {
  const cols = 44, rows = 32;
  const b = groundBuilder(cols, rows, RG.Water);
  b.rect(4, 3, 39, 23, RG.Grass);
  b.rect(4, 3, 5, 18, RG.Sand); // west shore
  b.rect(0, 12, 5, 13, RG.Dock); // arrival dock
  b.rect(6, 12, 32, 13, RG.Cobble); // Harbor Street
  b.rect(14, 5, 15, 16, RG.Cobble); // Mast Lane
  b.rect(6, 5, 31, 6, RG.Cobble); // Cliff Road
  b.rect(4, 19, 26, 23, RG.Water); // the inner bay (open to the sea in the west)
  b.rect(8, 17, 26, 18, RG.Dock); // the long dock
  b.rect(11, 19, 11, 20, RG.Dock); b.rect(17, 19, 17, 21, RG.Dock); b.rect(23, 19, 23, 22, RG.Dock); // finger piers
  b.rect(4, 24, 39, 27, RG.Sand); // south beach
  b.rect(29, 29, 36, 30, RG.Sand); b.rect(32, 28, 33, 28, RG.Shallows); // the sandbar + wading shallows
  b.rect(34, 0, 43, 2, RG.Rock); b.rect(40, 3, 43, 10, RG.Rock); // lighthouse cliffs
  b.rect(38, 9, 39, 22, RG.Rock); b.rect(38, 15, 39, 15, RG.Sand); // the cove wall with ONE narrow gap
  b.rect(40, 11, 43, 20, RG.Sand); // the hidden cove
  b.rect(40, 21, 43, 27, RG.Rock);
  b.rect(30, 3, 35, 4, RG.Cobble); b.rect(34, 5, 36, 5, RG.Cobble); // path to the lighthouse door (8.1: no longer runs under the tower)

  const props: RegionProp[] = [
    { kind: 'house', x: 160, y: 176, variant: 0 }, // harbor-master's office
    { kind: 'house', x: 352, y: 176, variant: 1 }, // Coral's souvenirs
    { kind: 'house', x: 480, y: 176, variant: 2 }, // net loft
    { kind: 'stall', x: 304, y: 256 },
    { kind: 'lighthouse', x: 592, y: 80 },
    { kind: 'observatory', x: 416, y: 72, variant: 0 },
    { kind: 'boat', x: 206, y: 334, variant: 1 }, { kind: 'boat', x: 302, y: 350, variant: 2 }, { kind: 'boat', x: 398, y: 366, variant: 3 },
    { kind: 'bigrock', x: 576, y: 372 },
    { kind: 'wreck', x: 560, y: 492 },
    { kind: 'lamp', x: 112, y: 188 }, { kind: 'lamp', x: 256, y: 188 }, { kind: 'lamp', x: 432, y: 188 }, { kind: 'lamp', x: 208, y: 266 }, { kind: 'lamp', x: 400, y: 266 },
    { kind: 'barrel', x: 120, y: 236 }, { kind: 'barrel', x: 132, y: 238 }, { kind: 'crate', x: 268, y: 262 },
    { kind: 'flag', x: 96, y: 186, variant: 0, when: restored }, { kind: 'flag', x: 528, y: 92, variant: 1, when: restored },
    { kind: 'bunting', x: 304, y: 214, when: restored },
    { kind: 'rock', x: 640, y: 210 }, { kind: 'rock', x: 652, y: 300 }, { kind: 'rock', x: 600, y: 140 },
    { kind: 'reeds', x: 72, y: 300 }, { kind: 'reeds', x: 600, y: 410 },
    { kind: 'bench', x: 224, y: 222 }, { kind: 'bench', x: 520, y: 120 },
  ];
  const avoid: Vec2[] = [at(3, 12.8), { x: 592, y: 92 }, { x: 416, y: 84 }];
  props.push(...scatter({ cols, rows, ground: b.g }, seededRandom(0x4a2b), 26, 'tree', [RG.Grass], [...avoid, ...props], 30, 3, props));
  props.push(...scatter({ cols, rows, ground: b.g }, seededRandom(0x4a2c), 10, 'bush', [RG.Grass], [...avoid, ...props], 26, 2, props));

  const marlow: NpcDef = { id: 'marlow', name: 'Captain Marlow', coat: 'cocoa', extra: 'captainhat', x: 104, y: 236, facing: 'left' };
  const finn: NpcDef = { id: 'finn', name: 'Finn', coat: 'pebble', extra: 'scarf', x: 304, y: 236, facing: 'down', when: restored };
  const coral: NpcDef = { id: 'coral', name: 'Coral', coat: 'blossom', extra: 'flower', x: 352, y: 198, facing: 'down', when: restored };
  const npcs = [marlow, finn, coral];
  const spots: AdventureSpot[] = [
    spot({ id: 'harbor-boat', role: 'exit', label: 'Sail back to Whiskerwood with Marlow', point: { x: 22, y: 206 }, radius: 24, to: { region: 'town', x: 724, y: 368 } }),
    npcSpot(marlow, 'Talk to Captain Marlow'),
    { ...npcSpot(finn, 'Talk to Finn at the fish stall'), point: { x: 304, y: 270 } },
    npcSpot(coral, 'Talk to Coral'),
    spot({ id: 'lighthouse-door', role: 'use', label: 'Look inside the lighthouse', point: { x: 592, y: 92 }, radius: 16, seen: 'landmark-lighthouse', journal: ['landmark-lighthouse'],
      puzzle: (v) => (v.onStep('lighthouse-mystery', 3) ? 'lens' : v.onStep('lost-star', 6) ? 'constellation' : null),
      text: (v) => v.has('lighthouse-lit') ? 'The great lens turns slowly. From up here you can see the whole bay.' : 'Dust, a cold lamp and a brass lens with three rings. A note is pinned by the stairs.' }),
    ...[[0, 11.5, 20.6, 'Read the sail of the red boat'], [1, 17.5, 21.6, 'Read the sail of the blue boat'], [2, 23.5, 22.6, 'Read the sail of the green boat']].map(([i, c, r, label]) =>
      spot({ id: `boat-sign-${i}`, role: 'sign', label: label as string, point: at(c as number, r as number), radius: 12,
        text: ['The RED boat — moored furthest NORTH — has a STAR painted on its sail.', 'The BLUE boat — moored in the MIDDLE — has a crescent MOON on its sail.', 'The GREEN boat — moored furthest SOUTH — has a SUN on its sail.'][i as number] })),
    spot({ id: 'observatory-door', role: 'sign', label: 'Try the observatory door', point: { x: 416, y: 84 }, radius: 14, when: (v) => !v.has('observatory-open'),
      text: 'Locked. Five little stars are carved around the keyhole, shaped like… a creature?' }),
    spot({ id: 'observatory-scope', role: 'use', label: 'Look through the great telescope', point: { x: 416, y: 84 }, radius: 14, when: (v) => v.has('observatory-open'), setFlags: ['region:isles', 'lumi-home'],
      text: (v) => v.has('region:isles') ? 'Far above the clouds, the Dreaming Isles glitter. The star bridge waits outside.' : 'The telescope swings toward Lumi’s constellation… and a bridge of light unrolls into the sky!' }),
    spot({ id: 'star-bridge', role: 'exit', label: 'Cross the star bridge to the Dreaming Isles', point: { x: 456, y: 72 }, radius: 24, when: (v) => v.has('region:isles'), to: { region: 'isles', x: 96, y: 244 } }),
    spot({ id: 'fish-dock-1', role: 'activity', activity: 'fish', label: 'Fish off the long dock', point: { x: 224, y: 300 }, radius: 14, when: restored }),
    spot({ id: 'fish-dock-2', role: 'activity', activity: 'fish', label: 'Fish off the long dock', point: { x: 336, y: 300 }, radius: 14, when: restored }),
    spot({ id: 'fish-cove', role: 'activity', activity: 'fish', label: 'Fish in the quiet cove', point: { x: 672, y: 300 }, radius: 14, when: restored }),
    ...[[8, 25], [20, 27], [28, 24.6], [41, 13], [31, 29.6]].map(([c, r], i) => spot({ id: `harbor-shell-${i}`, role: 'collect', label: 'Pick up a pretty shell', point: at(c, r), radius: 12,
      collect: { item: 'harbor-shell', once: true, text: 'A swirly pink shell. Into the bag it goes.' } })),
    ...[[10, 24.5], [16, 26], [24, 24.5], [30, 26], [37, 25]].map(([c, r], i) => spot({ id: `litter-${i}`, role: 'use', label: ['Untangle an old net', 'Pick up a tin can', 'Drag a broken plank above the tide line', 'Pick up a lost boot', 'Collect a pile of rope'][i], point: at(c, r), radius: 12,
      when: (v) => v.has('region:harbor') && !v.has('beach-clean') && !v.used(`litter-${i}`), consume: true, text: 'Tidied! The beach looks a little happier.' })),
    spot({ id: 'bottle-trail', role: 'collect', label: 'A bottle with something inside', point: at(34, 26), radius: 12, when: step('vanishing-trail', 0),
      collect: { item: 'trail-map', key: true, once: true, text: 'Inside the bottle: an old, careful map of a mountain trail, marked “Frostbell”.' } }),
    spot({ id: 'bottle-1', role: 'collect', label: 'A message in a bottle', point: at(12, 26.2), radius: 12, journal: ['bottle-letter-1'],
      collect: { item: 'bottle-note-1', key: true, once: true, text: '“To whoever finds this: the gulls here steal sandwiches. Guard yours. — a tourist”' } }),
    spot({ id: 'bottle-2', role: 'collect', label: 'A message in a bottle', point: { x: 488, y: 486 }, radius: 12, journal: ['bottle-letter-2'],
      collect: { item: 'bottle-note-2', key: true, once: true, text: '“The lighthouse keeper left to follow a star. If the light goes out, the boats will remember the way.”' } }),
    spot({ id: 'symbol-harbor', role: 'use', label: 'Look at the worn rock', point: { x: 576, y: 386 }, radius: 14, journal: ['symbol-harbor'], text: 'Two small pawprints inside a circle, worn smooth by the sea.' }),
    spot({ id: 'cove-gap', role: 'sign', label: 'A narrow gap between the rocks…', point: { x: 600, y: 248 }, radius: 10, seen: 'hidden-cove', text: 'Just wide enough for a cat. The sound of quiet waves comes from the other side.' }),
  ];
  return {
    id: 'harbor', name: 'Pawport Harbor', cols, rows, ground: b.g, props, spots, npcs, gates: [], spawn: { x: 52, y: 208 },
    areas: [
      { name: 'Arrival Dock', rect: { x: 0, y: 180, w: 100, h: 60 } },
      { name: 'The Long Dock', rect: { x: 120, y: 268, w: 320, h: 110 } },
      { name: 'Lighthouse Point', rect: { x: 480, y: 30, w: 160, h: 110 } },
      { name: 'Observatory Headland', rect: { x: 360, y: 30, w: 120, h: 70 } },
      { name: 'Hidden Cove', rect: { x: 640, y: 170, w: 64, h: 160 } },
      { name: 'The Sandbar', rect: { x: 460, y: 440, w: 140, h: 60 } },
      { name: 'South Beach', rect: { x: 60, y: 380, w: 580, h: 70 } },
      { name: 'Harbor Street', rect: { x: 90, y: 60, w: 450, h: 200 } },
    ],
    climate: { water: true },
  };
}

// =================================================================================================
// Whisperwood Forest (40 x 32)
// =================================================================================================
function buildForest(): RegionDef {
  const cols = 40, rows = 32;
  const b = groundBuilder(cols, rows, RG.Forest);
  b.rect(19, 0, 20, 18, RG.Path); // from the bramble gate
  b.disc(20, 13, 5, RG.Moss); // the clearing
  b.rect(19, 9, 20, 18, RG.Path);
  b.line(15, 13, 7, 13, RG.Path, 2); // to the mossy hollow
  b.rect(26, 0, 27, 31, RG.Water); // the stream
  // Milestone 8.1: the path used to be painted after the bridge and overwrote it (dirt over the stream)
  b.road(21, 13, 33, 14, RG.Path);
  b.rect(29, 0, 39, 5, RG.Cliff);
  b.rect(31, 6, 36, 8, RG.Water); b.rect(28, 7, 30, 8, RG.Water); // waterfall pool → stream
  b.rect(36, 9, 37, 14, RG.Path); b.rect(37, 6, 38, 8, RG.Moss);
  b.rect(28, 15, 29, 26, RG.Path); b.rect(28, 25, 36, 26, RG.Path); b.rect(35, 26, 36, 31, RG.Path);
  b.disc(10, 22, 3, RG.Moss); // the old oak's glade
  b.disc(7, 5, 2.5, RG.Flowers); // fern dell

  const props: RegionProp[] = [
    { kind: 'tent', x: 256, y: 196 }, { kind: 'campfire', x: 352, y: 220 }, { kind: 'log', x: 96, y: 200 },
    { kind: 'oak', x: 160, y: 380 }, { kind: 'waterfall', x: 536, y: 100 },
    { kind: 'vines', x: 600, y: 98, when: (v) => !v.has('cave-open') }, { kind: 'cavemouth', x: 600, y: 98, when: (v) => v.has('cave-open') },
    { kind: 'tent', x: 496, y: 384, variant: 1 }, { kind: 'flag', x: 540, y: 372, variant: 2 },
    { kind: 'mushroom', x: 200, y: 280 }, { kind: 'mushroom', x: 230, y: 470 }, { kind: 'mushroom', x: 140, y: 120 }, { kind: 'mushroom', x: 380, y: 420 }, { kind: 'mushroom', x: 60, y: 330 },
    { kind: 'bush', x: 112, y: 70 }, { kind: 'bush', x: 150, y: 86, variant: 1 }, { kind: 'reeds', x: 400, y: 300 },
    { kind: 'lantern', x: 300, y: 150 }, { kind: 'lantern', x: 400, y: 236 },
  ];
  const keep: Vec2[] = [at(20, 2.5), at(17.5, 13.2), { x: 96, y: 214 }, { x: 160, y: 396 }, at(33, 25), { x: 568, y: 440 }, { x: 128, y: 92 }, at(12, 17), at(24, 22), at(6, 27), { x: 384, y: 312 }, { x: 520, y: 150 }, { x: 600, y: 112 }];
  props.push(...scatter({ cols, rows, ground: b.g }, seededRandom(0x5e11), 70, 'tree', [RG.Forest], [...keep, ...props], 26, 3, props));
  props.push(...scatter({ cols, rows, ground: b.g }, seededRandom(0x5e12), 30, 'pine', [RG.Forest], [...keep, ...props], 24, 2, props));

  const pip: NpcDef = { id: 'pip', name: 'Pip', coat: 'mochi', x: 100, y: 212, pose: 'loaf', when: (v) => v.has('region:forest') && !v.has('pip-found') && !v.has('pip-home') };
  const juniper: NpcDef = { id: 'juniper', name: 'Juniper', coat: 'mint', extra: 'scarf', x: 528, y: 400, facing: 'left', when: (v) => !v.has('region:highlands') };
  const bramble: NpcDef = { id: 'bramble', name: 'Bramble', coat: 'pebble', x: 128, y: 82, facing: 'right', pose: 'sit', when: (v) => !v.has('bramble-home') };
  const gates: GateDef[] = [{ id: 'snowdrift', rect: { x: 544, y: 448, w: 48, h: 16 }, closed: (v) => !v.has('region:highlands'), art: 'snowdrift' }];
  const spots: AdventureSpot[] = [
    spot({ id: 'forest-to-town', role: 'exit', label: 'Back through the gate to Whiskerwood', point: { x: 320, y: 20 }, radius: 24, to: { region: 'town', x: 384, y: 828 } }),
    npcSpot(pip, 'A tiny meow from the hollow log…'),
    npcSpot(juniper, 'Talk to Juniper the explorer'),
    npcSpot(bramble, 'Say hello to the shy stray'),
    spot({ id: 'camp-letter', role: 'use', label: 'Search the abandoned campsite', point: { x: 280, y: 214 }, radius: 16, journal: ['camp-letter'],
      text: '“Whoever finds this: the little star ran behind the falling water. Two stones remember two paws. Be gentle with it. — A.”' }),
    spot({ id: 'vine-curtain', role: 'use', label: 'Look at the vines beside the falls', point: { x: 600, y: 112 }, radius: 14, when: (v) => !v.has('cave-open'), setFlags: ['cave-open'],
      locked: { when: (v) => !v.item('star-compass') && !v.done('lost-star'), text: 'Thick vines hang over wet rock. Something feels hidden here, but you don’t know what to look for yet.' },
      text: 'The star compass trembles and points straight at the vines. You part them… a cave!' }),
    spot({ id: 'forest-to-cave', role: 'exit', label: 'Enter the cave behind the falls', point: { x: 600, y: 112 }, radius: 24, when: (v) => v.has('cave-open'), to: { region: 'cave', x: 192, y: 216 } }),
    spot({ id: 'falls', role: 'sign', label: 'Admire Whisperwood Falls', point: { x: 520, y: 152 }, radius: 14, seen: 'landmark-waterfall', journal: ['landmark-waterfall'], text: 'The falls roar softly. Behind the spray, the rock looks… hollow?' }),
    spot({ id: 'symbol-forest', role: 'use', label: 'Look at the carving on the ancient oak', point: { x: 160, y: 396 }, radius: 16, journal: ['symbol-forest'], text: 'Two small pawprints inside a circle, carved deep into the bark long ago.' }),
    spot({ id: 'fox', role: 'activity', activity: 'watch', label: 'Something rustles by the stream…', point: { x: 384, y: 312 }, radius: 16, seen: 'creature-fox', journal: ['creature-fox'], text: 'A red fox lifts its head from the water, looks right at you, and slips into the ferns.' }),
    ...[[12, 17], [24, 22], [6, 27]].map(([c, r], i) => spot({ id: `mushroom-${i}`, role: 'collect', label: 'Pick a glowing mushroom', point: at(c, r), radius: 12, collect: { item: 'glow-mushroom', once: true, text: 'It glows a soft blue in your paw.' } })),
    spot({ id: 'snowdrift', role: 'sign', label: 'A wall of old snow blocks the trail', point: { x: 568, y: 438 }, radius: 14, when: (v) => !v.has('region:highlands'), text: 'The mountain trail vanishes under a hard drift. Juniper the explorer might know another way.' }),
    spot({ id: 'forest-to-highlands', role: 'exit', label: 'Climb the trail to Frostbell Highlands', point: { x: 568, y: 488 }, radius: 24, when: (v) => v.has('region:highlands'), to: { region: 'highlands', x: 56, y: 428 } }),
  ];
  return {
    id: 'forest', name: 'Whisperwood Forest', cols, rows, ground: b.g, props, spots, npcs: [pip, juniper, bramble], gates, spawn: { x: 320, y: 48 },
    areas: [
      { name: 'The Clearing', rect: { x: 230, y: 130, w: 170, h: 160 } },
      { name: 'Whisperwood Falls', rect: { x: 460, y: 80, w: 180, h: 110 } },
      { name: 'Mossy Hollow', rect: { x: 40, y: 150, w: 120, h: 100 } },
      { name: 'Old Oak Glade', rect: { x: 100, y: 330, w: 120, h: 110 } },
      { name: 'Trailhead Camp', rect: { x: 450, y: 340, w: 180, h: 170 } },
      { name: 'Fern Dell', rect: { x: 60, y: 40, w: 120, h: 90 } },
    ],
    climate: { water: true },
    trails: [{ when: (v) => v.onStep('lost-star', 1) || v.onStep('lost-star', 2) || v.onStep('lost-star', 3), color: '#bfe4ff',
      points: [{ x: 320, y: 50 }, { x: 318, y: 150 }, { x: 290, y: 210 }, { x: 352, y: 222 }, { x: 430, y: 222 }, { x: 520, y: 220 }, { x: 590, y: 190 }, { x: 600, y: 120 }] }],
  };
}

// =================================================================================================
// The cave behind the falls (24 x 16)
// =================================================================================================
export const CAVE_PLATES = [{ id: 'a', x: 88, y: 152 }, { id: 'b', x: 296, y: 152 }] as const;
function buildCave(): RegionDef {
  const cols = 24, rows = 16;
  const b = groundBuilder(cols, rows, RG.CaveWall);
  b.rect(1, 6, 22, 14, RG.CaveFloor);
  b.rect(11, 14, 12, 15, RG.CaveFloor);
  b.rect(3, 1, 20, 4, RG.CaveFloor); // the crystal chamber
  b.rect(11, 5, 12, 5, RG.CaveFloor); // the doorway (closed by the crystal gate)
  const props: RegionProp[] = [
    { kind: 'crystal', x: 40, y: 120, variant: 0 }, { kind: 'crystal', x: 344, y: 116, variant: 1 }, { kind: 'crystal', x: 64, y: 40, variant: 2 }, { kind: 'crystal', x: 320, y: 44, variant: 0 },
    { kind: 'crystal', x: 150, y: 214, variant: 1 }, { kind: 'crystal', x: 250, y: 200, variant: 2 }, { kind: 'plate', x: 88, y: 152 }, { kind: 'plate', x: 296, y: 152, variant: 1 },
    { kind: 'crystaldoor', x: 192, y: 94, when: (v) => !v.has('crystal-door-open') },
    { kind: 'starpool', x: 192, y: 40 },
  ];
  const lumi: NpcDef = { id: 'lumi', name: 'Lumi', coat: 'cloud', x: 192, y: 44, species: 'lumi', when: (v) => v.has('crystal-door-open') && !v.has('lumi-home') };
  const spots: AdventureSpot[] = [
    spot({ id: 'cave-exit', role: 'exit', label: 'Back out behind the waterfall', point: { x: 192, y: 244 }, radius: 12, to: { region: 'forest', x: 600, y: 128 } }),
    spot({ id: 'moonstone', role: 'collect', label: 'Pick up the glowing moonstone', point: { x: 48, y: 210 }, radius: 14,
      when: (v) => !v.has('crystal-door-open') && !v.item('moonstone') && !v.has('plate-stone:a') && !v.has('plate-stone:b'),
      collect: { item: 'moonstone', key: true, text: 'A heavy, cool moonstone. It hums near the floor plates.' } }),
    ...CAVE_PLATES.map((p) => spot({ id: `plate-${p.id}`, role: 'activity', activity: 'place-stone', label: 'Look at the stone plate', point: { x: p.x, y: p.y + 2 }, radius: 14, when: (v) => !v.has('crystal-door-open'),
      text: 'A round stone plate with a pawprint carved in it. It sinks a little when stood on.' })),
    spot({ id: 'crystal-door', role: 'sign', label: 'Touch the crystal door', point: { x: 192, y: 108 }, radius: 14, when: (v) => !v.has('crystal-door-open'), text: 'Two lines of light run from the door to the two plates. “Two stones remember two paws.”' }),
    npcSpot(lumi, 'Something small and glowing hides here…'),
  ];
  return {
    id: 'cave', name: 'Waterfall Cave', cols, rows, ground: b.g, props, spots, npcs: [lumi],
    gates: [{ id: 'crystal-door', rect: { x: 176, y: 80, w: 32, h: 16 }, closed: (v) => !v.has('crystal-door-open'), art: 'crystal' }],
    spawn: { x: 192, y: 216 }, areas: [{ name: 'Crystal Chamber', rect: { x: 40, y: 10, w: 300, h: 70 } }], climate: { dark: true },
  };
}

// =================================================================================================
// Frostbell Highlands (40 x 30)
// =================================================================================================
function buildHighlands(): RegionDef {
  const cols = 40, rows = 30;
  const b = groundBuilder(cols, rows, RG.Snow);
  b.rect(2, 26, 15, 27, RG.Path); b.rect(8, 11, 9, 26, RG.Path); b.rect(9, 18, 30, 19, RG.Path); b.rect(29, 7, 30, 25, RG.Path);
  b.disc(17, 14, 4.6, RG.Ice); // the frozen lake
  b.rect(9, 0, 24, 6, RG.Rock); b.rect(10, 1, 23, 5, RG.CaveFloor); b.rect(16, 6, 17, 7, RG.CaveFloor); // the ice grotto
  b.rect(33, 0, 39, 4, RG.Cliff);
  const props: RegionProp[] = [
    { kind: 'cabin', x: 96, y: 144 }, { kind: 'station', x: 544, y: 96 }, { kind: 'bench', x: 384, y: 398 }, { kind: 'flag', x: 160, y: 412, variant: 2 },
    { kind: 'icecrystal', x: 176, y: 30 }, { kind: 'icecrystal', x: 360, y: 36, variant: 1 }, { kind: 'icecrystal', x: 240, y: 70, variant: 2 },
    { kind: 'sledtrack', x: 496, y: 384 }, { kind: 'cable', x: 544, y: 96, when: (v) => v.has('cable-car-fixed') },
    { kind: 'lantern', x: 136, y: 300 }, { kind: 'lantern', x: 470, y: 300 },
  ];
  const keep: Vec2[] = [{ x: 56, y: 428 }, { x: 136, y: 170 }, at(12, 3), at(21, 2.5), { x: 264, y: 34 }, { x: 544, y: 108 }, { x: 496, y: 112 }, { x: 384, y: 412 }, { x: 272, y: 224 }];
  props.push(...scatter({ cols, rows, ground: b.g }, seededRandom(0x7f01), 46, 'snowpine', [RG.Snow], [...keep, ...props], 26, 3, props));
  props.push(...scatter({ cols, rows, ground: b.g }, seededRandom(0x7f02), 10, 'rock', [RG.Snow], [...keep, ...props], 30, 2, props));
  const juniper: NpcDef = { id: 'juniper', name: 'Juniper', coat: 'mint', extra: 'scarf', x: 136, y: 162, facing: 'down', when: (v) => v.has('region:highlands') };
  const spots: AdventureSpot[] = [
    spot({ id: 'highlands-to-forest', role: 'exit', label: 'Walk back down to Whisperwood', point: { x: 24, y: 452 }, radius: 24, to: { region: 'forest', x: 568, y: 470 } }),
    npcSpot(juniper, 'Talk to Juniper'),
    ...[[12, 3], [21, 2.5]].map(([c, r], i) => spot({ id: `gear-${i}`, role: 'collect', label: 'Something brass glints in the ice', point: at(c, r), radius: 12, when: step('cable-car', 0),
      collect: { item: 'gear', key: true, once: true, text: 'A brass gear, frozen but unbroken.' } })),
    spot({ id: 'symbol-highlands', role: 'use', label: 'Look at the shape frozen in the ice wall', point: { x: 264, y: 36 }, radius: 14, journal: ['symbol-highlands'], text: 'Two pawprints inside a circle, frozen deep in the blue ice.' }),
    spot({ id: 'cablecar-station', role: 'use', label: 'Inspect the cable-car station', point: { x: 544, y: 110 }, radius: 14, when: (v) => !v.has('cable-car-fixed'),
      locked: { when: (v) => v.item('gear') < 2, text: 'Two gear slots are empty. Without them the cable car can’t move.' }, setFlags: ['cable-car-fixed'], text: 'Click, click — the gears fit! The cable shivers and the little car starts to hum.' }),
    spot({ id: 'cablecar-ride', role: 'exit', label: 'Ride the cable car down to the village', point: { x: 544, y: 110 }, radius: 24, when: (v) => v.has('cable-car-fixed'), to: { region: 'town', x: 176, y: 304, travel: 'cablecar' } }),
    spot({ id: 'sled-top', role: 'activity', activity: 'sled', label: 'Sled down the hill!', point: { x: 476, y: 120 }, radius: 14 }),
    spot({ id: 'aurora-point', role: 'activity', activity: 'aurora', label: 'Sit at Aurora Point', point: { x: 384, y: 412 }, radius: 14, seen: 'landmark-aurora', journal: ['landmark-aurora'] }),
    spot({ id: 'pinecones', role: 'collect', label: 'Gather pine cones', point: at(4, 20), radius: 12, collect: { item: 'pine-cone', once: true, text: 'Three perfect pine cones.' } }),
    spot({ id: 'frost-crystal', role: 'collect', label: 'Pick up a frost crystal', point: at(22, 4), radius: 12, collect: { item: 'frost-crystal', once: true, text: 'It never seems to melt.' } }),
    spot({ id: 'ice-lake', role: 'sign', label: 'Peer into the frozen lake', point: at(17, 18.8), radius: 14, text: 'Under the clear ice, slow silver fish drift past. Someone has carved a tiny heart near the edge.' }),
  ];
  return {
    id: 'highlands', name: 'Frostbell Highlands', cols, rows, ground: b.g, props, spots, npcs: [juniper], gates: [], spawn: { x: 56, y: 428 },
    areas: [
      { name: 'Ice Grotto', rect: { x: 150, y: 0, w: 230, h: 100 } },
      { name: 'Frozen Lake', rect: { x: 190, y: 160, w: 160, h: 140 } },
      { name: 'Expedition Cabin', rect: { x: 40, y: 90, w: 140, h: 110 } },
      { name: 'Sled Hill', rect: { x: 440, y: 80, w: 140, h: 330 } },
      { name: 'Aurora Point', rect: { x: 330, y: 360, w: 110, h: 80 } },
    ],
    climate: { snow: true },
  };
}

// =================================================================================================
// The Dreaming Isles (40 x 30)
// =================================================================================================
export const ISLE_PEDESTALS = [{ id: 'a', x: 328, y: 80 }, { id: 'b', x: 528, y: 240 }] as const;
function buildIsles(): RegionDef {
  const cols = 40, rows = 30;
  const b = groundBuilder(cols, rows, RG.Void);
  b.disc(6, 15, 3.5, RG.StarGrass); b.disc(20, 15, 5, RG.StarGrass); b.disc(20.5, 5, 3, RG.StarGrass); b.disc(20.5, 25, 3, RG.StarGrass);
  b.disc(33, 15, 3, RG.StarGrass); b.disc(37, 23, 1.8, RG.StarGrass);
  b.rect(9, 15, 15, 16, RG.Bridge); b.rect(20, 8, 21, 10, RG.Bridge); b.rect(20, 20, 21, 22, RG.Bridge); b.rect(25, 15, 30, 16, RG.Bridge);
  b.rect(33, 18, 34, 22, RG.Bridge); b.rect(34, 22, 36, 23, RG.Bridge);
  b.disc(18.2, 24.4, 1.2, RG.Water); // the luminous pond
  const props: RegionProp[] = [
    { kind: 'observatory', x: 336, y: 236, variant: 1 }, { kind: 'pedestal', x: 328, y: 80 }, { kind: 'pedestal', x: 528, y: 240, variant: 1 },
    { kind: 'pillar', x: 328, y: 414 }, { kind: 'starfall', x: 352, y: 40 }, { kind: 'moonflower', x: 300, y: 70 }, { kind: 'moonflower', x: 360, y: 92 }, { kind: 'moonflower', x: 290, y: 100 },
    { kind: 'moonflower', x: 266, y: 214 }, { kind: 'moonflower', x: 380, y: 250 }, { kind: 'lantern', x: 136, y: 236 }, { kind: 'lantern', x: 392, y: 236 },
    { kind: 'starstone', x: 592, y: 368, when: (v) => !v.item('starstone') && !v.has('ped-stone:a') && !v.has('ped-stone:b') },
  ];
  // Lumi lives here — except while she is out and about in The Song Beneath the Stars
  const lumi: NpcDef = { id: 'lumi', name: 'Lumi', coat: 'cloud', x: 286, y: 262, species: 'lumi', when: (v) => v.has('lumi-home') && !lumiAt(v) };
  const spots: AdventureSpot[] = [
    spot({ id: 'isles-to-harbor', role: 'exit', label: 'Walk the star bridge back to Pawport', point: { x: 56, y: 244 }, radius: 24, to: { region: 'harbor', x: 456, y: 88 } }),
    npcSpot(lumi, 'Visit Lumi'),
    spot({ id: 'isles-plaque', role: 'use', label: 'Read the observatory plaque', point: { x: 316, y: 250 }, radius: 12, journal: ['pedestal-plaque'],
      text: '“Two stars wake together. If you walk alone, the starstone will keep one place for you.”' }),
    spot({ id: 'isles-scope', role: 'use', label: 'Look through the star telescope', point: { x: 356, y: 250 }, radius: 12,
      text: (v) => v.has('our-constellation') ? 'Two new stars shine side by side. They are yours.' : 'The sky is full of old constellations… and two empty places, waiting.' }),
    ...ISLE_PEDESTALS.map((p) => spot({ id: `pedestal-${p.id}`, role: 'activity', activity: 'place-stone', label: 'Look at the star pedestal', point: { x: p.x, y: p.y + 4 }, radius: 14,
      when: (v) => v.has('region:isles') && !v.done('constellation-for-two'), text: 'A silver pedestal with a star-shaped hollow. It glows faintly when someone stands on it.' })),
    spot({ id: 'starstone', role: 'collect', label: 'Pick up the starstone', point: { x: 592, y: 380 }, radius: 14,
      when: (v) => !v.done('constellation-for-two') && !v.item('starstone') && !v.has('ped-stone:a') && !v.has('ped-stone:b'),
      collect: { item: 'starstone', key: true, text: 'Warm, light and full of slow sparkles.' } }),
    spot({ id: 'symbol-isles', role: 'use', label: 'Look at the floating pillar', point: { x: 328, y: 428 }, radius: 14, journal: ['symbol-isles'], text: 'The two-paw symbol again, glowing faintly, on a pillar that floats above nothing.' }),
    spot({ id: 'moonmoths', role: 'activity', activity: 'watch', label: 'Watch the silver moths over the pond', point: { x: 300, y: 424 }, radius: 16, seen: 'creature-moonmoth', journal: ['creature-moonmoth'], text: 'A cloud of silver moths spirals up from the glowing pond, then settles again.' }),
    spot({ id: 'star-shard', role: 'collect', label: 'Pick up a fallen star shard', point: { x: 360, y: 106 }, radius: 12, collect: { item: 'star-shard', once: true, text: 'A shard of starlight, still warm.' } }),
  ];
  return {
    id: 'isles', name: 'The Dreaming Isles', cols, rows, ground: b.g, props, spots, npcs: [lumi], gates: [], spawn: { x: 96, y: 244 },
    areas: [
      { name: 'Celestial Garden', rect: { x: 260, y: 20, w: 140, h: 110 } },
      { name: 'Luminous Pond', rect: { x: 250, y: 360, w: 140, h: 110 } },
      { name: 'Star Observatory', rect: { x: 250, y: 160, w: 160, h: 120 } },
      { name: 'Eastern Isle', rect: { x: 470, y: 180, w: 120, h: 120 } },
      { name: 'Bridgehead', rect: { x: 30, y: 180, w: 120, h: 120 } },
    ],
    climate: { sky: 'void' },
  };
}

// =================================================================================================
// The adventure layer of Whiskerwood Village (the original town map stays untouched).
// =================================================================================================
export const TOWN_FOREST_GATE = { x: 384, y: 852 };
export const TOWN_PIER_END = { x: 744, y: 368 };
export const TOWN_CABLECAR = { x: 176, y: 304 };
/** Milestone 7: the station door (same place as the old Typing Arena door). */
export const TOWN_STATION_DOOR = { x: 128, y: 296 };
export const TOWN_GATES: readonly GateDef[] = [];

export function townNpcs(): NpcDef[] {
  return [
    { id: 'mabel', name: 'Mabel', coat: 'cloud', extra: 'glasses', x: 322, y: 446, facing: 'right' },
    { id: 'marlow', name: 'Captain Marlow', coat: 'cocoa', extra: 'captainhat', x: 640, y: 330, facing: 'right', pose: 'sit', when: (v) => !v.has('pier-repaired') },
    { id: 'pip', name: 'Pip', coat: 'mochi', x: 302, y: 452, facing: 'right', pose: 'sit', when: (v) => v.has('pip-home') },
    { id: 'bramble', name: 'Bramble', coat: 'pebble', x: 432, y: 352, pose: 'loaf', when: (v) => v.has('bramble-home') },
    // The Song Beneath the Stars: Lumi, once the old street chime has started to ring
    ...storyNpcs('town'),
  ];
}

export function townSpots(): AdventureSpot[] {
  const [mabel, marlow, pip, bramble] = townNpcs();
  return [
    ...storySpots('town'),
    npcSpot(mabel, 'Talk to Mabel'),
    { ...npcSpot(marlow, 'Talk to the old sailor'), point: { x: 640, y: 344 } },
    { ...npcSpot(pip, 'Say hi to Pip'), radius: 14 },
    npcSpot(bramble, 'Pet Bramble'),
    // Milestone 8.1: the park telescope is a real telescope now
    spot({ id: 'town-telescope', role: 'activity', activity: 'telescope', scope: 'town', label: 'Look through the telescope', point: { x: 612, y: 662 }, radius: 12 }),
    ...[[356, 556, 'Something papery is stuck in the apple tree’s roots'], [252, 800, 'A soggy scrap is caught in the reeds'], [630, 664, 'A paper scrap flutters by the telescope']].map(([x, y, label], i) =>
      spot({ id: `chart-${i}`, role: 'collect', label: label as string, point: { x: x as number, y: y as number }, radius: 14, when: step('lost-chart', 1),
        collect: { item: 'chart-piece', key: true, once: true, text: 'A torn piece of an old sea chart — coastlines, stars and tiny notes.' } })),
    ...[[640, 470], [636, 600], [644, 762]].map(([x, y], i) => spot({ id: `driftwood-${i}`, role: 'collect', label: 'Pick up a piece of driftwood', point: { x, y }, radius: 14, when: step('lost-chart', 3),
      collect: { item: 'driftwood', key: true, once: true, text: 'Smooth, salty and still strong.' } })),
    spot({ id: 'toolbox', role: 'use', label: 'Borrow the toolbox from the shed crates', point: { x: 516, y: 306 }, radius: 14, when: step('lost-chart', 4), text: 'A heavy toolbox: hammer, nails, a little saw. Marlow’s name is scratched on the lid.' }),
    spot({ id: 'pier-broken', role: 'sign', label: 'The end of the pier is smashed', point: TOWN_PIER_END, radius: 18, when: (v) => !v.has('pier-repaired') && !v.onStep('lost-chart', 5),
      text: 'Broken planks float in the water. Beyond, across the bay, you can just make out a dark lighthouse.' }),
    spot({ id: 'pier-repair', role: 'use', label: 'Repair the pier with Marlow’s toolbox', point: TOWN_PIER_END, radius: 18, when: step('lost-chart', 5), setFlags: ['pier-repaired', 'region:harbor'], text: 'Tap-tap-tap. Plank by plank, the pier reaches the water again. Marlow cheers from the sand!' }),
    spot({ id: 'pier-boat', role: 'exit', label: 'Board Marlow’s boat to Pawport Harbor', point: TOWN_PIER_END, radius: 18, when: (v) => v.has('pier-repaired'), to: { region: 'harbor', x: 52, y: 208, travel: 'boat' } }),
    spot({ id: 'glow-prints', role: 'use', label: 'Tiny glowing pawprints lead under the gate…', point: { x: 404, y: 830 }, radius: 14, when: step('lost-star', 0), setFlags: ['region:forest'],
      text: 'The pawprints shine like starlight and slip under the brambles. As you lean in, the old gate creaks… and swings open.' }),
    spot({ id: 'forest-gate-shut', role: 'sign', label: 'An old gate, choked with brambles', point: { x: 384, y: 848 }, radius: 14, when: (v) => !v.has('region:forest') && !v.onStep('lost-star', 0),
      text: 'The gate to the south woods has been shut for years. Mabel says nobody goes that way any more.' }),
    spot({ id: 'forest-gate', role: 'exit', label: 'Follow the path into Whisperwood Forest', point: { x: 384, y: 848 }, radius: 24, when: (v) => v.has('region:forest'), to: { region: 'forest', x: 320, y: 48 } }),
    // Milestone 7: the old Typing Arena building is now Pawville Station (PawType moved into the arcades).
    spot({ id: 'town-station', role: 'exit', label: 'Take the train to Whiskerwick City', point: TOWN_STATION_DOOR, radius: 22, to: { region: 'city', x: CITY_PLATFORM.x, y: CITY_PLATFORM.y, travel: 'train' } }),
    spot({ id: 'town-cablecar', role: 'exit', label: 'Ride the cable car up to Frostbell', point: TOWN_CABLECAR, radius: 24, when: (v) => v.has('cable-car-fixed'), to: { region: 'highlands', x: 544, y: 124, travel: 'cablecar' } }),
  ];
}

// ---- registry -----------------------------------------------------------------------------------
let cache: Partial<Record<string, RegionDef>> = {};
export function regionDef(id: Exclude<RegionId, 'town'>): RegionDef {
  const hit = cache[id];
  if (hit) return hit;
  const def = id === 'temple' ? buildTemple() : id === 'harbor' ? buildHarbor() : id === 'forest' ? buildForest() : id === 'cave' ? buildCave() : id === 'highlands' ? buildHighlands()
    : id === 'city' ? buildCity() : id === 'arcade-hall' ? buildArcadeHall()
    : id === 'city-park' ? buildCityPark() : id === 'old-town' ? buildOldTown() : id === 'rooftops' ? buildRooftops()
    : id === 'hearth' ? buildHearth() : id === 'library' ? buildLibrary() : id === 'purring-cup' ? buildPurringCup() : id === 'funfair' ? buildFunfair() : buildIsles();
  // New living residents use real scene geometry and the existing talk-spot contract.
  for (const person of NEW_RESIDENTS.filter((n) => n.region === id)) {
    def.npcs.push({ id: person.id, name: person.name, coat: person.coat, extra: person.extra,
      x: person.stops[0].x, y: person.stops[0].y, facing: 'down' });
    def.spots.push(npcSpot(def.npcs[def.npcs.length - 1], `Talk to ${person.name}`));
  }
  // The Song Beneath the Stars: scene spots, Lumi and the other companions (the temple builds its own)
  if (id !== 'temple') { def.npcs.push(...storyNpcs(id)); def.spots.push(...storySpots(id)); }
  cache[id] = def;
  return def;
}
export function resetRegionCacheForTests(): void {
  cache = {};
}
export const EXPLORE_REGIONS = ['harbor', 'forest', 'cave', 'highlands', 'isles', 'city', 'arcade-hall', 'city-park', 'old-town', 'rooftops', 'hearth', 'library', 'purring-cup', 'funfair', 'temple'] as const;
