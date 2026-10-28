/**
 * Act III — The Temple of Many Voices, and the Epilogue — The Town Keeps Singing.
 * No combat, no explosion: the wonder is recognition. The ending's SHAPE follows how you listened.
 */
import { ask, biscuit, crumpet, lumi, narr, opt, velvet, type Page, type Scene } from './kit.ts';

const afterGate = (v: { story: { done(s: string): boolean } }) => v.story.done('a2-gate');

export const ACT3: Scene[] = [
  // ============================================================ 1. the quiet temple
  {
    id: 'a3-quiet', act: 3, title: 'The quiet temple', region: 'temple',
    spot: { id: 'story-temple-hall', label: 'Step into the quiet hall', x: 288, y: 236, radius: 26 },
    lumi: { x: 256, y: 150 },
    avail: (v) => afterGate(v) && !v.story.done('a3-quiet'),
    goal: 'Walk the old trail to the temple and step into its hall.', hint: 'Through the old gate in Old Town’s hidden courtyard. The path is long, but it is only one path.',
    page: () => ({
      say: [
        narr('The temple is beautiful and weathered. A roof of old tile, half open to the sky. Worn steps. Little offerings tucked in the corners: a cracked bowl of seeds, a tiny ribbon, a pebble painted with a smile. Cats have been here. Many different cats.'),
        narr('At the far end, on a dais, stands the Hearthsong: a stone frame hung with chimes of every size, some silver, some wooden, some glass. Half of them are missing. All of them are silent.'),
        lumi('It’s so quiet it makes my whiskers itch. And I’ve been trying not to talk, and it’s going badly.'),
        velvet('I have not been inside since the final gathering. It is smaller than I remember. That is how you know you were young.'),
        biscuit('Look at the worn spots on the floor. Different cats stood in different places. Some of them stood where they were supposed to. Some of them clearly did not.'),
      ],
      ask: ask('a3-quiet.look', [
        opt('marks', 'curiosity', 'Look at the five marks carved on the walls.', [
          lumi('One for each tone! Kindness, curiosity, courage, patience, playfulness. Every cat who played here must have left a note beside the mark they favoured.'),
        ], { journal: ['temple-quiet'], clue: ['clue:temple-marks'] }, quietTail()),
        opt('offerings', 'kindness', 'Straighten the little offerings, one by one.', [
          narr('You set the ribbon back on its hook, the bowl on its stand, the pebble in the sun. It is a small thing. The whole hall seems to breathe out.'),
        ], { journal: ['temple-quiet'] }, quietTail()),
        opt('floor', 'patience', 'Follow the worn paths in the floor, slowly, and see where they lead.', [
          narr('All the paths meet in the middle, below the dais. Not at the front. At the heart. It’s as if everyone was walking toward the same spot from a different direction.'),
        ], { journal: ['temple-quiet'], clue: ['clue:temple-paths'] }, quietTail()),
        opt('ring', 'playfulness', 'Tap one of the silent chimes with a claw, just to see.', [
          narr('Tink. It isn’t a note, exactly. It’s a small cough of metal. Biscuit winces. Lumi giggles. The echo, however, takes a long, long time to come home.'),
        ], { journal: ['temple-quiet'] }, quietTail()),
        opt('hello', 'courage', 'Stand in the middle of the hall and say hello, out loud.', [
          narr('Your voice goes up into the empty roof. The temple considers it, and then, softly, returns the last syllable.'),
        ], { journal: ['temple-quiet'] }, quietTail()),
      ]),
    }),
    after: () => ({ say: [narr('The temple is quiet. It no longer sounds like a place that is holding its breath.')] }),
  },

  // ============================================================ 2. the missing phrase
  {
    id: 'a3-phrase', act: 3, title: 'The missing phrase', region: 'temple',
    spot: { id: 'story-hearthsong', label: 'Gather at the Hearthsong', x: 288, y: 116, radius: 26 },
    avail: (v) => v.story.done('a3-quiet') && !v.story.done('a3-phrase'),
    goal: 'Gather at the Hearthsong and decide what the song is meant to say.', hint: 'The dais at the far end of the temple hall.',
    page: () => ({
      say: [
        narr('The five phrases fit into the Hearthsong like keys. Five of its chimes ring. The sixth place — the last phrase, the one Biscuit has been trying to finish all his life — is a hollow chime with no voice.'),
        biscuit('I thought it would be a note. I’ve hunted for it like a note. It isn’t a note, is it. It’s a… decision.'),
        biscuit('I want to honour the original melody. Exactly. If we change it, what do we lose?'),
        velvet('I would prefer we change nothing. If we change it, we erase what they meant. I know that is the very reasoning that closed the gate. I am aware of it. I am also — a little — right.'),
        lumi('Preserving a memory doesn’t mean freezing it. A song in a glass box isn’t remembered. It’s just… kept. I think. I’m not sure. I’m only saying what the lullaby says.'),
        narr('Nobody is wrong. That is the difficulty.'),
      ],
      ask: ask('a3-phrase.how', [
        opt('everyone', 'kindness', 'Invite everyone to bring a phrase of their own to the song.', [
          narr('Lumi offers a lullaby-line. Biscuit, after a long pause, offers four notes from the old relative’s hum. Velvet — slowly, stiffly — offers a single, rather formal note. It is the oddest chord you have ever heard, and it is perfect.'),
        ], { phrase: ['temple'], bond: { lumi: 1, biscuit: 1, velvet: 1 }, journal: ['temple-phrase'] }, phraseTail('everyone')),
        opt('original', 'patience', 'Rebuild the original notes first, exactly — and only then see what wants to be added.', [
          narr('It takes a long time. The old relative’s fingerings, Velvet’s remembered rhythm, Lumi’s lullaby. When the original is whole at last, Biscuit sits back and cries a bit. Nobody mentions it.'),
        ], { phrase: ['temple'], bond: { biscuit: 2, velvet: 1 }, journal: ['temple-phrase'] }, phraseTail('original')),
        opt('ask', 'curiosity', 'Ask each of them what they most want to be remembered.', [
          lumi('That someone listened. Even when I couldn’t explain it.'),
          biscuit('That the old relative hummed to the chimes before sunrise. And that I didn’t finish it, but I tried.'),
          velvet('That the gate was closed out of love. And that it was opened, in the end, out of the same love.'),
        ], { phrase: ['temple'], bond: { lumi: 1, biscuit: 1, velvet: 2 }, journal: ['temple-phrase'] }, phraseTail('ask')),
        opt('play', 'playfulness', 'Just start playing — anything — and let the others answer.', [
          narr('You tap a rhythm. Lumi adds a bright trill. Biscuit, scandalised, adds a bass note. Velvet — after a very long moment — adds, quite distinctly, a wrong one. Everyone freezes. And then it turns out to be the right wrong one.'),
        ], { phrase: ['temple'], bond: { lumi: 1, biscuit: 1, velvet: 1 }, journal: ['temple-phrase'] }, phraseTail('play')),
        opt('silence', 'courage', 'Leave a deliberate silence — for what cannot be mended — and trust the song with it.', [
          narr('The group lets the gap stand. Not an absence, exactly. A rest. A place where the keepers who didn’t speak, and the cat who didn’t visit, and the gate that stayed closed, are given room. It’s the loudest silence you have ever heard.'),
        ], { phrase: ['temple'], bond: { biscuit: 1, velvet: 2 }, journal: ['temple-phrase'] }, phraseTail('silence')),
      ]),
    }),
    after: () => ({ say: [narr('The last chime hangs among the others, no longer hollow. It is the one that is most obviously still being written.')] }),
  },

  // ============================================================ 3. the Hearthsong
  {
    id: 'a3-hearthsong', act: 3, title: 'The Hearthsong', region: 'temple',
    spot: { id: 'story-hearthsong-play', label: 'Play the Hearthsong', x: 288, y: 116, radius: 26 },
    avail: (v) => v.story.done('a3-phrase') && !v.story.done('a3-hearthsong'),
    goal: 'Play the completed song together, at the Hearthsong.', hint: 'The dais at the end of the temple hall.',
    page: (v) => ({
      say: [
        narr('You play it together. Not loudly. Not perfectly. The chimes that were already mended answer first: the street chime in the town, wherever it hangs; the bridge, the stairs, the little ones in the ferns. Even the fog bell — you can hear it, thin and cheerful, from very far away.'),
        narr('The five phrases appear as small lights in the air, each in its own colour — rose, blue, amber, green, violet — and take their places on the frame of the Hearthsong, one by one.'),
        narr('The temple lights wake slowly. Not all at once. Each lantern turns up like someone who has been told it’s allowed to.'),
        ...finaleLines(v.story.leading()),
        narr(montage(v.story.state.cameos)),
        lumi('It isn’t a spell. Nothing is exploding. The town is just… answering. That’s all. It’s answering a song that people finally learned to share.'),
      ],
      listen: { label: 'Hear the Hearthsong', cue: 'hearthsong' },
    }),
    done: { journal: ['hearthsong-played'], bond: { lumi: 1, biscuit: 1, velvet: 1 }, play: 'hearthsong' },
    after: () => null,
  },

  // ============================================================ 4. Velvet lets go
  {
    id: 'a3-letgo', act: 3, title: 'Velvet lets go', region: 'temple', npc: 'velvet',
    avail: (v) => v.story.done('a3-hearthsong') && !v.story.done('a3-letgo'),
    goal: 'Talk to Mr. Velvet, who has been very quiet since the song.', hint: 'Mr. Velvet is in the middle of the temple hall.',
    page: (v) => ({
      say: [
        velvet('Keeping the gate closed was easier than risking another disagreement. That is the whole of it. I called it protection because the other word was “fear”, and I did not enjoy it.'),
        velvet(v.story.bond('velvet') >= 6 ? 'You did not push me. You did not need to. I am very, very sorry that I made you wait this long.' : 'I apologise. For the gate, and for the years, and for the way I said “closed” as if it were the same as “safe”.'),
        narr('He does not turn into a completely different cat. He adjusts his glasses, which is much more convincing.'),
        biscuit('And I’m — I’ve decided I don’t have to stop changing it. Just because it’s finished doesn’t mean it’s done. Does it? That’s a thing songs can do. Be finished and carry on.'),
        lumi('And I was wrong about the lullaby. It was never just a map. It was how to remember how to listen. I was carrying a map of listening, and I thought I was carrying directions.'),
        narr('Nobody says anything for a while. The temple, for the first time in a very long time, is not holding its breath.'),
      ],
      ask: ask('a3-letgo.keep', [
        opt('rota', 'kindness', 'Suggest that every resident takes a turn looking after the chimes.', [
          velvet('A rota. I have strong views on rotas. I have also, I find, never once seen a bad one that someone tried to be fair about.'),
        ], { epilogue: true, flags: ['sshared:temple-open'], journal: ['temple-open'], bond: { velvet: 1 } }, letgoTail()),
        opt('small', 'patience', 'Start small: one evening a week, and see who comes.', [
          velvet('One evening. Yes. Small enough to survive, steady enough to count.'),
        ], { epilogue: true, flags: ['sshared:temple-open'], journal: ['temple-open'], bond: { velvet: 1 } }, letgoTail()),
        opt('names', 'courage', 'Put the names of the keepers — and your own — on the door.', [
          biscuit('Our names? On a door? In ink? …Yes. Alright. Yes.'),
        ], { epilogue: true, flags: ['sshared:temple-open'], journal: ['temple-open'], bond: { biscuit: 1 } }, letgoTail()),
        opt('party', 'playfulness', 'Make it a party, and invite everyone, and let the chimes sound however they like.', [
          lumi('A party! With chimes! Do you know how long I’ve wanted a party that was also a map?'),
        ], { epilogue: true, flags: ['sshared:temple-open'], journal: ['temple-open'], bond: { lumi: 1 } }, letgoTail()),
        opt('ask', 'curiosity', 'Ask the town what it wants the temple to be.', [
          velvet('Ask. Of course. I have never in my life simply… asked. It sounds so reckless.'),
        ], { epilogue: true, flags: ['sshared:temple-open'], journal: ['temple-open'], bond: { velvet: 1 } }, letgoTail()),
      ]),
    }),
    done: { epilogue: true },
    after: () => null,
  },

  // ============================================================ EPILOGUE
  {
    id: 'ep-purring', act: 4, title: 'The town keeps singing', region: 'purring-cup', npc: 'biscuit',
    avail: (v) => v.story.epilogue() && !v.story.done('ep-purring'),
    goal: 'Epilogue: visit Biscuit at The Purring Cup.', hint: 'The Purring Cup, in Whiskerwick City’s Café Quarter.',
    page: (v) => ({
      say: [
        narr('Biscuit is on the little stage at The Purring Cup, tuning an instrument that, you’d swear, has acquired a new string.'),
        biscuit('It’s Thursday. Which means… nothing in particular. I just wanted to play it for people. Out loud. In a café. With cake.'),
        narr(epilogueTown(v.story.chime(), v.story.state.cameos)),
        biscuit('Come and play with us on the music evening. It’s not a performance. It’s more of a… thing that happens near cake.'),
      ],
    }),
    done: { journal: ['ep-purring'] },
    after: (v) => ({ say: [biscuit(v.story.leading()[0] === 'playfulness' ? 'The Thursday crowd have started to improvise. I’m choosing to find it charming. (I’m not. I’m fine.)' : v.story.leading()[0] === 'patience' ? 'The evenings are quiet now. People sit for the long notes. I’d forgotten what it was like to be listened to like that.' : 'People ask me for “the old one, the one that doesn’t end”. It’s ridiculous. I’ve never been prouder of anything.')] }),
  },
  {
    id: 'ep-evening', act: 4, title: 'The music evening', region: 'purring-cup',
    spot: { id: 'story-music-evening', label: 'Join the music evening', x: 230, y: 150, radius: 22, glyph: 'hearth' },
    avail: (v) => v.story.done('ep-purring') && !v.story.done('ep-evening'),
    goal: 'Epilogue: join the music evening at The Purring Cup.', hint: 'The stage area in The Purring Cup.',
    page: () => ({
      say: [
        narr('The Purring Cup is full. Latte has put out every cup she owns. Mocha has, for the first time in recorded history, left the window seat to sit nearer the stage.'),
        crumpet('I volunteered to open the evening! I didn’t know the thing involved was a speech. Does it? Oh no. Does it?'),
        crumpet('…I’ll just, um. Hum. Underneath. If that’s alright. In the background. Where I can’t ruin it.'),
        biscuit('The harmony line is the thing that holds the song up, Crumpet. Not the tune. If you stopped, we’d all fall down.'),
        narr('Crumpet goes very still, and then very pink. It is the first time anyone has told them that the quiet part is the load-bearing part.'),
      ],
      ask: ask('ep-evening.part', [
        opt('lead', 'courage', 'Sing the main tune, plainly, and let the room hear it.', [narr('Your voice is a little shaky and entirely real. The room leans in.')], { phrase: ['crumpet'], bond: { crumpet: 2 }, journal: ['ep-evening'], play: 'community' }, eveningTail()),
        opt('harmony', 'kindness', 'Sing the harmony, so Crumpet isn’t the only one holding up the song.', [narr('You and Crumpet find a third that fits exactly. Neither of you is the star. Both of you are essential.')], { phrase: ['crumpet'], bond: { crumpet: 3 }, journal: ['ep-evening'], play: 'community' }, eveningTail()),
        opt('rhythm', 'playfulness', 'Keep the beat on the nearest cup and let the room join in.', [narr('Soon every spoon in the café is tapping. Latte has abandoned all pretence of being annoyed.')], { phrase: ['crumpet'], bond: { crumpet: 2 }, journal: ['ep-evening'], play: 'community' }, eveningTail()),
        opt('listen', 'patience', 'Listen, and come in only when the song needs you.', [narr('You come in on the last verse, one soft note, and the whole room hears how much it needed it.')], { phrase: ['crumpet'], bond: { crumpet: 2 }, journal: ['ep-evening'], play: 'community' }, eveningTail()),
        opt('ask', 'curiosity', 'Ask each cat in the café which part of the song they would like to hear.', [narr('Forty requests, and about nine good ideas. Biscuit writes them all down, solemnly, on the back of a menu.')], { phrase: ['crumpet'], bond: { crumpet: 2 }, journal: ['ep-evening'], play: 'community' }, eveningTail()),
      ]),
    }),
    after: () => ({ say: [narr('The music evening is on, whenever you like. Nobody is counting. The cake is, as always, entirely optional.')] }),
  },
  {
    id: 'ep-velvet', act: 4, title: 'Mr. Velvet, out and about', region: 'city-park', npc: 'velvet',
    avail: (v) => v.story.epilogue() && !v.story.done('ep-velvet'),
    goal: 'Epilogue: Mr. Velvet has taken to sitting in Grand City Park.', hint: 'On the park bench near the pond, any time of day.',
    page: (v) => ({
      say: [
        velvet('Do not look so surprised. I am permitted to visit a park. I am merely out of practice at it.'),
        velvet('The pigeons here are poorly organised. I find it restful.'),
        velvet(v.story.bond('velvet') >= 7 ? 'I put the key in a drawer. Not a locked one. I wanted you to know that, and I wish it to remain between us, and I wish you to tell everyone.' : 'The key is in a drawer. I do not wear it any more. It was heavier than I had noticed.'),
      ],
    }),
    done: { journal: ['ep-velvet'] },
    after: (v) => ({ say: [velvet(velvetDry(v.story.leading()[0]))] }),
  },
];

// ---- tails ---------------------------------------------------------------------------------------------------------

function quietTail(): Page {
  return { say: [
    narr('Each of you finds something the others would have missed. Lumi spots a faint lullaby-line scratched beside the first mark. Biscuit recognises the old relative’s fingering, worn into a silver chime. Velvet knows the last striker was never lost: it was put away on purpose, in a box in his shop, so no one would be tempted.'),
    velvet('I brought it. I wasn’t sure why, until we got here. I think I wanted it to come home.'),
    narr('Five marks line the walls of the hall — one for each tone — and beside each, small worn places where paws have rested. You may read them in your own time.'),
  ] };
}

function phraseTail(kind: 'everyone' | 'original' | 'ask' | 'play' | 'silence'): Page {
  const l: Record<typeof kind, string> = {
    everyone: 'It’s five voices, and the old trail’s five phrases, and a little more. Not one way. All of them.',
    original: 'The song is whole — as whole as it ever was. Biscuit nods slowly; it’s the nod of someone who has finally been allowed to stop apologising.',
    ask: 'Each of them has said what they most want remembered. The song takes all three, and a fourth thing nobody said, which was “we’d like to be here together”.',
    play: 'It wobbles. It trips. It lands. “I would not have called that a ‘phrase’,” says Velvet. “But I would play it again.”',
    silence: 'The silence is where the song breathes. When the others come back in, it isn’t a repair. It’s a return.',
  };
  return { say: [narr(l[kind]), narr('The sixth chime of the Hearthsong, at last, has a voice. It is not the same as anyone expected. It is, nonetheless, the one that was missing.')] };
}

function letgoTail(): Page {
  return { say: [
    narr('The group decides: the temple stays open. Its chimes will be looked after by whoever wants to — not one keeper, not an order, but a handful of cats and a notice on the gate.'),
    velvet('I will take the first evening. If anyone wishes to complain, I shall be here, under the tiles, in a state of dignified discomfort.'),
    biscuit('I’ll bring tea. Terrible tea. In memory of the relative.'),
    lumi('And I’ll draw it all. Every chime. For the journal. So the next ones can remember, and nobody has to remember on their own.'),
    narr('The Old Trail is open. The town — Whiskerwood, Whiskerwick, the harbour, the garden and the isles — begins, softly, to sing.'),
  ] };
}

function eveningTail(): Page {
  return { say: [
    narr('The community song fills the Purring Cup. Crumpet’s harmony is the thing everyone later remembers.'),
    crumpet('…That was me. The quiet bit. I did the quiet bit. Did you hear that?'),
    biscuit('Everyone heard it. That was the point.'),
  ] };
}

// ---- finale variants (shape follows how you listened; never a score) ---------------------------------------------------

export function finaleLines(lead: readonly string[]): ReturnType<typeof narr>[] {
  const set: Record<string, string> = {
    kindness: 'It sounds like many voices. Neighbours you’ve helped, one by one, step into the temple doorway without quite knowing why — and, finding the song is for them, step further in. The hall fills, softly, with a great many small harmonies.',
    curiosity: 'It sounds like more than it should. A subtle extra phrase hides inside the third chime, and the walls — all five marks — light up in turn to show the history behind each. Lumi’s notebook falls open to a page you didn’t know she had.',
    courage: 'It sounds like a statement. The lead is clear and direct. Velvet says out loud what he’s never said; Biscuit confesses the promise he never kept. Nobody cries more than is strictly necessary, and everyone is entirely honest.',
    patience: 'It sounds like a long breath out. The arrangement is slower than anyone expected, the pauses long and wide, and for a long time afterwards nobody speaks, and nobody minds.',
    playfulness: 'It sounds like a friendly mistake that turned out to be the best part. The rhythm skips. Someone starts to dance. Lumi falls over a drum she didn’t know was there. The song laughs, and the temple laughs with it.',
  };
  const mixed = 'It sounds like all of you at once: some warm, some bold, some quiet, some silly. It is not one thing. That is exactly how it should sound.';
  const first = lead.length === 1 ? set[lead[0]] : lead.length === 2 ? `${set[lead[0]]} ${set[lead[1]]}` : mixed;
  return [narr(first ?? mixed)];
}

export function montage(cameos: readonly string[]): string {
  const bits: Record<string, string> = {
    marlow: 'Captain Marlow rings the fog bell from the end of the pier',
    kelp: 'Kelp hums along over a half-mended net',
    pemberton: 'Mr. Pemberton taps a parcel label in time',
    dewey: 'Dewey, in the Old Library, says a very quiet “shh” that sounds almost like a note',
    wren: 'Wren’s chime joins in from Old Town',
    sky: 'Sky’s slate chimes answer from the roofs',
    tide: 'Tide shines the lighthouse in time',
    thistle: 'Thistle’s tiny chime sings in the ferns',
    starling: 'the bridge hums back at Starling',
    snowdrop: 'Snowdrop, on the high ridge, hears it first',
    moss: 'Moss sleeps through it, smiling',
    pepper: 'Pepper hops in rhythm',
    fern: 'Fern’s blue flowers lean towards the sound',
  };
  const heard = cameos.filter((c) => bits[c]).map((c) => bits[c]);
  if (!heard.length) return 'Down in the town, a few windows light up; the song goes out to whoever is listening, which is enough.';
  const first = heard.slice(0, 4);
  return `Far below, the town answers: ${first.join('; ')}. ${heard.length > 4 ? `And ${heard.length - 4} more, whom you can hear but not see.` : 'It is not a performance. It is a conversation.'}`;
}

export function epilogueTown(chime: string | null, cameos: readonly string[]): string {
  const c = chime === 'careful' ? 'The Old Town chime, mended so carefully, rings like a small moon.' : chime === 'craft' ? 'The ribbon-bound chime in Old Town sounds like a page turning.' : chime === 'improv' ? 'The bottle-cap chime in Old Town is, as predicted, the loudest thing in the district.' : chime === 'wait' ? 'The cracked chime in Old Town has a hairline in its voice, and nobody wants it mended.' : 'The chimes of the town are singing.';
  return `${c} The trail is open and has visitors. ${cameos.includes('thistle') || cameos.includes('fern') ? 'Small chimes ring in the ferns.' : ''} The temple has a notice on its gate: “Please take a turn.”`.replace('  ', ' ');
}

export function velvetDry(tone: string | undefined): string {
  switch (tone) {
    case 'kindness': return 'I have been told the town is “a bit friendlier lately”. I consider this a baseless rumour and I should like it to continue.';
    case 'curiosity': return 'Someone asked me a question today and I answered it without suspecting a motive. I am not sure what to make of that.';
    case 'courage': return 'I have been told I now say what I mean. It is exhausting. I do not recommend it. I shall continue.';
    case 'patience': return 'I am told the gate is “always open now”. I should like it noted that I am the one who said “always”.';
    case 'playfulness': return 'Someone has painted a smile on a pebble and put it on the temple step. I have decided not to remove it. This is not a precedent.';
    default: return 'The pigeons are as poorly organised as ever. I find it restful.';
  }
}
