/**
 * Act II — The Trail That Remembers.
 * Five places, five memories (each: a place on an existing map, a small interaction, a choice, a musical phrase),
 * Biscuit tells the truth, Velvet gives his account, the melody is arranged around how you listen, the gate opens.
 */
import { ask, biscuit, lumi, narr, opt, say, velvet, type Page, type Scene } from './kit.ts';

const act2 = (v: { story: { done(s: string): boolean } }) => v.story.done('a1-end') && !v.story.done('a2-gate');
const needPhrase = (id: string) => (v: { story: { done(s: string): boolean; phrase(p: string): boolean } }) => act2(v) && !v.story.phrase(id);
const glow = narr('Lumi’s little light, the one she bottled for you at the end of Act I, glows warm at your shoulder: “I’m with you. Mostly. Please don’t leave the jar in the rain.”');

export const ACT2: Scene[] = [
  // ============================================================ 1. The Wind Steps (patience) — stand still to hear it
  {
    id: 'a2-wind', act: 2, title: 'The Wind Steps', region: 'rooftops', hold: 4000,
    spot: { id: 'story-windsteps', label: 'Stand on the old stone steps', x: 120, y: 330, glyph: 'steps' },
    avail: needPhrase('wind'),
    goal: 'The Wind Steps (the Rooftops): the chimes only ring when you stand still long enough to hear the wind.', hint: 'Up the iron stairs at the east end of Library Row, then the stone steps on the rooftops’ west side. Stand still when you arrive.',
    page: () => ({
      say: [
        narr('Old stone steps climb the roof ridge and overlook all of Whiskerwick. Small slate chimes hang along the rail, completely, stubbornly silent.'),
        glow,
        narr('Not a puff. Not a breath. The chimes are waiting for you to stop being in a hurry.'),
        narr('You wait. The wind turns its head. And then, one by one, the slate chimes begin to speak — five tones, climbing, and a long, lovely rest at the end.'),
      ],
      listen: { label: 'Hear the first phrase', cue: 'phrase-wind' },
      ask: ask('a2-wind.how', [
        opt('stay', 'patience', 'Stay a little longer than you need to.', [
          narr('A second layer of sound arrives, softer, as if the first had been the introduction. The wind seems pleased.'),
        ], { phrase: ['wind'], journal: ['place-wind'], play: 'phrase-wind' }, windTail()),
        opt('hum', 'courage', 'Hum it back out loud, off-key and without apologising.', [
          narr('Your voice wobbles. The chimes forgive it at once. The wind carries a second phrase back, the same one but braver.'),
        ], { phrase: ['wind'], journal: ['place-wind'], play: 'phrase-wind' }, windTail()),
        opt('whistle', 'playfulness', 'Whistle a reply, with a flourish.', [
          narr('The wind stumbles on your flourish, then copies it, then improves it. Somewhere, a pigeon is rather offended.'),
        ], { phrase: ['wind'], journal: ['place-wind'], play: 'phrase-wind' }, windTail()),
        opt('steady', 'kindness', 'Cup your paws round the nearest chime to steady it for whoever comes next.', [
          narr('The chime rings under your paws, and the note is round and calm. You can feel it in your whiskers.'),
        ], { phrase: ['wind'], journal: ['place-wind'], play: 'phrase-wind' }, windTail()),
        opt('notice', 'curiosity', 'Watch which direction the wind moves between the chimes.', [
          narr('It curls from the harbour, up the stairs and over the ridge towards the north-west. Exactly where the light was.'),
        ], { phrase: ['wind'], journal: ['place-wind'], clue: ['clue:wind-direction'], play: 'phrase-wind' }, windTail()),
      ]),
    }),
    after: () => ({ say: [narr('The slate chimes sing a little when you pass — or perhaps you only think they do.')] }),
  },

  // ============================================================ 2. The Harbour Lantern (curiosity) — five panes, five tones
  {
    id: 'a2-lantern', act: 2, title: 'The Harbour Lantern', region: 'harbor',
    spot: { id: 'story-lantern5', label: 'Look at the keepers’ lantern', x: 410, y: 288, glyph: 'lantern5' },
    avail: needPhrase('lantern'),
    goal: 'The Harbour Lantern (Pawport): a weathered lantern with five coloured panes.', hint: 'Pawport Harbor: the end of the long dock, past the finger piers.',
    page: (v) => ({
      say: [
        narr('At the very end of the long dock stands a weathered lantern with five panes of coloured glass — rose, blue, amber, green and violet. Its candle has been cold for years.'),
        glow,
        narr(v.story.clue('clue:fog-echo') ? 'You remember Marlow’s fog: the lights looked close, and the tune sounded close, and none of it was where it seemed.' : 'The panes are different in colour but the same in size, as if one of them mattered no more than any other.'),
        narr('A beam of light is not a direction by itself. It needs a story to tell you where it is pointing.'),
      ],
      ask: ask('a2-lantern.pane', [
        opt('blue', 'curiosity', 'Light the blue pane first, and ask what it’s pointing at.', [
          narr('The blue beam falls across the water and stops on a single post of the old pier. A tiny note is scratched into it: the second of the five.'),
        ], { phrase: ['lantern'], journal: ['place-lantern'], clue: ['clue:lantern-context'], play: 'phrase-lantern' }, lanternTail()),
        opt('rose', 'kindness', 'Light the rose pane, the one nearest the old, lonely end of the dock.', [
          narr('Rose light warms the weathered boards. The planks seem to lean into it. A second beam finds the post: the same scratched note.'),
        ], { phrase: ['lantern'], journal: ['place-lantern'], play: 'phrase-lantern' }, lanternTail()),
        opt('amber', 'courage', 'Light the amber pane and walk out to where it points, without waiting to be sure.', [
          narr('You walk out to the very end of the dock. The beam lands at your paws. There, scratched in the wood, is the note.'),
        ], { phrase: ['lantern'], journal: ['place-lantern'], play: 'phrase-lantern' }, lanternTail()),
        opt('green', 'patience', 'Light the green pane and wait to see what it slowly reveals.', [
          narr('The green light travels so slowly across the water that you almost miss it. Then it reaches the post, and the note shows itself, as if it had been waiting politely.'),
        ], { phrase: ['lantern'], journal: ['place-lantern'], play: 'phrase-lantern' }, lanternTail()),
        opt('violet', 'playfulness', 'Light the violet pane and swing the lantern to chase the beam about.', [
          narr('The beam skitters across the boats and the gulls and finally pounces on the post. The gulls look scandalised. The note is there.'),
        ], { phrase: ['lantern'], journal: ['place-lantern'], play: 'phrase-lantern' }, lanternTail()),
      ]),
    }),
    after: () => ({ say: [narr('The five panes catch the evening light. Someone — maybe you — has made it look as if the lantern is almost smiling.')] }),
  },

  // ============================================================ 3. The Listening Garden (kindness) — three tangled chimes, then the last
  {
    id: 'a2-garden', act: 2, title: 'The Listening Garden', region: 'forest',
    spot: { id: 'story-garden-heart', label: 'Visit the quiet heart of the garden', x: 100, y: 200, glyph: 'gardenchime' },
    avail: (v) => needPhrase('garden')(v) && v.story.mark('garden:0') && v.story.mark('garden:1') && v.story.mark('garden:2'),
    goal: 'The Listening Garden (Whisperwood): small chimes hang among the ferns, and some are silent because their strings are tangled.', hint: 'Whisperwood’s north-west corner near Thistle: untangle the three silent chimes, then visit the quiet heart of the garden.',
    page: () => ({
      say: [
        narr('With the three tangled chimes freed, the garden is no longer quiet. Small voices, silver and wooden and glass, run through the ferns like a conversation that has started again after a long pause.'),
        glow,
        narr('In the middle of them hangs a last chime, smaller than your paw, that nobody had noticed. It has no string at all.'),
      ],
      ask: ask('a2-garden.last', [
        opt('hang', 'kindness', 'Hang it where passing cats will hear it first.', [
          narr('You loop a bit of thread round its top and hang it at paw height, beside the path. The first cat who walks past is going to be very surprised.'),
        ], { phrase: ['garden'], journal: ['place-garden'], play: 'phrase-garden' }, gardenTail()),
        opt('untangle', 'patience', 'Sit down and find the string slowly, even if it takes the whole evening.', [
          narr('The thread was under a fern all along. It isn’t even knotted. It had simply gone unnoticed.'),
        ], { phrase: ['garden'], journal: ['place-garden'], play: 'phrase-garden' }, gardenTail()),
        opt('why', 'curiosity', 'Find out why someone hung it so low.', [
          narr('Because the chime was made for a very small paw. Somebody, once, taught a kitten to ring it. You can almost see the thread worn by a small, stubborn pull.'),
        ], { phrase: ['garden'], journal: ['place-garden'], clue: ['clue:garden-kitten'], play: 'phrase-garden' }, gardenTail()),
        opt('beads', 'playfulness', 'Give it a new string of mismatched beads and see how it sounds.', [
          narr('Beads of every colour. It rings like a tiny glass of pop. Thistle appears from nowhere and says only, “…oh.”'),
        ], { phrase: ['garden'], journal: ['place-garden'], play: 'phrase-garden' }, gardenTail()),
      ]),
    }),
    after: () => ({ say: [narr('The small chimes sound a little like laughter and a little like rain. Somebody has put a very small watering can in the ferns.')] }),
  },
  // ---- the three tangled chimes (environmental; any order). Spots only — their text is written in world.ts.

  // ============================================================ 4. The Echo Bridge (playfulness) — repeat, change or pause
  {
    id: 'a2-echo', act: 2, title: 'The Echo Bridge', region: 'isles',
    spot: { id: 'story-echobridge', label: 'Stand on the humming bridge', x: 192, y: 248, glyph: 'echo' },
    avail: needPhrase('echo'),
    goal: 'The Echo Bridge (the Dreaming Isles): notes come back a moment after you play them.', hint: 'Walk the star bridge from Pawport; it’s the first bridge you cross.',
    page: () => ({
      say: [
        narr('The bridge hums under your paws. It is made of something half-stone and half-starlight, and the air above it holds sound for a long breath, like a cupped paw holding water.'),
        glow,
        narr('You clap once. A moment later, the bridge claps back, a hair softer. You laugh, and it laughs a moment later.'),
        narr('What will you say to a bridge that listens?'),
      ],
      listen: { label: 'Hear the bridge answer', cue: 'echo-demo' },
      ask: ask('a2-echo.reply', [
        opt('repeat', 'patience', 'Repeat the echo exactly, and let it settle.', [
          narr('You and the bridge say the same five notes to each other, in turn, with exactly the same gap. It’s quiet and fair and a little bit like being understood.'),
        ], { phrase: ['echo'], journal: ['place-echo'], play: 'echo-repeat' }, echoTail()),
        opt('change', 'playfulness', 'Change it — a skip, a trill, a wobble — and see what it does.', [
          narr('The bridge listens, thinks about it for exactly one beat, and returns your wobble… improved. It has been waiting a very long time for someone to improvise.'),
        ], { phrase: ['echo'], journal: ['place-echo'], play: 'echo-change' }, echoTail()),
        opt('pause', 'courage', 'Leave a pause where the last note should be — and trust it to fill it in.', [
          narr('You stop. The bridge hesitates, and then, softly, plays the missing note — not the one you expected, but the one that fits.'),
        ], { phrase: ['echo'], journal: ['place-echo'], play: 'echo-pause' }, echoTail()),
        opt('sing', 'kindness', 'Play it softly, so the quieter bridges further along can hear too.', [
          narr('Down the length of the bridge, one by one, small lights wake in answer. It is like passing a message down a row of sleepy friends.'),
        ], { phrase: ['echo'], journal: ['place-echo'], play: 'echo-repeat' }, echoTail()),
        opt('ask', 'curiosity', 'Ask it a question in notes — and listen to which way the answer goes.', [
          narr('Your question rises. The answer falls. It was, apparently, a yes.'),
        ], { phrase: ['echo'], journal: ['place-echo'], play: 'echo-change' }, echoTail()),
      ]),
    }),
    after: () => ({ say: [narr('The bridge hums when you step on it, like a cat deciding whether to purr.')] }),
  },

  // ============================================================ 5. The Watcher's Rise (courage) — the steep path and the broken marker
  {
    id: 'a2-rise', act: 2, title: 'The Watcher’s Rise', region: 'highlands',
    spot: { id: 'story-rise', label: 'Climb the steep path to the high marker', x: 484, y: 200, glyph: 'rise' },
    avail: needPhrase('rise'),
    goal: 'The Watcher’s Rise (Frostbell): a high viewpoint with a damaged marker, and a view of the temple.', hint: 'Frostbell Highlands: the steep path up the sled hill’s east side.',
    page: () => ({
      say: [
        narr('The steep path is loose and cold, and the old marker at the top has cracked straight through. Nothing about it says “come up here”.'),
        glow,
        lumi('I can’t tell you it’s safe. I can only tell you I’d like to see what’s up there, and I’d like it more if you were there too. That’s all I’ve got. Sorry.'),
        narr('The wind pulls at the carved stones. The whole thing is uncertain, and you decide how to be uncertain about it.'),
      ],
      ask: ask('a2-rise.how', [
        opt('climb', 'courage', 'Climb straight up, trusting your feet.', [
          narr('You go up the steep path with your heart in your ears. At the top, you realise you’ve been holding your breath since the bottom.'),
        ], { phrase: ['rise'], journal: ['place-rise', 'temple-seen'], play: 'phrase-rise' }, riseTail()),
        opt('mark', 'kindness', 'Mark the safest stones with scraps of ribbon for whoever climbs next.', [
          narr('It takes longer. By the time you reach the top there’s a ribbon-line of little blue waymarks behind you, flapping like a line of polite flags.'),
        ], { phrase: ['rise'], journal: ['place-rise', 'temple-seen'], play: 'phrase-rise' }, riseTail()),
        opt('test', 'patience', 'Test each stone with a paw before putting your weight on it.', [
          narr('You do not slip once. It is perhaps the most fiercely sensible climb in the history of cats.'),
        ], { phrase: ['rise'], journal: ['place-rise', 'temple-seen'], play: 'phrase-rise' }, riseTail()),
        opt('hop', 'playfulness', 'Take a bouncing zig-zag line, laughing at every wobble.', [
          narr('You slip twice, skid once and arrive at the top slightly sideways and completely delighted.'),
        ], { phrase: ['rise'], journal: ['place-rise', 'temple-seen'], play: 'phrase-rise' }, riseTail()),
        opt('study', 'curiosity', 'Study the broken marker first: what was it for?', [
          narr('Five lines are carved into the break, each pointing to a place you’ve been. The marker was a map in stone. Someone cracked it on purpose, to keep it from being followed — or to be mended.'),
        ], { phrase: ['rise'], journal: ['place-rise', 'temple-seen'], clue: ['clue:rise-marker'], play: 'phrase-rise' }, riseTail()),
      ]),
    }),
    after: () => ({ say: [narr('From the Watcher’s Rise, far across the highlands and the green hills, a roof gleams: the hilltop temple. It looks very small and very patient.')] }),
  },

  // ============================================================ Biscuit tells the truth
  {
    id: 'a2-biscuit-truth', act: 2, title: 'Biscuit tells the truth', region: 'city', npc: 'biscuit',
    lumi: { x: 516, y: 380 },
    avail: (v) => v.story.done('a1-end') && v.story.phraseCount() >= 2 && !v.story.done('a2-biscuit-truth'),
    goal: 'Biscuit has something to tell you. Visit them in Whiskerwick City once you have found two phrases.', hint: 'Two of the five places are enough. Biscuit is by the fountain in the day, under the café awning in rain.',
    page: () => ({
      say: [
        narr('Biscuit is not playing. The instrument sits across their knees like an unanswered letter.'),
        biscuit('Two of them, then. You’ve been to two of the places. I’ve been to none — I’ve sat here, pretending I wasn’t jealous of a map.'),
        biscuit('The older relative I told you about. They kept the chimes. After the keepers quarrelled, they stopped playing the song entirely. They gave me what they remembered, and I’ve been trying to finish it ever since — as if finishing it would fix whatever happened.'),
        biscuit('I told myself the missing phrase was a mistake. A wrong note, somewhere. But the real worry — the one I’ve never said — is that the song doesn’t finish because I’m not good enough to finish it.'),
      ],
      ask: ask('a2-biscuit.reply', [
        opt('reassure', 'kindness', 'Tell Biscuit the song is good as it is, and so are they.', [
          biscuit('…Don’t be nice at me. It’s very disorienting. —Thank you.'),
        ], { phrase: ['biscuit'], bond: { biscuit: 2 }, journal: ['biscuit-truth'], play: 'lullaby-1' }, biscuitMelody()),
        opt('practise', 'patience', 'Offer to sit and practise it together — slowly, as long as it takes.', [
          biscuit('You’d sit through the bad bits? All of them? I’ve got a lot of bad bits.'),
        ], { phrase: ['biscuit'], bond: { biscuit: 2 }, journal: ['biscuit-truth'], play: 'lullaby-1' }, biscuitMelody()),
        opt('relative', 'curiosity', 'Ask about the relative: what were they like?', [
          biscuit('Stubborn, funny, dreadful at tea. They’d hum the song to the chimes before sunrise and pretend they hadn’t. —I’d forgotten that. I’d forgotten they hummed.'),
        ], { phrase: ['biscuit'], bond: { biscuit: 1 }, journal: ['biscuit-truth'], clue: ['clue:relative-hummed'], play: 'lullaby-1' }, biscuitMelody()),
        opt('imperfect', 'courage', 'Say, honestly, that the song may not have one perfect ending.', [
          biscuit('…That’s a terrible thing to say. I think it might also be true. It’s very hard to hear and it’s the first time anybody’s said it out loud.'),
        ], { phrase: ['biscuit'], bond: { biscuit: 2 }, journal: ['biscuit-truth'], play: 'lullaby-1' }, biscuitMelody()),
      ]),
    }),
    after: () => ({ say: [biscuit('I’ve started humming it in the mornings, in front of people. Nobody has fainted. It’s remarkable.')] }),
  },

  // ============================================================ Velvet's account
  {
    id: 'a2-velvet-account', act: 2, title: 'Velvet’s account', region: 'old-town', npc: 'velvet',
    avail: (v) => v.story.done('a1-end') && v.story.phraseCount() >= 3 && !v.story.done('a2-velvet-account'),
    goal: 'Mr. Velvet will tell you the fuller story once you have three phrases.', hint: 'Find three of the five places, then visit Mr. Velvet at the old gate in Old Town’s hidden courtyard.',
    page: (v) => ({
      say: [
        velvet('Three phrases. Then it is time you heard the rest.'),
        velvet('The keepers built the Hearthsong to bring separated communities together. A good idea, and a kind one. But over time, people came to treat the song as the one correct answer to every disagreement.'),
        velvet('One group wanted the final melody kept exactly as it was, so nothing would be lost. Another wanted it to change as new cats joined, so nothing would be left out. Neither side was entirely wrong. That is the part they will not tell you. They both stopped listening.'),
        velvet('I was young at the final gathering. Very young. I promised I would protect the trail and see that no such hurt came again. In time, I began to believe that protecting it meant keeping the gate closed.'),
        velvet(v.story.done('a2-biscuit-truth') ? 'You have told me Biscuit’s relative stopped playing. They were one of the keepers I watched go quiet. I should have gone to see them. I told myself it was not my place.' : 'Do not misunderstand: I do not blame the keepers. I blame the silence afterwards. I was part of it.'),
      ],
      ask: ask('a2-velvet.reply', [
        opt('disagree', 'courage', 'Say you disagree — gently — and that you understand why he’s afraid.', [
          velvet('You say “gently” the way a hammer says it. …But you are not wrong. And you’re not unkind. Both can be true, apparently.'),
        ], { bond: { velvet: 2 }, journal: ['velvet-account'] }, velvetTail()),
        opt('young', 'curiosity', 'Ask who he was back then, before he was the one who remembers.', [
          velvet('A kitten who thought the Hearthsong was the loudest thing in the world. I was wrong. It was the quietest. I only noticed when it stopped.'),
        ], { bond: { velvet: 2 }, journal: ['velvet-account'], clue: ['clue:velvet-young'] }, velvetTail()),
        opt('wish', 'kindness', 'Ask what he wishes he’d done at the gathering.', [
          velvet('…I wish I had sat down between them and said nothing, until someone spoke. It is such a small thing. I have never said it before.'),
        ], { bond: { velvet: 3 }, journal: ['velvet-account'] }, velvetTail()),
        opt('silence', 'patience', 'Sit with him, and let the quiet be quiet.', [
          narr('You sit on the two-paw bench. After a while, after much, much longer than is polite, he sits down too. It’s the first time you’ve seen him sit when not at the clock.'),
          velvet('…Thank you.'),
        ], { bond: { velvet: 3 }, journal: ['velvet-account'] }, velvetTail()),
      ]),
    }),
    after: (v) => (v.story.done('a2-gate') ? null : { say: [velvet(v.story.phraseCount() >= 5 ? 'You have all five. I suppose I should have known that the first thing you would do on being told “no” is go and do the thing, kindly, in five places.' : 'The gate remains as it is. You have my word that I am thinking about it.')] }),
  },

  // ============================================================ the melody changes with the player
  {
    id: 'a2-arrange', act: 2, title: 'The melody changes with you', region: 'town', npc: 'lumi',
    lumi: { x: 424, y: 470 },
    avail: (v) => v.story.done('a2-biscuit-truth') && v.story.done('a2-velvet-account') && v.story.phraseCount() >= 5 && !v.story.done('a2-arrange'),
    goal: 'Bring the five phrases back to Lumi at the chime in Whiskerwood Village.', hint: 'Lumi waits by the old chime east of the village centre. You need all five phrases, and Biscuit’s and Velvet’s stories.',
    page: (v) => ({
      say: [
        lumi('Five phrases! I’ve been trying not to bounce. I’ve failed. Hold on — let me put them side by side.'),
        narr('Lumi spreads out the notebook pages and hums them, one after another, to the chime. The chime hums back, a little different each time.'),
        lumi(arrangeLine(v.story.leading())),
        lumi('It isn’t a rule. It’s how the five phrases heard you listen. Someone else would hear a different arrangement, and it would be right too. That’s the whole point, isn’t it? It’s not one correct song.'),
      ],
      listen: { label: 'Hear the five phrases together', cue: 'arrangement' },
    }),
    done: { journal: ['arrangement'], phrase: ['lullaby'], bond: { lumi: 1 } },
  },

  // ============================================================ the gate opens
  {
    id: 'a2-gate', act: 2, title: 'The gate opens', region: 'old-town', npc: 'velvet',
    spot: { id: 'story-gate-open', label: 'Return to the old trail gate', x: 28, y: 150, glyph: 'gate' },
    lumi: { x: 40, y: 166 },
    avail: (v) => v.story.done('a2-arrange') && !v.story.done('a2-gate'),
    goal: 'Take the five phrases back to Mr. Velvet at the old gate.', hint: 'The hidden courtyard in Old Town. Biscuit and Lumi will meet you there.',
    page: (v) => ({
      say: [
        narr('Lumi and Biscuit are already at the gate when you arrive. Biscuit is trying to look as if they just happened to be passing, with an instrument, on their back, at dusk, in a hidden courtyard.'),
        velvet('I see you have brought the whole parish. I do not change my mind because someone has completed a checklist.'),
        velvet(v.story.bond('velvet') >= 5 ? 'I will say this much: you have not asked me to hurry. That has not gone unnoticed.' : 'I will say this much: you have been courteous. That has not gone unnoticed.'),
        velvet('Play me the five. All of you. And I will tell you what I hear.'),
        narr('You play. Biscuit holds the second phrase longer than the rest. Lumi plays it quicker, tripping over her own paws. You are standing between them.'),
        velvet('There. Two readings of the same line. At the last gathering, they would have come to blows over that.'),
      ],
      ask: ask('a2-gate.between', [
        opt('both', 'kindness', 'Let both readings stand, one after the other.', [
          narr('Biscuit plays it long. Lumi plays it quick. The courtyard fills with both, and neither argues.'),
        ], { flags: ['region:temple'], journal: ['gate-opens'] }, gateOpens()),
        opt('turns', 'patience', 'Suggest taking turns, and listening properly to each.', [
          narr('Long. A pause. Quick. A pause. By the third round, Biscuit’s long note has a bit of a skip in it, and Lumi’s quick one has gained a little breath.'),
        ], { flags: ['region:temple'], journal: ['gate-opens'] }, gateOpens()),
        opt('why', 'curiosity', 'Ask each of them why they play it that way.', [
          narr('“It’s how it was taught to me,” says Biscuit. “It’s how it sounds in my head,” says Lumi. Both are listening so hard that they forget to be right.'),
        ], { flags: ['region:temple'], journal: ['gate-opens'] }, gateOpens()),
        opt('together', 'playfulness', 'Play both at once, as loudly and wrongly as possible.', [
          narr('It sounds like a dropped drawer of cutlery. Then it sounds like a duet. Mr. Velvet’s whisker twitches again.'),
        ], { flags: ['region:temple'], journal: ['gate-opens'] }, gateOpens()),
        opt('either', 'courage', 'Say you’d love to hear both, and you won’t pretend to choose.', [
          narr('Nobody argues. It’s oddly hard to argue with someone who isn’t asking you to lose.'),
        ], { flags: ['region:temple'], journal: ['gate-opens'] }, gateOpens()),
      ]),
    }),
    done: {},
    after: (v) => (v.story.done('a3-letgo') ? null : { say: [velvet('The gate is open. It creaks. I have decided that is part of its character, not a fault.')] }),
  },
];

// ---- shared tails -----------------------------------------------------------------------------------------------

function windTail(): Page {
  return { say: [
    lumi('That’s the first of the five — the first stop. Patience for the first one, I think; the wind insisted.'),
    narr('The first phrase settles in your notebook, in a small hand: a rising line with a long, lovely rest at the end.'),
  ] };
}
function lanternTail(): Page {
  return { say: [
    lumi('The second note, in the second place. The light is almost always the easy part; knowing what it means is what takes the whole trail.'),
    narr('You copy the phrase down. A little wave of notes — up, up, a wide step across, and a small resting turn.'),
  ] };
}
function gardenTail(): Page {
  return { say: [
    say('thistle', '…You noticed the little one. Nobody notices the little one. I’ll… leave the gate of the herb patch open for you. If you like.'),
    narr('The third phrase is gentle and woody: a walking pattern that returns to its first note as if it had never left.'),
  ] };
}
function echoTail(): Page {
  return { say: [
    lumi('It answered! It doesn’t answer everyone like that, I’m convinced. It needs you to be a bit silly.'),
    narr('The fourth phrase is an echo-shaped thing: each note repeats, then returns changed.'),
  ] };
}
function riseTail(): Page {
  return { say: [
    narr('At the top of the Watcher’s Rise, the whole of the highlands falls away. Far across the hills, small and patient and silver, a roof catches the light. A temple.'),
    lumi('That’s it. That’s the place in the margin — the dot with lines. It isn’t a spider. It is the nicest thing I have ever seen. —You were very brave. Or very sensible. Either way, thank you for going up.'),
    narr('The fifth phrase is a long, climbing line with a held note at the top, as if a cat paused at the edge and looked down.'),
  ] };
}
function biscuitMelody(): Page {
  return { say: [
    biscuit('Right. Here is the melody. All of it. As far as I have it.'),
    narr('Biscuit plays the song — all five tones, straight through, with the missing phrase left as a gap. For the first time in the whole story, they don’t apologise at the end.'),
    lumi('It’s beautiful. It’s the most beautiful incomplete thing I’ve ever heard.'),
    biscuit('Don’t say incomplete. Say… in progress.'),
  ] };
}
function velvetTail(): Page {
  return { say: [
    velvet('The gate remains closed. But I will tell you this: it is a little less closed than it was an hour ago.'),
    narr('He looks, for a moment, as if he has set down something heavy and has not yet noticed that his arms are free.'),
  ] };
}
function gateOpens(): Page {
  return { say: [
    velvet('…Neither insisted. That is what I have waited to see.'),
    narr('Mr. Velvet puts the key into the lock. It turns more easily than a key that old has any right to.'),
    narr('The gate creaks open. From far up the hill, a chime answers. Biscuit laughs in surprise — and immediately tries to pretend they didn’t.'),
    biscuit('I did not laugh. That was a cough. There’s a lot of dust.'),
    velvet('The trail leads to the temple. The melody remains incomplete. I would be obliged if you would go on without hurrying.'),
    narr('Beyond the gate, a path of old stones climbs into the dusk. The Old Trail is open.'),
  ] };
}

export function arrangeLine(lead: readonly string[]): string {
  if (!lead.length) return 'It’s easy to hear — it sounds like you haven’t settled on one way yet. It sounds like all of them. That’s a very full way to sound.';
  const t = lead[0];
  const first: Record<string, string> = {
    kindness: 'It’s warmer than I expected. Every phrase has a little friend sitting beside it, a sort of shared harmony — as if each note keeps an eye out for the next.',
    curiosity: 'There’s a countermelody I didn’t put there — a little question that follows the main tune round the room. And a detail I’ve never heard before, tucked inside the third phrase.',
    courage: 'The lead is bold. A direct, ringing line that doesn’t wait to be asked. It’s the opposite of how I’d hum it, and I find I really like it.',
    patience: 'It’s slower than I expected. Longer rests, softer ends to the phrases. It sounds like someone letting a sentence finish.',
    playfulness: 'It bounces! The rhythm keeps changing its mind. I didn’t write that — you did. Or, well, the way you listened did.',
  };
  const second = lead[1] ? ` And underneath, a thread of ${lead[1]}: it won’t quite let go.` : '';
  return (first[t] ?? first.kindness) + second;
}
