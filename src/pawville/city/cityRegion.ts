/**
 * Whiskerwick City (Milestone 7) — a new explorable region connected to Pawville by train.
 *
 * Districts (first phase): Transport Hub (west), Central Plaza (centre), Shopping Street (north),
 * Entertainment District (east, with the walk-in Arcade), Café Quarter (south) and the Waterfront
 * boardwalk (south edge). Built with the same RegionDef toolkit as every other region, so
 * movement, collision, camera, presence, emotes, photo mode and quests work unchanged.
 */
import { CITY_FUNFAIR_GATE, FUNFAIR_ARRIVAL } from './funfairRegion.ts';
import { seededRandom, type Vec2 } from '../world/geometry.ts';
import { RG, groundBuilder, scatter, type AdventureSpot, type NpcDef, type RegionDef, type RegionProp } from '../adventure/regionKit.ts';
import type { AdvView } from '../adventure/state.ts';

const spot = (s: Omit<AdventureSpot, 'kind'>): AdventureSpot => ({ kind: 'adventure', ...s });
const npcSpot = (n: NpcDef, label: string): AdventureSpot => spot({ id: `talk-${n.id}`, role: 'npc', npc: n.id, label, point: { x: n.x, y: n.y }, radius: 29, when: n.when });

/** Where you arrive by train / from Pawville. */
export const CITY_PLATFORM: Vec2 = { x: 120, y: 452 };
export const CITY_ARCADE_DOOR: Vec2 = { x: 832, y: 436 };
const night = (phase: string) => phase === 'evening' || phase === 'night';

// ---- residents (with simple routines) ------------------------------------------------------------
export function cityNpcs(): NpcDef[] {
  return [
    {
      id: 'clementine', name: 'Clementine', coat: 'mint', extra: 'glasses', x: 156, y: 420, facing: 'down',
      schedule: () => ({ x: 156, y: 420, facing: 'down', doing: 'Minding the platform' }),
    },
    {
      id: 'biscuit', name: 'Biscuit', coat: 'mochi', extra: 'scarf', x: 548, y: 360, facing: 'down',
      // plays by the fountain in the day; moves under the café awning when it rains or after dark
      schedule: ({ phase, rain }) => (rain || night(phase)
        ? { x: 372, y: 636, facing: 'down', pose: 'sit', doing: 'Playing softly on the café terrace' }
        : { x: 548, y: 360, facing: 'down', doing: 'Busking by the fountain' }),
    },
    {
      id: 'rosie', name: 'Rosie', coat: 'blossom', extra: 'flower', x: 256, y: 190, facing: 'down',
      schedule: ({ phase }) => (night(phase)
        ? { x: 300, y: 640, facing: 'right', pose: 'sit', doing: 'Having tea at the café after closing' }
        : { x: 256, y: 190, facing: 'down', doing: 'Sweeping the bakery step' }),
    },
    { id: 'pemberton', name: 'Mr. Pemberton', coat: 'cocoa', extra: 'glasses', x: 768, y: 190, facing: 'down', schedule: () => ({ x: 768, y: 190, facing: 'down', doing: 'Counting apples' }) },
  ];
}

export function arcadeNpcs(): NpcDef[] {
  return [{ id: 'ozzie', name: 'Ozzie', coat: 'pebble', extra: 'starclip', x: 192, y: 198, facing: 'down', schedule: () => ({ x: 192, y: 198, facing: 'down', doing: 'Polishing the cabinets' }) }];
}

// ---- the city map --------------------------------------------------------------------------------
export function buildCity(): RegionDef {
  const cols = 64, rows = 46;
  const b = groundBuilder(cols, rows, RG.Grass);
  // streets
  b.rect(0, 27, 63, 29, RG.Cobble); // Main Avenue (west → east)
  b.rect(12, 12, 55, 13, RG.Cobble); // Shopping Street, clear in front of the recessed storefronts
  b.rect(31, 11, 33, 37, RG.Cobble); // Fountain Way (north → south)
  b.rect(12, 11, 13, 29, RG.Cobble); // Station Lane
  b.rect(55, 11, 56, 29, RG.Cobble); // Arcade Row — 8.1: between the arcade and the cinema (it used to run under the arcade)
  b.rect(26, 34, 47, 35, RG.Cobble); // Café Lane — starts east of The Purring Cup so it never runs behind the cafés
  b.disc(32.5, 20.5, 6.4, RG.Paving); // Central Plaza
  b.rect(15, 13, 26, 14, RG.Flowers); b.rect(38, 13, 50, 14, RG.Flowers);
  // transport hub: tracks along the west edge, a platform beside them
  b.rect(0, 0, 1, 37, RG.Rail);
  b.rect(2, 18, 11, 29, RG.Paving);
  // waterfront: boardwalk + sea
  b.rect(0, 38, 63, 40, RG.Dock);
  b.rect(0, 41, 63, 45, RG.Water);
  b.rect(44, 41, 46, 44, RG.Dock); // the fishing pier
  b.rect(0, 0, 63, 1, RG.Brick); // the north city wall
  b.rect(12, 0, 13, 11, RG.Cobble); b.rect(32, 0, 33, 11, RG.Cobble); // Milestone 8: archway to Old Town, gate to the park
  b.rect(2, 0, 2, 37, RG.Brick);

  const props: RegionProp[] = [
    { kind: 'citystation', x: 88, y: 286 },
    { kind: 'train', x: 16, y: 470 },
    { kind: 'ticketmachine', x: 184, y: 404 },
    { kind: 'cityfountain', x: 528, y: 336 },
    { kind: 'shop', x: 256, y: 160, variant: 0 }, // bakery
    { kind: 'shop', x: 352, y: 160, variant: 1 }, // florist
    { kind: 'shop', x: 640, y: 160, variant: 2 }, // toy shop
    { kind: 'shop', x: 768, y: 160, variant: 3 }, // market
    { kind: 'arcadebldg', x: 832, y: 424 },
    { kind: 'cinema', x: 960, y: 424 },
    { kind: 'photobooth', x: 908, y: 516 }, // 8.1: off Main Avenue, on the grass by the cinema
    { kind: 'cafe', x: 352, y: 590 },
    { kind: 'cafetable', x: 300, y: 648 }, { kind: 'cafetable', x: 340, y: 652 }, { kind: 'cafetable', x: 404, y: 648 },
    { kind: 'icecart', x: 470, y: 600 },
    // Milestone 8: more storefronts, the bistro, an archway and the park gate, plaza and boardwalk details
    { kind: 'shop', x: 480, y: 160, variant: 4 }, // Hearth & Whisker
    { kind: 'cafe', x: 200, y: 590, variant: 1 }, // Le Petit Moustache
    { kind: 'archway', x: 200, y: 40 }, { kind: 'parkgate', x: 528, y: 40 },
    { kind: 'marketstall', x: 430, y: 250, variant: 0 }, { kind: 'marketstall', x: 626, y: 250, variant: 1 },
    { kind: 'statue', x: 640, y: 330 },
    { kind: 'flowerbed', x: 450, y: 340 }, { kind: 'flowerbed', x: 606, y: 340 },
    { kind: 'gull', x: 930, y: 640 }, { kind: 'gull', x: 946, y: 642, variant: 1 }, { kind: 'gull', x: 962, y: 640, variant: 2 },
    { kind: 'boardwalkstall', x: 880, y: 600 },
    { kind: 'photobooth', x: 828, y: 540, variant: 1 }, // funfair kiosk
    { kind: 'ferris', x: 760, y: 606 },
    { kind: 'telescope', x: 620, y: 636 },
    { kind: 'noticeboard', x: 470, y: 268 },
    { kind: 'bench', x: 470, y: 380 }, { kind: 'bench', x: 586, y: 380 }, { kind: 'bench', x: 470, y: 300 }, { kind: 'bench', x: 586, y: 300 },
    { kind: 'bench', x: 120, y: 340 }, { kind: 'bench', x: 560, y: 632 }, { kind: 'bench', x: 880, y: 632 },
    { kind: 'vending', x: 152, y: 404 }, // 8.1: on the station platform, not in Station Lane
  ];
  for (const x of [64, 224, 400, 608, 736, 880, 992]) props.push({ kind: 'lamp', x, y: 426 });
  for (const x of [224, 432, 608, 832]) props.push({ kind: 'lamp', x, y: 210 });
  for (const x of [96, 288, 480, 672, 864, 992]) props.push({ kind: 'lamp', x, y: 612 });
  props.push({ kind: 'flag', x: 240, y: 418, variant: 1 }, { kind: 'flag', x: 1000, y: 610, variant: 2 });
  const keep: Vec2[] = [CITY_PLATFORM, CITY_ARCADE_DOOR, { x: 528, y: 360 }, { x: 352, y: 610 }, { x: 760, y: 620 }, { x: 528, y: 56 }, { x: 200, y: 56 }, { x: 480, y: 200 }, { x: 200, y: 610 }, { x: 946, y: 636 },
    // Milestone 10: the Ferris wheel is ~110 px tall — keep trees out of the whole wheel, not just its feet
    { x: 760, y: 580 }, { x: 760, y: 540 }, { x: 724, y: 560 }, { x: 796, y: 560 }, { x: 716, y: 600 }, { x: 804, y: 600 }, { x: 760, y: 504 }];
  const rand = seededRandom(0xc17e);
  props.push(...scatter({ cols, rows, ground: b.g }, rand, 34, 'tree', [RG.Grass], [...keep, ...props], 34, 3, props));
  props.push(...scatter({ cols, rows, ground: b.g }, rand, 14, 'bush', [RG.Grass], [...keep, ...props], 28, 2, props));
  // Funfair: the Ferris wheel and the kiosk moved into the walled funfair park (the scatter above ran with them
  // in place, so every tree stays exactly where it was). Their spot on the boardwalk is now the park's front gate.
  for (let i = props.length - 1; i >= 0; i--) if (props[i].kind === 'ferris' || (props[i].kind === 'photobooth' && props[i].variant === 1)) props.splice(i, 1);
  props.push({ kind: 'funfairgate', x: 760, y: 606 }, { kind: 'fairpillar', x: 718, y: 608 }, { kind: 'fairpillar', x: 802, y: 608 });

  const npcs = cityNpcs();
  const [clementine, biscuit, rosie, pemberton] = npcs;
  const shopDoor = (id: string, shop: string, x: number, label: string) => spot({ id, role: 'activity', activity: 'shop', shop, label, point: { x, y: 180 }, radius: 22 });
  const spots: AdventureSpot[] = [
    spot({ id: 'city-train-home', role: 'exit', label: 'Take the train home to Pawville', point: { x: 76, y: 452 }, radius: 16, to: { region: 'town', x: 128, y: 312, travel: 'train' } }),
    spot({ id: 'city-tickets', role: 'activity', activity: 'machine', machine: 'tickets', label: 'Use the ticket machine', point: { x: 184, y: 416 }, radius: 14 }),
    npcSpot(clementine, 'Talk to Clementine, the station master'),
    npcSpot(biscuit, 'Listen to Biscuit'),
    npcSpot(rosie, 'Talk to Rosie'),
    npcSpot(pemberton, 'Talk to Mr. Pemberton'),
    shopDoor('shop-bakery', 'bakery', 256, 'Enter Crumbs & Whiskers Bakery'),
    shopDoor('shop-florist', 'florist', 352, 'Enter Petal & Paw Florist'),
    shopDoor('shop-toys', 'toyshop', 640, 'Enter Tumble Toys'),
    { ...shopDoor('shop-market', 'market', 768, 'Enter the Corner Market'), point: { x: 800, y: 180 } },
    spot({ id: 'city-arcade-door', role: 'exit', label: 'Enter the Whiskerwick Arcade', point: CITY_ARCADE_DOOR, radius: 16, to: { region: 'arcade-hall', x: 192, y: 236 } }),
    spot({ id: 'city-fountain', role: 'activity', activity: 'wish', label: 'Toss a paw token into the fountain', point: { x: 528, y: 360 }, radius: 18 }),
    spot({ id: 'city-board', role: 'sign', label: 'Read the plaza noticeboard', point: { x: 470, y: 282 }, radius: 14, text: noticeboard }),
    // Milestone 8.2: the Bijou shows real (short, animated) films
    spot({ id: 'city-cinema', role: 'activity', activity: 'machine', machine: 'cinema', label: 'Buy a ticket at the Bijou', point: { x: 960, y: 436 }, radius: 16, text: cinema }),
    spot({ id: 'city-photobooth', role: 'activity', activity: 'photo', label: 'Squeeze into the photo booth', point: { x: 908, y: 530 }, radius: 22 }),
    spot({ id: 'city-telescope', role: 'activity', activity: 'telescope', scope: 'city', label: 'Look through the boardwalk telescope', point: { x: 620, y: 650 }, radius: 14, text: telescope, journal: ['city-telescope'], seen: 'landmark-city-telescope' }),
    // Funfair: the Ferris wheel, carousel, swing ride, bumper cars and ring toss live in their own walled park.
    spot({ id: 'city-funfair-gate', role: 'exit', label: 'Walk through the arch into the Whiskerwick Funfair', point: CITY_FUNFAIR_GATE, radius: 24, to: { region: 'funfair', x: FUNFAIR_ARRIVAL.x, y: FUNFAIR_ARRIVAL.y },
      text: 'Free rides, a Ferris wheel and a carousel…' }),
    spot({ id: 'city-pier-fish', role: 'activity', activity: 'fish', label: 'Fish off the city pier', point: { x: 720, y: 680 }, radius: 14 }),
    // ---- Milestone 8: gates to the new districts and interiors ----
    spot({ id: 'city-to-park', role: 'exit', label: 'Walk north into Grand City Park', point: { x: 528, y: 48 }, radius: 30, to: { region: 'city-park', x: 528, y: 668 } }),
    spot({ id: 'city-to-oldtown', role: 'exit', label: 'Take the old archway into Old Town', point: { x: 200, y: 48 }, radius: 30, to: { region: 'old-town', x: 120, y: 604 } }),
    spot({ id: 'city-hearth-door', role: 'exit', label: 'Enter Hearth & Whisker (furniture)', point: { x: 480, y: 180 }, radius: 22, to: { region: 'hearth', x: 192, y: 232 } }),
    spot({ id: 'city-cup-door', role: 'exit', label: 'Step inside The Purring Cup', point: { x: 352, y: 610 }, radius: 16, to: { region: 'purring-cup', x: 192, y: 232 } }),
    spot({ id: 'city-icecream', role: 'activity', activity: 'shop', shop: 'icecream', label: 'Buy a scoop at the ice-cream cart', point: { x: 470, y: 616 }, radius: 16 }),
    spot({ id: 'city-bistro', role: 'activity', activity: 'shop', shop: 'bistro', label: 'Order at Le Petit Moustache bistro', point: { x: 200, y: 610 }, radius: 16 }),
    spot({ id: 'city-gulls', role: 'activity', activity: 'watch', label: 'Watch the gulls on the boardwalk rail', point: { x: 946, y: 636 }, radius: 16, seen: 'creature-gulls',
      text: 'Three gulls stand in a row. The middle one is definitely planning to steal a chip.' }),
    spot({ id: 'city-vending', role: 'activity', activity: 'machine', machine: 'vending', label: 'Use the platform vending machine', point: { x: 152, y: 416 }, radius: 14 }),
    ...[[470, 380], [586, 380], [470, 300], [586, 300], [120, 340], [560, 632], [880, 632]].map(([x, y], i) => spot({ id: `city-bench-${i}`, role: 'activity', activity: 'bench', label: 'Sit on the bench', point: { x, y: y + 12 }, radius: 14 })),
  ];
  return {
    id: 'city', name: 'Whiskerwick City', cols, rows, ground: b.g, props, spots, npcs, gates: [], spawn: CITY_PLATFORM,
    areas: [
      { name: 'Whiskerwick Station', rect: { x: 0, y: 260, w: 200, h: 220 } },
      { name: 'Central Plaza', rect: { x: 420, y: 230, w: 220, h: 190 } },
      { name: 'Shopping Street', rect: { x: 190, y: 120, w: 700, h: 100 } },
      { name: 'Entertainment District', rect: { x: 760, y: 340, w: 264, h: 170 } },
      { name: 'Café Quarter', rect: { x: 240, y: 540, w: 300, h: 120 } },
      { name: 'The Boardwalk', rect: { x: 0, y: 600, w: 1024, h: 136 } },
    ],
    climate: { water: true },
  };
}

// ---- the arcade (walk-in interior) ---------------------------------------------------------------
export const ARCADE_MACHINES = [
  { id: 'pawtype', label: 'PawType cabinet — typing races', x: 64, route: '/games/pawtype' },
  { id: 'pvp', label: 'Paw vs Paw cabinet', x: 112, route: '/arcade' },
  { id: 'whack', label: 'Whack-a-Cat cabinet', x: 160, route: '/games/whack-a-cat' },
  { id: 'pairs', label: 'Paw Pairs (Memory Paws) cabinet', x: 224, route: '/games/memory-paws' },
  { id: 'boxing', label: 'Cat Boxing cabinet', x: 272, route: '/games/cat-boxing' },
  { id: 'melody', label: 'Meow Melody cabinet', x: 320, route: null },
] as const;

export function buildArcadeHall(): RegionDef {
  const cols = 24, rows = 16;
  const b = groundBuilder(cols, rows, RG.CaveWall);
  b.rect(1, 4, 22, 15, RG.Carpet);
  b.rect(11, 15, 12, 15, RG.Carpet);
  const props: RegionProp[] = ARCADE_MACHINES.map((m, i) => ({ kind: 'cabinet', x: m.x, y: 92, variant: i }));
  props.push({ kind: 'claw', x: 64, y: 196 }, { kind: 'claw', x: 88, y: 196 }, { kind: 'vending', x: 320, y: 196 }, { kind: 'cabinet', x: 296, y: 196, variant: 6 });
  // Milestone 8.2: two new cabinets on the bottom row (either side of the doorway path)
  props.push({ kind: 'cabinet', x: 152, y: 196, variant: 5 }, { kind: 'cabinet', x: 232, y: 196, variant: 3 });
  const npcs = arcadeNpcs();
  const spots: AdventureSpot[] = [
    spot({ id: 'arcade-exit', role: 'exit', label: 'Back out to Arcade Row', point: { x: 192, y: 248 }, radius: 14, to: { region: 'city', x: 832, y: 452 } }),
    npcSpot(npcs[0], 'Talk to Ozzie'),
    ...ARCADE_MACHINES.map((m) => spot({ id: `cab-${m.id}`, role: 'activity', activity: 'machine', machine: m.id, route: m.route ?? undefined, label: `Play: ${m.label}`, point: { x: m.x, y: 106 }, radius: 13 })),
    spot({ id: 'cab-claw', role: 'activity', activity: 'machine', machine: 'claw', label: 'Try the claw machine (1 token)', point: { x: 76, y: 210 }, radius: 16 }),
    spot({ id: 'cab-vending', role: 'activity', activity: 'machine', machine: 'vending', label: 'Use the snack machine', point: { x: 320, y: 210 }, radius: 13 }),
    spot({ id: 'cab-changer', role: 'activity', activity: 'machine', machine: 'records', label: 'Check the high-score board', point: { x: 296, y: 210 }, radius: 12 }),
    spot({ id: 'cab-rush', role: 'activity', activity: 'machine', machine: 'rush', label: 'Play: Cat Café Rush cabinet', point: { x: 152, y: 210 }, radius: 13 }),
    spot({ id: 'cab-frenzy', role: 'activity', activity: 'machine', machine: 'frenzy', label: 'Play: Fish Frenzy cabinet', point: { x: 232, y: 210 }, radius: 13 }),
  ];
  return {
    id: 'arcade-hall', name: 'Whiskerwick Arcade', cols, rows, ground: b.g, props, spots, npcs, gates: [], spawn: { x: 192, y: 236 },
    areas: [{ name: 'Whiskerwick Arcade', rect: { x: 0, y: 0, w: 384, h: 256 } }], climate: { dark: true },
  };
}

// ---- dynamic texts (react to the wider world) ----------------------------------------------------
function noticeboard(v: AdvView): string {
  const lines = [v.done('biscuits-song') ? 'TONIGHT & EVERY NIGHT: Biscuit plays his finished song — bring a friend!' : 'WANTED: someone to help Biscuit finish his song (ask him by the fountain).'];
  lines.push(v.has('harbor-restored') ? 'NEWS: Pawport’s lighthouse shines again! Day trips by ferry “coming soon”.' : 'RUMOUR: the old Pawport lighthouse went dark in the storm.');
  lines.push(v.has('constellation-lumi') ? 'ASTRONOMY CLUB: a NEW five-star constellation appeared over the bay. Nobody can explain it.' : 'ASTRONOMY CLUB: meets on the boardwalk at night. Bring a blanket.');
  lines.push(v.done('lost-scarf') ? 'FOUND: one blue scarf, now back with Nana Tulip. Thank you!' : 'LOST: one blue scarf, last seen near the park gazebo. Ask Nana Tulip in the Residential District.');
  lines.push(v.has('clock-fixed') ? 'OLD TOWN: the clock strikes twelve again! Mystery solved.' : 'OLD TOWN: why has the clock tower been stuck at eleven for a century? Mr. Velvet wonders.');
  return lines.join('  ·  ');
}
function cinema(v: AdvView): string {
  return v.done('lost-star')
    ? 'Tonight: “The Star Who Fell”. A tiny glowing creature lands in a forest… you could swear you’ve met her.'
    : 'Tonight: “Whiskers at Sea”, an old black-and-white film about a sailor called… Marlow? The audience purrs through the ending.';
}
function telescope(v: AdvView): string {
  if (v.has('constellation-lumi')) return 'You find Lumi’s constellation: five stars, a starry tail. From the city it looks like she is waving.';
  return 'Gulls, boats and a dark lighthouse on the far shore. At night the sky here is full of stars — but a few seem missing.';
}
