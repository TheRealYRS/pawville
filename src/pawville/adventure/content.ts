/**
 * Adventure content (Milestone 6): quests, journal entries and region metadata. Pure data —
 * the engine (engine.ts) runs it, the regions (regions/*.ts) place the spots it refers to.
 *
 * Three connected layers:
 *   main adventures  — unlock regions and advance the central mystery (the Two-Paw Temple)
 *   regional stories — develop each place and its cats
 *   discoveries      — reward curiosity (shells, beach clean-up, ancient symbols, a stray friend)
 * A discovery can open a regional story (the bottle message → the mountain trail), a regional
 * story can feed a main one, and the main ones unlock whole new regions.
 */
import { SKY, skyJournalId } from './telescope.ts';
import type { QuestDef } from './engine.ts';
import type { RegionId } from './state.ts';

export const QUESTS: readonly QuestDef[] = [
  // ------------------------------------------------------------------ main 1: the harbor
  {
    id: 'lost-chart', title: 'The Lost Navigation Chart', layer: 'main', region: 'town',
    summary: 'An old sailor sits on the docks every evening, staring across the bay. Mabel thinks he needs help.',
    startOn: { type: 'talk', target: 'mabel' },
    objectives: [
      { id: 'find-sailor', text: 'Find the old sailor by the docks', hint: 'Mabel said he sits on the sand east of the Harbor building, near the pier.', on: { type: 'talk', target: 'marlow' }, effects: { journal: ['marlow-story'] } },
      { id: 'pieces', text: 'Recover the 3 torn pieces of Marlow’s chart', hint: 'A gull scattered them: one where apples fall, one in the reeds by the lily pond, one where stars are watched.', on: { type: 'collect', target: 'chart-piece' }, need: 3, unique: true, effects: { journal: ['gull-rhyme'] } },
      { id: 'return-chart', text: 'Bring the chart back to Captain Marlow', hint: 'He is still on the sand by the pier.', on: { type: 'talk', target: 'marlow' }, effects: { take: { 'chart-piece': 3 }, give: { 'navigation-chart': 1 }, flags: ['chart-mended'], journal: ['marlow-plan'] } },
      { id: 'driftwood', text: 'Gather 3 pieces of driftwood on the beach', hint: 'Look along the sandy shore that runs the length of town, east of every street.', on: { type: 'collect', target: 'driftwood' }, need: 3, unique: true },
      { id: 'toolbox', text: 'Borrow the toolbox from the harbor shed', hint: 'The shed crates sit just south-west of the Harbor building’s door.', on: { type: 'use', target: 'toolbox' }, effects: { give: { toolbox: 1 } } },
      { id: 'repair', text: 'Repair the broken end of the pier', hint: 'Walk to the very end of the wooden pier, past the fishing spot.', on: { type: 'flag', target: 'pier-repaired' }, effects: { take: { toolbox: 1 }, flags: ['region:harbor'] } },
    ],
    rewards: { journal: ['pier-mended'], memory: { title: 'The pier is mended', detail: 'Captain Marlow’s boat can cross the bay again.' }, items: { shell: 1 } },
  },
  // ------------------------------------------------------------------ main 2: the lighthouse
  {
    id: 'lighthouse-mystery', title: 'The Lighthouse Mystery', layer: 'main', region: 'harbor',
    summary: 'Pawport’s lighthouse has been dark since the storm. Without it, no boat dares to sail at night.',
    prereq: (v) => v.done('lost-chart'),
    objectives: [
      { id: 'sail', text: 'Sail to Pawport Harbor', hint: 'Board Captain Marlow’s boat at the end of the mended pier.', on: { type: 'enter', target: 'harbor' } },
      { id: 'investigate', text: 'Investigate the dark lighthouse', hint: 'The lighthouse stands on the rocks in the north-east of the harbor.', on: { type: 'use', target: 'lighthouse-door' }, effects: { journal: ['keeper-note'] } },
      { id: 'boats', text: 'Read the symbols painted on the three moored boats', hint: 'Three boats are tied up along the long dock. Each has a symbol on its sail.', on: { type: 'use', target: 'boat-sign-*' }, need: 3, unique: true, effects: { journal: ['boat-symbols'] } },
      { id: 'lens', text: 'Set the lighthouse lens', hint: 'The keeper’s note says to read the boats from north to south: inner ring, middle ring, outer ring.', on: { type: 'flag', target: 'lighthouse-lit' } },
      { id: 'report', text: 'Tell Captain Marlow the light is back', hint: 'Marlow waits by his harbor-master’s office near the arrival dock.', on: { type: 'talk', target: 'marlow' } },
    ],
    rewards: {
      flags: ['harbor-restored'], achievement: 'harbor-hero', journal: ['harbor-open'], items: { 'sea-glass': 1 },
      memory: { title: 'Pawport is open again', detail: 'The lighthouse shines, the stalls are open and the boats are back.' },
    },
  },
  // ------------------------------------------------------------------ main 3: the signature adventure
  {
    id: 'lost-star', title: 'The Lost Star', layer: 'main', region: 'forest',
    summary: 'A light fell from the sky into the south woods. Mabel says the same thing happened years ago — and nobody ever found out why.',
    prereq: (v) => v.done('lighthouse-mystery'),
    startOn: { type: 'talk', target: 'mabel' },
    startEffects: { journal: ['falling-light'] },
    objectives: [
      { id: 'prints', text: 'Look for where the light fell, by the south woods', hint: 'The old bramble gate at the very south end of the main road, past the park.', on: { type: 'flag', target: 'region:forest' }, effects: { journal: ['glowing-prints'] } },
      { id: 'enter', text: 'Follow the glowing pawprints into Whisperwood', hint: 'The bramble gate has opened. Walk through it.', on: { type: 'enter', target: 'forest' } },
      { id: 'camp', text: 'Search the abandoned campsite', hint: 'The pawprints lead to a clearing with a cold campfire and a tent.', on: { type: 'use', target: 'camp-letter' }, effects: { give: { 'star-compass': 1 }, journal: ['camp-letter'] } },
      { id: 'waterfall', text: 'Find the hidden way behind the waterfall', hint: 'The star compass points east, to the waterfall. Something hangs over the rocks beside it.', on: { type: 'flag', target: 'cave-open' } },
      { id: 'plates', text: 'Open the crystal door: two stones must be pressed at the same time', hint: 'Stand on one plate while your partner stands on the other — or carry the moonstone from the cave mouth and set it on one plate yourself.', on: { type: 'flag', target: 'crystal-door-open' } },
      { id: 'meet', text: 'Meet whatever is waiting inside', hint: 'Go through the open crystal door.', on: { type: 'talk', target: 'lumi' }, effects: { journal: ['lumi-pattern'] } },
      { id: 'signal', text: 'Shine Lumi’s constellation from the lighthouse', hint: 'Climb to the lighthouse lamp in Pawport and light the five stars of Lumi’s pattern (it’s in your journal).', on: { type: 'flag', target: 'observatory-open' } },
      { id: 'observatory', text: 'Look through the telescope in the headland observatory', hint: 'The observatory door north of the lighthouse is open now.', on: { type: 'flag', target: 'region:isles' } },
    ],
    rewards: {
      flags: ['constellation-lumi'], achievement: 'star-friend', journal: ['star-bridge'], items: { 'star-shard': 1 },
      memory: { title: 'The Lost Star found its way home', detail: 'Lumi’s constellation now shines over Pawville every clear night.' },
    },
  },
  // ------------------------------------------------------------------ side: the missing kitten
  {
    id: 'missing-kitten', title: 'The Missing Kitten', layer: 'side', region: 'forest',
    summary: 'Mabel’s grand-kitten Pip wandered off toward the woods.',
    prereq: (v) => v.has('region:forest'),
    startOn: { type: 'talk', target: 'mabel' },
    objectives: [
      { id: 'find', text: 'Look for Pip in Whisperwood Forest', hint: 'Kittens love hollow logs. Try the mossy clearing west of the stream.', on: { type: 'talk', target: 'pip' }, effects: { flags: ['pip-found'] } },
      { id: 'home', text: 'Walk Pip home to Mabel', hint: 'Mabel is by the PAWVILLE signpost south of the fountain.', on: { type: 'talk', target: 'mabel' }, effects: { flags: ['pip-home'] } },
    ],
    completesOnFlag: 'pip-home',
    rewards: { achievement: 'kitten-finder', items: { bouquet: 1 }, memory: { title: 'Pip is home', detail: 'Mabel made everyone warm milk.' } },
  },
  // ------------------------------------------------------------------ regional: the mountain trail
  {
    id: 'vanishing-trail', title: 'The Vanishing Trail', layer: 'regional', region: 'forest',
    summary: 'Juniper, an explorer, is camped at the forest’s edge. The old trail up the mountain vanished under snow years ago.',
    prereq: (v) => v.has('region:forest') && v.done('lighthouse-mystery'),
    startOn: { type: 'talk', target: 'juniper' },
    objectives: [
      { id: 'map', text: 'Find a map of the old mountain trail', hint: 'Juniper heard a bottle with an old map washed up on Pawport’s southern beach.', on: { type: 'collect', target: 'trail-map' }, effects: { journal: ['trail-map'] } },
      { id: 'bring', text: 'Bring the trail map to Juniper', hint: 'She is at her camp by the south-east trailhead of Whisperwood.', on: { type: 'talk', target: 'juniper' }, effects: { take: { 'trail-map': 1 }, flags: ['region:highlands'] } },
      { id: 'climb', text: 'Climb to Frostbell Highlands', hint: 'The snowdrift is cleared. Follow the trail past Juniper’s camp.', on: { type: 'enter', target: 'highlands' } },
    ],
    completesOnFlag: 'region:highlands',
    rewards: { achievement: 'trailblazer', items: { 'pine-cone': 2 }, memory: { title: 'Above the clouds', detail: 'The first pawprints on the Frostbell trail in years.' } },
  },
  // ------------------------------------------------------------------ regional: the cable car
  {
    id: 'cable-car', title: 'The Forgotten Cable Car', layer: 'regional', region: 'highlands',
    summary: 'An old cable car once linked Frostbell to the village. Its gears were lost in the ice cave.',
    prereq: (v) => v.has('region:highlands'),
    startOn: { type: 'talk', target: 'juniper' },
    objectives: [
      { id: 'gears', text: 'Find two brass gears in the ice cave', hint: 'The ice cave is north of the frozen lake. Look for glints in the ice.', on: { type: 'collect', target: 'gear' }, need: 2, unique: true },
      { id: 'fit', text: 'Fit the gears in the cable-car station', hint: 'The station is the wooden hut at the top of the sled hill, east side.', on: { type: 'flag', target: 'cable-car-fixed' }, effects: { take: { gear: 2 } } },
    ],
    completesOnFlag: 'cable-car-fixed',
    rewards: { achievement: 'cable-car', items: { 'frost-crystal': 1 }, memory: { title: 'The cable car runs again', detail: 'Frostbell and the village are one ride apart.' } },
  },
  // ------------------------------------------------------------------ main 4: the isles (co-op)
  {
    id: 'constellation-for-two', title: 'A Constellation for Two', layer: 'main', region: 'isles', coop: true,
    summary: 'In the Dreaming Isles, two star pedestals stand on two islands. The keeper’s plaque says they only wake together.',
    prereq: (v) => v.has('region:isles'),
    startOn: { type: 'enter', target: 'isles' },
    objectives: [
      { id: 'plaque', text: 'Read the plaque at the star observatory', hint: 'The domed observatory stands on the central island.', on: { type: 'use', target: 'isles-plaque' }, effects: { journal: ['pedestal-plaque'] } },
      { id: 'pedestals', text: 'Wake both star pedestals at the same time', hint: 'Two players: one on each pedestal. Solo: the starstone on the far eastern islet can rest on one pedestal while you stand on the other.', on: { type: 'flag', target: 'pedestals-awake' } },
      { id: 'name', text: 'Look up at your new constellation', hint: 'Return to the observatory telescope.', on: { type: 'use', target: 'isles-scope' }, effects: { flags: ['our-constellation'] } },
    ],
    rewards: { achievement: 'dreamer', items: { 'moon-pearl': 1 }, journal: ['two-paw-temple'], memory: { title: 'A constellation of our own', detail: 'Two stars, side by side, over the Dreaming Isles.' } },
  },
  // ------------------------------------------------------------------ discoveries
  {
    id: 'shell-collector', title: 'Shells of Pawport', layer: 'discovery', region: 'harbor',
    summary: 'Pawport’s beaches hide shells you can’t find anywhere else.',
    prereq: (v) => v.has('region:harbor'),
    startOn: { type: 'collect', target: 'harbor-shell' },
    objectives: [{ id: 'five', text: 'Collect 4 more harbor shells (5 in all)', hint: 'Shells sparkle on the southern beach, the hidden cove and the sandbar.', on: { type: 'collect', target: 'harbor-shell' }, need: 4, unique: true }],
    rewards: { achievement: 'beachcomber', items: { 'sea-glass': 2 }, memory: { title: 'A pocketful of shells', detail: 'Five shells from Pawport’s beaches.' } },
  },
  {
    id: 'beach-cleanup', title: 'A Clean Beach', layer: 'discovery', region: 'harbor',
    summary: 'The storm left the southern beach full of rubbish.',
    prereq: (v) => v.has('region:harbor'),
    startOn: { type: 'use', target: 'litter-*' },
    objectives: [{ id: 'clean', text: 'Clear the rest of the rubbish (4 more)', hint: 'Look for nets, cans and planks on the southern beach.', on: { type: 'use', target: 'litter-*' }, need: 4, unique: true, effects: { flags: ['beach-clean'] } }],
    completesOnFlag: 'beach-clean',
    rewards: { items: { 'sea-glass': 1 }, memory: { title: 'The beach is clean', detail: 'The crabs came back the very next tide.' } },
  },
  {
    id: 'ancient-symbols', title: 'The Two-Paw Symbols', layer: 'discovery', region: 'town', hidden: true,
    summary: 'The same carved symbol — two pawprints inside a circle — appears in more than one place.',
    startOn: { type: 'use', target: 'symbol-*' },
    objectives: [{ id: 'all', text: 'Find the two-paw symbol in 3 more places (4 in all)', hint: 'An ancient tree in Whisperwood, a rock at Pawport, the ice cave in Frostbell and a pillar in the Dreaming Isles.', on: { type: 'use', target: 'symbol-*' }, need: 3, unique: true }],
    rewards: { journal: ['two-paw-temple'], flags: ['temple-hint'], memory: { title: 'Four symbols, one mystery', detail: 'Somewhere there is a temple that needs two paws to open.' } },
  },
  {
    id: 'stray-friend', title: 'Bramble the Stray', layer: 'side', region: 'forest',
    summary: 'A shy grey stray watches you from the ferns in Whisperwood.',
    prereq: (v) => v.has('region:forest'),
    startOn: { type: 'talk', target: 'bramble' },
    objectives: [
      { id: 'fish', text: 'Bring Bramble a fish', hint: 'Any fish will do — try the town pier or Pawport’s docks.', on: { type: 'talk', target: 'bramble' }, requires: (v) => FISH_IDS.some((f) => v.inv(f) > 0) },
    ],
    rewards: { flags: ['bramble-home'], memory: { title: 'A new friend', detail: 'Bramble now naps by the fountain in the plaza.' } },
  },
  // ------------------------------------------------------------------ Milestone 7: Whiskerwick
  {
    id: 'biscuits-song', title: 'Biscuit’s Unfinished Song', layer: 'side', region: 'city',
    summary: 'Biscuit, the busker by the fountain, wrote a song years ago and lost its ending. He thinks the old arcade melody machine still plays it.',
    prereq: (v) => v.has('region:city'),
    startOn: { type: 'talk', target: 'biscuit' },
    objectives: [
      { id: 'ozzie', text: 'Ask Ozzie at the arcade about the old melody', hint: 'The Whiskerwick Arcade is on Arcade Row, east of the plaza. Ozzie polishes the cabinets inside.', on: { type: 'talk', target: 'ozzie' }, effects: { journal: ['ozzie-melody'] } },
      { id: 'learn', text: 'Learn the tune on the Meow Melody cabinet (clear round 5)', hint: 'Watch the paw pads light up, then repeat the pattern. You get one second chance per game.', on: { type: 'puzzle', target: 'melody-5' } },
      { id: 'play', text: 'Bring the tune back to Biscuit', hint: 'He busks by the fountain by day and plays on the café terrace when it rains or after dark.', on: { type: 'talk', target: 'biscuit' }, effects: { flags: ['biscuit-song'] } },
    ],
    rewards: { achievement: 'encore', tokens: 10, items: { bouquet: 1 }, memory: { title: 'Encore in the plaza', detail: 'Biscuit played his finished song and the whole plaza swayed.' } },
  },
  // ------------------------------------------------------------------ Milestone 8: Whiskerwick districts
  {
    id: 'clock-hour', title: 'The Clock That Stopped at Eleven', layer: 'regional', region: 'old-town',
    summary: 'Old Town’s clock tower has been stuck at eleven for as long as anyone remembers. Mr. Velvet, the antique dealer, thinks it can be fixed.',
    prereq: (v) => v.has('region:city'),
    startOn: { type: 'talk', target: 'velvet' },
    objectives: [
      { id: 'library', text: 'Find the clockmaker’s ledger in the Old Library', hint: 'The library is the columned building on Library Row, north of Clock Square. The ledger lies open on a reading table.', on: { type: 'use', target: 'library-ledger' }, effects: { journal: ['clock-ledger'] } },
      { id: 'ask', text: 'Ask Sky about the lamplighter’s rooftops', hint: 'Sky sketches at the rooftop café by day and stargazes by the telescope at night. Take the iron stairs at the east end of Library Row.', on: { type: 'talk', target: 'sky' } },
      { id: 'key', text: 'Find the brass key on the rooftops', hint: 'Sky said something glints in the gutter of the secret roof — east, across the plank bridge from the café.', on: { type: 'collect', target: 'clock-key' } },
      { id: 'wind', text: 'Wind the clock tower', hint: 'There’s a keyhole at the base of the clock tower in Clock Square.', on: { type: 'flag', target: 'clock-fixed' }, effects: { take: { 'clock-key': 1 } } },
    ],
    rewards: { achievement: 'old-town-sleuth', tokens: 12, memory: { title: 'Old Town ticks again', detail: 'The great clock struck twelve for the first time in a hundred years.' } },
  },
  {
    id: 'lost-scarf', title: 'The Lost Blue Scarf', layer: 'side', region: 'city-park',
    summary: 'Nana Tulip lost her favourite blue scarf — the one the plaza noticeboard has been asking about.',
    prereq: (v) => v.has('region:city'),
    startOn: { type: 'talk', target: 'tulip' },
    objectives: [
      { id: 'find', text: 'Look for the blue scarf in Grand City Park', hint: 'She walked home past the gazebo, west of the picnic lawn, on a windy day.', on: { type: 'collect', target: 'blue-scarf' } },
      { id: 'return', text: 'Bring the scarf back to Nana Tulip', hint: 'She gardens in the Residential District courtyard (east side of the park), or knits on her doorstep when it rains.', on: { type: 'talk', target: 'tulip' }, effects: { take: { 'blue-scarf': 1 } } },
    ],
    rewards: { tokens: 6, items: { herbs: 2 }, memory: { title: 'A warm thank-you', detail: 'Nana Tulip knitted you a tiny scarf in return. It smells like peppermint.' } },
  },
  {
    id: 'stamp-hunt', title: 'Five Old Stamps', layer: 'discovery', region: 'city', hidden: true,
    summary: 'Old Whiskerwick postage stamps are tucked away all over the city. Wren at the bookshop collects them.',
    startOn: { type: 'collect', target: 'old-stamp' },
    objectives: [{ id: 'all', text: 'Find the other 4 old stamps', hint: 'The hedge maze’s heart, a courtyard flowerpot, the hidden Old Town courtyard, a loose roof tile, and a library book.', on: { type: 'collect', target: 'old-stamp' }, need: 4, unique: true }],
    rewards: { achievement: 'stamp-collector', tokens: 8, memory: { title: 'A full set of stamps', detail: 'Five stamps, five little pictures of Whiskerwick.' } },
  },
];

export const FISH_IDS = ['fish-sardine', 'fish-minnow', 'fish-goldfish', 'fish-koi', 'fish-moonfish', 'fish-raincarp', 'fish-snowtrout', 'fish-herring', 'fish-lanternfish'] as const;

export function questById(id: string): QuestDef | undefined {
  return QUESTS.find((q) => q.id === id);
}

// ---- journal --------------------------------------------------------------------------------
export type JournalKind = 'rumor' | 'letter' | 'clue' | 'symbol' | 'landmark' | 'creature' | 'milestone' | 'mystery' | 'sky';
export interface JournalEntry { id: string; kind: JournalKind; title: string; text: string; region: RegionId }

export const JOURNAL: readonly JournalEntry[] = [
  { id: 'marlow-story', kind: 'rumor', region: 'town', title: 'Captain Marlow', text: 'Marlow ran Pawport Harbor across the bay until the big storm. The storm tore his navigation chart and smashed the end of our pier, so his boat can’t cross.' },
  { id: 'gull-rhyme', kind: 'clue', region: 'town', title: 'The gull’s rhyme', text: '“One where apples fall, one in the reeds, one where stars are watched.” The pieces are mended.' },
  { id: 'marlow-plan', kind: 'clue', region: 'town', title: 'Marlow’s plan', text: 'Three pieces of driftwood and the toolbox from the harbor shed — then the pier can be fixed.' },
  { id: 'pier-mended', kind: 'milestone', region: 'town', title: 'The pier is mended', text: 'Marlow’s boat now waits at the end of the pier, ready to sail to Pawport Harbor.' },
  { id: 'keeper-note', kind: 'letter', region: 'harbor', title: 'The keeper’s note', text: '“Sun over the sea, moon on the wave, star in the sky. To wake the lens, read the boats from north to south.”' },
  { id: 'boat-symbols', kind: 'clue', region: 'harbor', title: 'Symbols on the sails', text: 'You copied the three sail symbols. The lens has three rings — inner, middle, outer.' },
  { id: 'harbor-open', kind: 'milestone', region: 'harbor', title: 'Pawport restored', text: 'The lighthouse shines again. Finn’s fish stall and Coral’s souvenir shop are open, and there are fishing spots on the docks.' },
  { id: 'falling-light', kind: 'rumor', region: 'town', title: 'A falling light', text: 'Mabel saw a light fall into the south woods — “just like the night, years ago, when the stars went quiet.”' },
  { id: 'glowing-prints', kind: 'clue', region: 'town', title: 'Glowing pawprints', text: 'Tiny pawprints that glow faintly, leading under the old bramble gate. They’re too small and too round for a cat.' },
  { id: 'camp-letter', kind: 'letter', region: 'forest', title: 'Letter at the campsite', text: '“Whoever finds this: the little star ran behind the falling water. Two stones remember two paws. Be gentle with it. — A.” A brass star compass lay beside it.' },
  { id: 'lumi-pattern', kind: 'creature', region: 'forest', title: 'Lumi', text: 'A small star-creature, lost since it fell. Its pattern: five stars — a top star, two wings, and two feet (see the constellation page).' },
  { id: 'star-bridge', kind: 'milestone', region: 'harbor', title: 'The star bridge', text: 'From the observatory, a bridge of light now reaches the Dreaming Isles.' },
  { id: 'trail-map', kind: 'letter', region: 'harbor', title: 'Map in a bottle', text: 'An old map of the Frostbell trail, sealed in a bottle. Juniper will want this.' },
  { id: 'pedestal-plaque', kind: 'clue', region: 'isles', title: 'The observatory plaque', text: '“Two stars wake together. If you walk alone, the starstone will keep one place for you.”' },
  { id: 'two-paw-temple', kind: 'mystery', region: 'isles', title: 'The Two-Paw Temple', text: 'Every symbol points to a temple sealed by two pawprints. Nobody knows where it is yet… (an unfinished mystery)' },
  { id: 'symbol-forest', kind: 'symbol', region: 'forest', title: 'Symbol: the old oak', text: 'Two pawprints in a circle, carved deep into the ancient oak.' },
  { id: 'symbol-harbor', kind: 'symbol', region: 'harbor', title: 'Symbol: the tide rock', text: 'The same two pawprints, worn smooth by the sea.' },
  { id: 'symbol-highlands', kind: 'symbol', region: 'highlands', title: 'Symbol: the ice wall', text: 'Frozen into the cave wall — the two pawprints again.' },
  { id: 'symbol-isles', kind: 'symbol', region: 'isles', title: 'Symbol: the star pillar', text: 'Glowing faintly on a pillar that floats above nothing.' },
  { id: 'bottle-letter-1', kind: 'letter', region: 'harbor', title: 'Bottle on the beach', text: '“To whoever finds this: the gulls here steal sandwiches. Guard yours. — a tourist”' },
  { id: 'bottle-letter-2', kind: 'letter', region: 'harbor', title: 'Bottle on the sandbar', text: '“The lighthouse keeper left to follow a star. If the light goes out, the boats will remember the way.”' },
  { id: 'city-telescope', kind: 'landmark', region: 'city', title: 'The boardwalk telescope', text: 'From Whiskerwick’s boardwalk you can see Pawport’s lighthouse across the water — and, on clear nights, the stars over the Dreaming Isles.' },
  { id: 'ozzie-melody', kind: 'clue', region: 'city', title: 'The arcade melody', text: 'Ozzie says the Meow Melody cabinet was built from Biscuit’s old songbook. Reach round 5 and the tune plays itself to the end.' },
  { id: 'marlow-city', kind: 'rumor', region: 'city', title: 'Clementine and the captain', text: 'Clementine once worked the Pawport ferry with Captain Marlow. “He taught me to read the stars before he taught me to read a timetable.”' },
  { id: 'creature-ducks', kind: 'creature', region: 'city-park', title: 'The pond ducks', text: 'Three ducks who paddle in neat loops and quack at nobody in particular.' },
  { id: 'conservatory', kind: 'landmark', region: 'city-park', title: 'The glass conservatory', text: 'Moonflowers from the Dreaming Isles grow here. Professor Bloom brought the seeds back “from a long way up”.' },
  { id: 'hidden-courtyard', kind: 'symbol', region: 'old-town', title: 'Symbol: the hidden courtyard', text: 'A bench carved with two pawprints in a circle, hidden behind Lantern Alley.' },
  { id: 'clock-ledger', kind: 'letter', region: 'old-town', title: 'The clockmaker’s ledger', text: '“The clock tower key was kept by the lamplighter, who loved the high places. When she retired, the key went up with her chimneys.”' },
  { id: 'roof-scope', kind: 'landmark', region: 'rooftops', title: 'The rooftop telescope', text: 'The highest view in Whiskerwick: chimneys, the clock tower and, on clear nights, Lumi’s stars.' },
  { id: 'landmark-lighthouse', kind: 'landmark', region: 'harbor', title: 'Pawport Lighthouse', text: 'Built on the north-east rocks. Its lens has three brass rings.' },
  { id: 'landmark-waterfall', kind: 'landmark', region: 'forest', title: 'Whisperwood Falls', text: 'Loud, white and beautiful. Vines hang beside it.' },
  { id: 'landmark-aurora', kind: 'landmark', region: 'highlands', title: 'Aurora Point', text: 'On clear nights the sky over Frostbell ripples green and violet.' },
  { id: 'creature-moonmoth', kind: 'creature', region: 'isles', title: 'Moon moths', text: 'Silver moths that only live where starlight touches water.' },
  { id: 'creature-fox', kind: 'creature', region: 'forest', title: 'The stream fox', text: 'A shy red fox drinking by the stream. It vanished into the ferns.' },
  // Milestone 8.1: telescope discoveries (generated from the sky catalog so they can never drift apart)
  ...SKY.map((o): JournalEntry => ({ id: skyJournalId(o.id), kind: 'sky', region: 'town', title: o.title,
    text: o.text({ site: 'city', darkness: 1, clear: true, moonPhase: 0.5, flags: new Set(), time: 0 }) })),
];

export function journalEntry(id: string): JournalEntry | undefined {
  return JOURNAL.find((j) => j.id === id);
}

// ---- regions (world-map metadata) -------------------------------------------------------------
export interface RegionInfo {
  id: RegionId;
  name: string;
  blurb: string;
  /** Plain-language unlock requirement (shown on the world map while locked). */
  unlock: string;
  /** Position on the stylised world map (0..100). */
  map: { x: number; y: number };
  /** Interiors (like the waterfall cave) belong to a parent region on the world map. */
  parent?: RegionId;
}

export const REGIONS: readonly RegionInfo[] = [
  { id: 'town', name: 'Whiskerwood Village', blurb: 'Pawville’s cozy home streets: the plaza, the arcade, the park and your home.', unlock: 'Always open.', map: { x: 38, y: 42 } },
  { id: 'harbor', name: 'Pawport Harbor', blurb: 'Docks, boats, a lighthouse, beaches and coves across the bay.', unlock: 'Help Captain Marlow mend the pier (ask Mabel by the signpost).', map: { x: 78, y: 30 } },
  { id: 'forest', name: 'Whisperwood Forest', blurb: 'Winding paths, a stream, glowing mushrooms and a waterfall with a secret.', unlock: 'Follow the falling light past the old bramble gate south of the park.', map: { x: 36, y: 78 } },
  { id: 'cave', name: 'Waterfall Cave', blurb: 'A crystal cave hidden behind Whisperwood Falls.', unlock: 'Find the way behind the waterfall.', map: { x: 44, y: 74 }, parent: 'forest' },
  { id: 'highlands', name: 'Frostbell Highlands', blurb: 'Snowy pines, a frozen lake, an ice cave, a sled hill and the aurora.', unlock: 'Find the old trail map for Juniper, the explorer in Whisperwood.', map: { x: 70, y: 82 } },
  { id: 'city', name: 'Whiskerwick City', blurb: 'The big city by train: plaza, shops, cafés, the arcade, a boardwalk and the Whiskerwick Funfair.', unlock: 'Always open — take the train from Pawville Station.', map: { x: 14, y: 30 } },
  { id: 'city-park', name: 'Grand City Park', blurb: 'Pond and bridge, gazebo, picnic lawns, a conservatory, a hedge maze — and the Residential District beside it.', unlock: 'North of Central Plaza.', map: { x: 14, y: 20 }, parent: 'city' },
  { id: 'old-town', name: 'Old Town', blurb: 'Cobbles, lantern alleys, the clock tower, the library and antique shops.', unlock: 'Through the archway north of the station.', map: { x: 8, y: 26 }, parent: 'city' },
  { id: 'rooftops', name: 'The Rooftops', blurb: 'Gardens, a café and the best stargazing in the city.', unlock: 'Iron stairs at the east end of Library Row, Old Town.', map: { x: 8, y: 22 }, parent: 'city' },
  { id: 'hearth', name: 'Hearth & Whisker', blurb: 'Furniture showroom.', unlock: 'Shopping Street.', map: { x: 14, y: 28 }, parent: 'city' },
  { id: 'library', name: 'The Old Library', blurb: 'Books, a star atlas and an old ledger.', unlock: 'Library Row, Old Town.', map: { x: 8, y: 25 }, parent: 'city' },
  { id: 'purring-cup', name: 'The Purring Cup', blurb: 'Café interior.', unlock: 'Café Quarter.', map: { x: 14, y: 32 }, parent: 'city' },
  { id: 'arcade-hall', name: 'Whiskerwick Arcade', blurb: 'Cabinets, a claw machine and Ozzie.', unlock: 'On Arcade Row in Whiskerwick.', map: { x: 18, y: 26 }, parent: 'city' },
  { id: 'funfair', name: 'Whiskerwick Funfair', blurb: 'A fenced little theme park: Ferris wheel, carousel, swing ride, bumper cars and ring toss.', unlock: 'Through the funfair arch on the boardwalk.', map: { x: 18, y: 36 }, parent: 'city' },
  { id: 'temple', name: 'The Temple of Many Voices', blurb: 'The hilltop temple at the end of the old trail, and the Hearthsong at its heart.', unlock: 'Open the old trail gate in Old Town’s hidden courtyard (see the Story So Far).', map: { x: 5, y: 17 }, parent: 'old-town' },
  { id: 'isles', name: 'The Dreaming Isles', blurb: 'Floating islands, star bridges and celestial gardens above the clouds.', unlock: 'Finish “The Lost Star”.', map: { x: 62, y: 8 } },
];

export function regionInfo(id: RegionId): RegionInfo {
  return REGIONS.find((r) => r.id === id) ?? REGIONS[0];
}
