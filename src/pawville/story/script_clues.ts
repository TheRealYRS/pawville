/**
 * The three optional clue places of Act I (each is a small environmental interaction, not just a talk), the
 * residents who offer the SAME information another way (so no missing clue can ever block the story), and the
 * residents' memories that belong to the five places of Act II.
 */
import { ask, lumi, narr, opt, say, type Scene, type Page } from './kit.ts';

const cluesOpen = (v: { story: { done(s: string): boolean } }) => v.story.done('a1-biscuit') && !v.story.done('a1-gate');

export const CLUES: Scene[] = [
  // ---- three places ------------------------------------------------------------------------------------------
  {
    id: 'a1c-harbor', act: 1, title: 'A tune in the fog', region: 'harbor',
    spot: { id: 'story-fogbell', label: 'Look at the old fog bell', x: 136, y: 262, glyph: 'fogbell' },
    avail: (v) => cluesOpen(v) && !v.story.clue('clue:harbor'),
    goal: 'Clue: the harbour — an old sailor once heard the phrase in fog.', hint: 'Pawport Harbor: the weathered fog bell stands near Captain Marlow, by the arrival dock.',
    page: () => ({
      say: [
        narr('On a post by the harbour master’s office hangs an old fog bell, its cord frayed to threads. Captain Marlow is mending a rope beside it and pretending not to notice you.'),
        say('marlow', 'That bell? Rang for every foggy night when I was a lad. And once — once — I heard a tune come across the water that no bell makes. Five notes. The sea made the lights look close, and the tune sounded close too.'),
        say('marlow', 'I never told anyone. Who’d believe a sailor who says the fog sang?'),
      ],
      ask: ask('a1c-harbor.how', [
        opt('wait', 'patience', 'Ring the bell once, and wait for the harbour to answer.', [
          narr('The note rolls out over the water — and comes back from two directions, a heartbeat apart.'),
          say('marlow', 'Aye. That’s how it was. The sound arrives before you expect it.'),
        ], { clue: ['clue:harbor', 'clue:fog-echo'], cameo: ['marlow'], journal: ['clue-harbor'] }, clueEnd('harbor')),
        opt('hum', 'curiosity', 'Ask Captain Marlow to hum the tune he heard, and compare it with Biscuit’s.', [
          narr('Marlow hums it, flat and gruff. It is Biscuit’s first phrase, made rough by thirty years of sea.'),
          say('marlow', 'It went up — up — and then it seemed to lean on something and stopped.'),
        ], { clue: ['clue:harbor', 'clue:phrase-leans'], cameo: ['marlow'], journal: ['clue-harbor'] }, clueEnd('harbor')),
        opt('sit', 'kindness', 'Sit beside him on the crate and let him tell it all the way through.', [
          narr('He does. It takes a while, and wanders off into a story about a very stubborn gull. You stay.'),
          say('marlow', 'Nobody’s listened to a fog story in years. …Thank you, matey.'),
        ], { clue: ['clue:harbor', 'clue:marlow-trusts'], cameo: ['marlow'], bond: { lumi: 1 }, journal: ['clue-harbor'] }, clueEnd('harbor')),
        opt('play', 'playfulness', 'Tap the bell in the rhythm of the chime — and see who joins in.', [
          narr('Tink… tink-tink… The bell’s answer comes late, from the rocks, a little too cheerful. Marlow laughs so hard he drops his rope.'),
          say('marlow', 'That’s it! That’s the bounce of it — I always thought the tune was a bit cheeky.'),
        ], { clue: ['clue:harbor', 'clue:cheeky-tune'], cameo: ['marlow'], journal: ['clue-harbor'] }, clueEnd('harbor')),
      ]),
    }),
    after: () => ({ say: [say('marlow', 'Fog bell’s not gone anywhere, matey. Come and tap it any time.')] }),
  },
  {
    id: 'a1c-garden', act: 1, title: 'A stone with five parts', region: 'city-park',
    spot: { id: 'story-gardenstone', label: 'Look at the old garden boundary stone', x: 640, y: 420, glyph: 'stone' },
    avail: (v) => cluesOpen(v) && !v.story.clue('clue:garden'),
    goal: 'Clue: the old garden boundary — a stone with a five-part symbol.', hint: 'Grand City Park: where the community garden meets the old boundary wall, near Nana Tulip.',
    page: () => ({
      say: [
        narr('Where the community garden meets its old boundary wall, a mossy stone is carved with a symbol in five parts — a little like a paw with five unequal toes. A stubborn blue flower grows right at its base.'),
        narr('Nobody planted it there. It simply turned up, and the gardeners have been too polite to pull it out.'),
      ],
      ask: ask('a1c-garden.how', [
        opt('moss', 'patience', 'Clear the moss from the carving, one tiny strand at a time.', [
          narr('It takes most of the afternoon. Underneath, each of the five parts has a tiny note carved into it — the same notes Biscuit played.'),
        ], { clue: ['clue:garden', 'clue:stone-notes'], journal: ['clue-garden'] }, clueEnd('garden')),
        opt('flower', 'curiosity', 'Compare the flower’s five petals with the five carved parts.', [
          narr('Five petals, five parts. The flower leans towards one part in particular — the one that looks like a small wave.'),
        ], { clue: ['clue:garden', 'clue:flower-leans'], journal: ['clue-garden'] }, clueEnd('garden')),
        opt('water', 'kindness', 'Water the flower. It’s been doing a lot of leaning.', [
          narr('As the water runs over the stone, the carving fills like a small river, and the five parts glint, one after another.'),
        ], { clue: ['clue:garden', 'clue:stone-water'], journal: ['clue-garden'] }, clueEnd('garden')),
        opt('press', 'playfulness', 'Press the five parts one after another — like keys.', [
          narr('The stone hums. Five faint notes, one for each press, ring out from somewhere under the soil. You press them again in a different order. They ring back in the new order. The stone is clearly delighted.'),
        ], { clue: ['clue:garden', 'clue:stone-keys'], journal: ['clue-garden'] }, clueEnd('garden')),
      ]),
    }),
    after: () => ({ say: [narr('The blue flower leans towards the stone. Somebody has put a tiny watering can beside it.')] }),
  },
  {
    id: 'a1c-archive', act: 1, title: 'A note in the archive', region: 'library',
    spot: { id: 'story-archive', label: 'Look through the archive drawer', x: 240, y: 150, glyph: 'archive' },
    avail: (v) => cluesOpen(v) && !v.story.clue('clue:archive'),
    goal: 'Clue: the library — an old note about keepers who marked a route.', hint: 'The Old Library, Library Row in Old Town: the narrow archive drawer by the history shelves.',
    page: () => ({
      say: [
        narr('Behind the history shelves, a narrow drawer is labelled in faded ink: ARCHIVE — MISCELLANY — DO NOT SORT. Dewey has clearly been sorting it for years, and has clearly failed.'),
        say('dewey', '“Shh” is a greeting here. It means “welcome”. Mind the corners — some of those notes are older than the shelves.'),
      ],
      ask: ask('a1c-archive.how', [
        opt('quiet', 'patience', 'Look through the drawer one note at a time, without rushing.', [
          narr('Halfway down, a brittle slip: “The Hearthsong gathered what places remember. The keepers marked a route between the town and the hilltop temple, so that those who followed would know the way.”'),
        ], { clue: ['clue:archive', 'clue:keepers-route'], cameo: ['dewey'], journal: ['clue-archive'] }, clueEnd('archive')),
        opt('ask', 'kindness', 'Ask Dewey if you can help him finally sort the drawer.', [
          say('dewey', 'You… want to sort the miscellany. Nobody has ever wanted that. Take the first handful. The note you’re after is probably in it, because it has been in every handful.'),
        ], { clue: ['clue:archive', 'clue:keepers-route'], cameo: ['dewey'], bond: { lumi: 1 }, journal: ['clue-archive'] }, clueEnd('archive')),
        opt('sniff', 'curiosity', 'Follow the oldest-smelling paper.', [
          narr('It leads you to a note pressed in a book about bells. A pencilled map: a path with five small marks, and a hill with a roof at the top.'),
        ], { clue: ['clue:archive', 'clue:keepers-map'], cameo: ['dewey'], journal: ['clue-archive'] }, clueEnd('archive')),
      ]),
    }),
    after: () => ({ say: [say('dewey', 'You’ve put the miscellany in a mood, I think. It’s never been so cooperative.')] }),
  },

  // ---- Lumi's notebook: the safety net if nothing has been found -------------------------------------------------
  {
    id: 'a1-lumi-help', act: 1, title: 'Lumi’s notebook', region: 'town', npc: 'lumi',
    lumi: { x: 424, y: 470 },
    avail: (v) => v.story.done('a1-biscuit') && !v.story.done('a1-clues') && v.story.cluesFound() === 0,
    goal: 'Look into the harbour fog bell, the old garden stone or the library archive — or ask Lumi.', hint: 'Any one of the three clue places is enough. If you are stuck, talk to Lumi at the chime.',
    page: () => ({
      say: [
        lumi('I haven’t done very much while you were away. I… hummed at the chime. For hours. I may have disturbed a pigeon.'),
        lumi('But I did find this, folded in the back of the notebook: a drawing I made of a note in the library archive. I forgot I’d drawn it. “The keepers marked a route between the town and a temple on the hill.” It’s in my handwriting.'),
        lumi('So. Hearthsong, keepers, a route. I think that counts as a clue. Isn’t it strange to find your own clue in your own notebook?'),
      ],
    }),
    done: { clue: ['clue:archive', 'clue:lumi-notebook'], journal: ['clue-archive'], bond: { lumi: 1 } },
  },
];

function clueEnd(place: 'harbor' | 'garden' | 'archive'): Page {
  const lines: Record<typeof place, string> = {
    harbor: 'The word you keep hearing is the same: Hearthsong. Somebody ought to write it down. You do.',
    garden: 'You copy the symbol into Lumi’s notebook, five parts, five tiny notes. The flower nods like it’s signing for the delivery.',
    archive: 'You copy the note into Lumi’s notebook, word for word. Dewey looks quite moved by your handwriting, which is a first.',
  };
  return { say: [narr(lines[place]), narr('That’s one more place for the notebook. Lumi will be pleased.')] };
}

// =================================================================================================================
// Residents who offer the same information another way (alternate routes to the same clues), and local memories.
// Each is short, in character, and optional. They show up in the journal and in the finale and epilogue.
// =================================================================================================================
const act1clue = (v: { story: { done(s: string): boolean; clue(s: string): boolean } }, id: string) => v.story.done('a1-biscuit') && !v.story.done('a1-gate') && !v.story.clue(id);
const act2 = (v: { story: { done(s: string): boolean } }) => v.story.done('a1-end') && !v.story.done('a3-letgo');

export const CAMEOS: Scene[] = [
  { id: 'cm-kelp', act: 1, title: 'Kelp’s fog tune', region: 'harbor', npc: 'kelp',
    avail: (v) => act1clue(v, 'clue:harbor'), goal: 'Kelp mends nets by the harbour; they might know about tunes in fog.', hint: 'Net-mender Kelp, on the harbour street.',
    page: () => ({ say: [say('kelp', 'A tune in the fog? Aye. Five notes, rising, then it stops like someone trod on the last stair. My granddad hummed it while he mended.'), say('kelp', 'Said the water carries it. I say the nets remember.')] }),
    done: { clue: ['clue:harbor', 'clue:fog-echo'], cameo: ['kelp'], journal: ['clue-harbor'] }, after: () => null },
  { id: 'cm-pemberton', act: 1, title: 'A symbol on a parcel label', region: 'city', npc: 'pemberton',
    avail: (v) => act1clue(v, 'clue:garden'), goal: 'Mr. Pemberton counts every label that passes his counter.', hint: 'Mr. Pemberton at the Corner Market in Whiskerwick City.',
    page: () => ({ say: [say('pemberton', 'A five-part symbol? Funny you should ask. It was on a parcel label, years back. Addressed to “the Keepers, care of the Hill”. Came back marked Not Known At This Address. I kept the label. Fine paper.'), say('pemberton', 'Five little petals round a paw. It wasn’t a stamp I knew. I keep what I can’t price.')] }),
    done: { clue: ['clue:garden', 'clue:parcel-label'], cameo: ['pemberton'], journal: ['clue-garden'] }, after: () => null },
  { id: 'cm-dewey', act: 1, title: 'Dewey remembers', region: 'library', npc: 'dewey',
    avail: (v) => act1clue(v, 'clue:archive'), goal: 'Dewey keeps the Old Library; he may remember a note about keepers.', hint: 'Dewey, the librarian, by the Old Library desk.',
    page: () => ({ say: [say('dewey', 'Keepers, a route and a temple on a hill. There is a note. It’s been misfiled since before I began misfiling. Try the archive drawer — or, since you’re polite, here it is.'), say('dewey', 'Don’t tell Folio. He’ll want to sleep on it.')] }),
    done: { clue: ['clue:archive', 'clue:keepers-route'], cameo: ['dewey'], journal: ['clue-archive'] }, after: () => null },

  // ---- memories that belong to the five places (all optional; each also gives a gentle hint) ------------------
  { id: 'cm-sky', act: 2, title: 'Sky and the wind', region: 'rooftops', npc: 'sky',
    avail: (v) => act2(v) && !v.story.cameo('sky'), goal: 'Sky draws the skyline from the rooftops and may remember the wind-swept stair.', hint: 'Sky, near the rooftop seats.',
    page: () => ({ say: [say('sky', 'The wind-swept stair at the east end? Slate chimes up the ridge — only sing when it’s quiet enough to hear yourself think. I sat there once for an hour and a half and they sang for twelve seconds. Best twelve seconds of the year.'), say('sky', 'Don’t go in a hurry. The wind knows.')] }),
    done: { cameo: ['sky'], journal: ['mem-sky'] }, after: () => null },
  { id: 'cm-tide', act: 2, title: 'Tide and the lantern', region: 'harbor', npc: 'tide',
    avail: (v) => act2(v) && !v.story.cameo('tide'), goal: 'Tide, the lighthouse apprentice, knows lantern lore.', hint: 'Tide, on the lighthouse path.',
    page: () => ({ say: [say('tide', 'There’s a keepers’ lantern at the end of the long dock. Five coloured panes. Marlow says nobody’s lit it since before the storm.'), say('tide', 'A pane of light isn’t a direction. It needs someone to say what it’s pointing at. Which is exactly the sort of thing I write in my notebook and then never understand.')] }),
    done: { cameo: ['tide'], journal: ['mem-tide'] }, after: () => null },
  { id: 'cm-thistle', act: 2, title: 'Thistle and the strings', region: 'forest', npc: 'thistle',
    avail: (v) => act2(v) && !v.story.cameo('thistle'), goal: 'Thistle the herbalist keeps the quiet corners of Whisperwood.', hint: 'Thistle, at the quiet north-west of Whisperwood.',
    page: () => ({ say: [say('thistle', 'There are little chimes in the ferns past the herb patch. Some don’t ring. Their strings are tangled. I keep meaning to fix them, but I only come out when it’s quiet, and the quiet is when they’d most like fixing.'), say('thistle', 'Nobody notices a tangle until someone does.')] }),
    done: { cameo: ['thistle'], journal: ['mem-thistle'] }, after: () => null },
  { id: 'cm-starling', act: 2, title: 'Starling and the bridge', region: 'isles', npc: 'starling',
    avail: (v) => act2(v) && !v.story.cameo('starling'), goal: 'Starling charts the stars and listens to the bridges.', hint: 'Starling, on the central isle.',
    page: () => ({ say: [say('starling', 'The west bridge hums when the stars are out. Put your paw on the rail and clap. It claps back — a moment late. If you clap something else it claps THAT, but a little wrong, and a little better.'), say('starling', 'I keep thinking the bridge is laughing. Then I think it’s just generous.')] }),
    done: { cameo: ['starling'], journal: ['mem-starling'] }, after: () => null },
  { id: 'cm-snowdrop', act: 2, title: 'Snowdrop and the high place', region: 'highlands', npc: 'snowdrop',
    avail: (v) => act2(v) && !v.story.cameo('snowdrop'), goal: 'Snowdrop watches the aurora and might know the high viewpoint.', hint: 'Snowdrop, near Aurora Point.',
    page: () => ({ say: [say('snowdrop', 'The old marker on the high ridge? Cracked in half years ago. The path’s steep and the stones are loose, but you can see for miles. You can see a roof, if you know where to look.'), say('snowdrop', 'Bring a blanket and no expectations. Same as the aurora.')] }),
    done: { cameo: ['snowdrop'], journal: ['mem-snowdrop'] }, after: () => null },

  // ---- ordinary life and humour ----------------------------------------------------------------------------------
  { id: 'cm-moss', act: 2, title: 'Moss and the quiet bell', region: 'city-park', npc: 'moss',
    avail: (v) => act2(v) && !v.story.cameo('moss'), goal: 'Moss, the sleepy neighbour, knows where the quietest bell can be heard.', hint: 'Moss, in the Residential District of Grand City Park.',
    page: () => ({ say: [say('moss', 'Mm? The quietest bell in the city is the one at the top of the iron stairs, on the roofs. It only rings if nobody’s trying.'), say('moss', 'That’s my method for most things. …Nap time.')] }),
    done: { cameo: ['moss'], journal: ['mem-moss'] }, after: () => null },
  { id: 'cm-pepper', act: 2, title: 'Pepper’s hopscotch', region: 'city-park', npc: 'pepper',
    avail: (v) => act2(v) && !v.story.cameo('pepper'), goal: 'Pepper organises park games; five notes sounds like a game to them.', hint: 'Pepper, near the park’s games lawn.',
    page: () => ({ say: [say('pepper', 'Five notes in a row, with a pause? That’s hopscotch! Obviously. You hop on the first four and then you have to wait on the last one until the bridge says it’s your turn.'), say('pepper', 'Okay, that’s just a guess. But I’m right about most guesses.')] }),
    done: { cameo: ['pepper'], journal: ['mem-pepper'] }, after: () => null },
  { id: 'cm-fern', act: 2, title: 'Fern and the blue flower', region: 'city-park', npc: 'fern',
    avail: (v) => act2(v) && !v.story.cameo('fern'), goal: 'Fern the gardener may recognise the blue flower by the stone.', hint: 'Fern, near the park flower beds.',
    page: () => ({ say: [say('fern', 'Oh, the blue one beside the old boundary stone? Chime-bells. It only grows where chimes used to hang. I’ve seen it near ferns in Whisperwood too.'), say('fern', 'So where there’s a patch of those, somebody once hung something that rang. That’s all it is. And it’s lovely.')] }),
    done: { cameo: ['fern'], journal: ['mem-fern'] }, after: () => null },
  { id: 'cm-wren', act: 2, title: 'Wren and the thread', region: 'old-town', npc: 'wren',
    avail: (v) => v.story.done('a1-chime-repair') && !v.story.done('a3-letgo') && !v.story.cameo('wren-chat'), goal: 'Wren might have a word about the chime.', hint: 'Wren, in the bookshop on Market Lane.',
    page: (v) => ({ say: [say('wren', v.story.chime() === 'craft' ? 'You did a neat stitch on that chime — ribbon-bound, I mean, with Lumi holding the corners. Doesn’t sound a bit like a bell. Sounds like a good page turning. Lovely.' : v.story.chime() === 'improv' ? 'I heard your bottle-cap chime from the bookshop. Don’t ever change it. It’s the only thing in Old Town that sounds like it’s enjoying itself.' : v.story.chime() === 'wait' ? 'The cracked one? It sings a bit like me on my third coffee. I like it. Tell me if you decide to mend it — I’ve thread.' : 'That careful chime of yours. Every joint straight. You’d make a bookbinder yet.')] }),
    done: { cameo: ['wren-chat'] }, after: () => null },
];
