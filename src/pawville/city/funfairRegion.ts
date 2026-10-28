/**
 * Whiskerwick Funfair — a walled little theme park reached from the city boardwalk.
 *
 * Layout (40×32 tiles, 16 px each): a picket-fenced park with ONE gate in the south. A paved promenade runs
 * north from the gate to the Ring Toss booth, a cross avenue carries guests between the Ferris wheel (west)
 * and the Moonbeam Carousel (east); the Bumper Paws arena and the Cloud Swing Ride sit on the south side.
 * Lamps, bunting, planters, flowerbeds and benches line the paths; every attraction has a clear walk-up
 * spot just outside its collider, so nothing can be walked through and nobody can get trapped.
 *
 * Built with the same RegionDef toolkit as every other region (movement, collision, camera, presence, emotes,
 * photo mode and quests work unchanged).
 */
import { seededRandom, type Vec2 } from '../world/geometry.ts';
import { RG, groundBuilder, type AdventureSpot, type NpcDef, type RegionDef, type RegionProp } from '../adventure/regionKit.ts';
import { FAIR_LAYOUT, RIDE_NAMES, stand } from './funfair.ts';

const spot = (s: Omit<AdventureSpot, 'kind'>): AdventureSpot => ({ kind: 'adventure', ...s });

/** Where you arrive when you walk in from the city, and where the city drops you when you leave. */
export const FUNFAIR_ARRIVAL: Vec2 = FAIR_LAYOUT.spawn;
export const CITY_FUNFAIR_GATE: Vec2 = { x: 760, y: 612 };
export const CITY_FUNFAIR_RETURN: Vec2 = { x: 760, y: 634 };

export const FUNFAIR_NPC: NpcDef = { id: 'nutmeg', name: 'Nutmeg', coat: 'cocoa', extra: 'scarf', x: 252, y: 470, facing: 'right' };

export function buildFunfair(): RegionDef {
  const cols = 40, rows = 32;
  const b = groundBuilder(cols, rows, RG.Hedge);
  // the park: grass inside a picket fence (cols 3..36, rows 4..30)
  b.rect(3, 4, 36, 30, RG.Fence);
  b.rect(4, 5, 35, 29, RG.Grass);
  // flower borders along the north and south walls
  b.rect(4, 5, 35, 5, RG.Flowers); b.rect(4, 29, 16, 29, RG.Flowers); b.rect(23, 29, 35, 29, RG.Flowers);
  // the promenade (gate → plaza → ring toss) and the cross avenue
  b.rect(18, 8, 21, 30, RG.Paving);
  b.rect(18, 30, 21, 31, RG.Paving); // the gate gap in the fence + the step outside
  b.rect(14, 11, 25, 17, RG.Paving); // central plaza (a plain paved square: clear lines, room for the fountain)
  b.rect(14, 11, 14, 11, RG.Flowers); b.rect(25, 11, 25, 11, RG.Flowers); // (tiny flower corners)
  b.rect(5, 18, 34, 20, RG.Paving); // cross avenue
  b.rect(8, 21, 10, 23, RG.Wood); b.rect(31, 21, 33, 23, RG.Wood); // little boarding decks
  // ride aprons: wooden boards under the swing and the bumper arena
  b.rect(27, 26, 35, 29, RG.Wood); b.rect(4, 26, 12, 29, RG.Wood);
  b.rect(12, 28, 17, 29, RG.Paving); b.rect(22, 28, 26, 29, RG.Paving); // walkways along the south side to the arena door and the swing ride's gate

  const P = (kind: string, x: number, y: number, variant = 0): RegionProp => ({ kind, x, y, variant });
  const props: RegionProp[] = [
    // ---- the attractions ----
    P('ferris', FAIR_LAYOUT.ferris.x, FAIR_LAYOUT.ferris.y),
    P('carousel', FAIR_LAYOUT.carousel.x, FAIR_LAYOUT.carousel.y),
    P('swingride', FAIR_LAYOUT.swing.x, FAIR_LAYOUT.swing.y),
    P('bumperarena', FAIR_LAYOUT.bumper.x, FAIR_LAYOUT.bumper.y),
    P('ringbooth', FAIR_LAYOUT.ring.x, FAIR_LAYOUT.ring.y),
    // ---- the gate ----
    P('funfairarch', FAIR_LAYOUT.gate.x, FAIR_LAYOUT.gate.y),
    P('fairpillar', 276, 496), P('fairpillar', 364, 496),
    P('ticketbooth', FAIR_LAYOUT.ticket.x, FAIR_LAYOUT.ticket.y),
    P('balloons', 196, 476), P('balloons', 446, 476, 1),
    // the plaza: a fountain, an ice-cream cart and a prize stall for guests (and NPCs) to gather round
    P('cityfountain', 320, 252), P('icecart', 404, 236), P('marketstall', 238, 236, 0),
    // ---- lamps along the promenade and avenue ----
    ...[[298, 440], [342, 440], [298, 372], [342, 372], [298, 232], [342, 232], [298, 120], [342, 120]].map(([x, y]) => P('lamp', x, y)),
    ...[[70, 330], [220, 330], [420, 330], [570, 330]].map(([x, y]) => P('lamp', x, y)),
    // ---- bunting strung between poles (drawn as one sprite each) ----
    P('fairbunting', 320, 336, 0), P('fairbunting', 320, 132, 2),
    // ---- benches, planters and flowers: places for NPCs and guests to gather ----
    P('parkbench', 262, 282), P('parkbench', 378, 282), P('parkbench', 250, 196), P('parkbench', 390, 196),
    P('planter', 288, 282), P('planter', 352, 282), P('planter', 288, 206), P('planter', 352, 206),
    P('flowerbed', 66, 236), P('flowerbed', 584, 236), P('flowerbed', 66, 396), P('flowerbed', 584, 396),
    P('fairsign', 262, 332), // the "park map" board by the avenue
    P('fairsign', 378, 332, 1),
    // ---- trees and hedges peeking over the fence ----
    ...[40, 90, 150, 200, 250, 390, 440, 490, 550, 600].map((x, i) => P(i % 3 === 1 ? 'pine' : 'tree', x, 52 + (i % 2) * 6, i % 3)),
    ...[28, 70, 110, 150, 190, 230, 270, 410, 450, 490, 530, 570, 612].map((x, i) => P(i % 4 === 2 ? 'pine' : 'tree', x, 508 + (i % 2) * 2, i % 3)),
    ...[34, 100, 170, 240].map((y, i) => P('tree', 24, y + 20, i % 3)), ...[34, 100, 170, 240].map((y, i) => P('tree', 616, y + 20, (i + 1) % 3)),
    ...[300, 380, 450].map((y, i) => P('tree', 24, y, i % 3)), ...[300, 380, 450].map((y, i) => P('tree', 616, y, (i + 2) % 3)),
  ];
  // a little scatter of flowers on the lawns (decor only)
  const rand = seededRandom(0xfa17);
  for (let i = 0; i < 18; i++) {
    const x = 70 + Math.round(rand() * 500), y = 100 + Math.round(rand() * 350);
    const onPath = (x > 280 && x < 360) || (y > 285 && y < 335);
    if (!onPath && !props.some((q) => Math.hypot(q.x - x, q.y - y) < 46)) props.push(P('flowerbed', x, y));
  }

  const nutmeg = FUNFAIR_NPC;
  const rideSpot = (ride: 'ferris' | 'carousel' | 'swing', label: string): AdventureSpot => {
    const st = stand(ride);
    return spot({ id: `fair-${ride}`, role: 'activity', activity: 'ride', ride, label, point: { x: st.x, y: st.y }, radius: 18 });
  };
  const spots: AdventureSpot[] = [
    spot({ id: 'fair-gate-exit', role: 'exit', label: 'Leave the funfair (back to the boardwalk)', point: { x: 320, y: 488 }, radius: 20, to: { region: 'city', x: CITY_FUNFAIR_RETURN.x, y: CITY_FUNFAIR_RETURN.y } }),
    rideSpot('ferris', `Ride the ${RIDE_NAMES.ferris}`),
    rideSpot('carousel', `Hop on the ${RIDE_NAMES.carousel}`),
    rideSpot('swing', `Take a seat on the ${RIDE_NAMES.swing}`),
    spot({ id: 'fair-bumper', role: 'activity', activity: 'machine', machine: 'bumper', label: 'Drive in Bumper Paws', point: { x: FAIR_LAYOUT.bumper.x, y: FAIR_LAYOUT.bumper.y + 16 }, radius: 20 }),
    spot({ id: 'fair-ringtoss', role: 'activity', activity: 'machine', machine: 'ringtoss', label: 'Play Ring Toss', point: { x: FAIR_LAYOUT.ring.x, y: FAIR_LAYOUT.ring.y + 22 }, radius: 20 }),
    { ...spot({ id: 'talk-nutmeg', role: 'npc', npc: 'nutmeg', label: 'Talk to Nutmeg, the ticket-taker', point: { x: nutmeg.x, y: nutmeg.y }, radius: 26 }) },
    spot({ id: 'fair-map-w', role: 'sign', label: 'Read the park map', point: { x: 262, y: 344 }, radius: 14,
      text: 'WHISKERWICK FUNFAIR — West: the Ferris Wheel (one slow turn, two cats welcome). East: the Moonbeam Carousel. South-west: Bumper Paws (arrow keys / WASD). South-east: the Cloud Swing Ride. North: Ring Toss. Rides are free. Hop off any time — you leave at the next stop.' }),
    spot({ id: 'fair-map-e', role: 'sign', label: 'Read the rider rules', point: { x: 378, y: 344 }, radius: 14,
      text: 'RIDER RULES: wait at the gate and your seat comes to you · keep paws inside the ride · two riders, two seats · the Cloud Swing Ride only loads while it is slow · Esc or “Get off” leaves at the next stop.' }),
    ...[[262, 282], [378, 282], [250, 196], [390, 196]].map(([x, y], i) => spot({ id: `fair-bench-${i}`, role: 'activity', activity: 'bench', label: 'Sit on the bench', point: { x, y: y + 12 }, radius: 14 })),
  ];
  return {
    id: 'funfair', name: 'Whiskerwick Funfair', cols, rows, ground: b.g, props, spots, npcs: [nutmeg], gates: [], spawn: FUNFAIR_ARRIVAL,
    areas: [
      { name: 'Funfair Gate', rect: { x: 230, y: 440, w: 180, h: 72 } },
      { name: 'Ring Toss Row', rect: { x: 230, y: 90, w: 180, h: 130 } },
      { name: 'Ferris Wheel Plaza', rect: { x: 48, y: 150, w: 190, h: 190 } },
      { name: 'Carousel Square', rect: { x: 410, y: 190, w: 190, h: 150 } },
      { name: 'Bumper Paws Arena', rect: { x: 48, y: 370, w: 190, h: 110 } },
      { name: 'Cloud Swing Lawn', rect: { x: 410, y: 370, w: 190, h: 110 } },
      { name: 'The Midway', rect: { x: 230, y: 220, w: 180, h: 220 } },
    ],
    climate: { water: false },
  };
}

