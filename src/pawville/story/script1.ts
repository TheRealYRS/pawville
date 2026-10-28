/**
 * Act I — The Song with a Missing Step.
 * Introduce the mystery, Lumi and Biscuit; teach the choice system; give the player a reason to explore.
 * Scenes are DATA (see kit.ts). Canon preserved: Lumi is the star-creature from The Lost Star, Biscuit busks in
 * Whiskerwick, "Mr. Velvet" keeps Tick & Trinket in Old Town (and its hidden courtyard with the two-paw bench).
 */
import { ask, biscuit, lumi, narr, opt, velvet, type Page, type Scene } from './kit.ts';

export const ACT1: Scene[] = [
  // ------------------------------------------------------------------------------------------------ scene 1
  {
    id: 'a1-chime', act: 1, title: 'A chime where there should be none', region: 'town',
    spot: { id: 'story-chime', label: 'Listen to the old street chime', x: 440, y: 452, glyph: 'chime' },
    lumi: { x: 424, y: 470 },
    avail: (v) => v.story.unlocked && !v.story.done('a1-chime'),
    goal: 'Listen for a small, odd note near the middle of Whiskerwood Village.',
    hint: 'An old chime hangs a few steps east of the town centre, just off the main path.',
    page: () => ({
      say: [
        narr('An ordinary evening. Under the noise of the town — footsteps, a far-off cart, someone’s kettle — you catch one thin, silver note.'),
        narr('It comes from an old street chime, hanging still from its bracket. There is no wind. It rings again anyway.'),
        narr('Someone hurries over, clutching a notebook and an unnecessarily large magnifying glass.'),
        lumi('Good. You heard it too. I was beginning to worry I’d started hearing melodies in the plumbing.'),
        lumi('That note is one phrase of an old lullaby. I know the tune — I’ve hummed it for as long as I can remember — but not the last line. And I can’t remember who taught it to me.'),
        lumi('Isn’t that odd? I remember a lullaby but not the lullaby-er.'),
      ],
      listen: { label: 'Hear the chime again', cue: 'chime-phrase' },
      ask: ask('a1-chime.first', [
        opt('where', 'curiosity', 'Where did you first hear it?', [
          lumi('Everywhere and nowhere! Back on the isles, I think, before I fell. But here’s the funny part — I knew this town’s chime the very first day I came. Like a word on the tip of my tongue.'),
        ], { clue: ['clue:lumi-knew'], bond: { lumi: 1 } }, tail()),
        opt('joke', 'playfulness', 'That is a very large magnifying glass.', [
          lumi('It’s the correct size for large mysteries! …It’s mostly an eyebrow exercise, honestly. Thank you for not mentioning the notebook.'),
          narr('Lumi holds the glass up to the chime. Their enormous eye blinks back at you, which settles it: it is a very good magnifying glass.'),
        ], { bond: { lumi: 1 } }, tail()),
        opt('listen', 'patience', 'Let’s listen again. Properly.', [
          narr('You both stand quite still. The chime rings — and again — and a third time.'),
          lumi('Oh. Oh! It isn’t the same note each time. Listen — it leans. Like it’s asking a question and waiting.'),
        ], { clue: ['clue:chime-leans'], bond: { lumi: 1 } }, tail()),
        opt('others', 'kindness', 'Maybe someone nearby knows old songs.', [
          lumi('Someone who keeps songs safe. Yes. Someone kind about a half-remembered one, who wouldn’t laugh at me for humming it wrong in the street.'),
        ], { bond: { lumi: 2 } }, tail()),
      ]),
    }),
    done: { journal: ['chime-first'] },
    after: (v) => (v.story.done('a1-biscuit') ? null : { say: [lumi('Biscuit plays by the fountain in Whiskerwick City — in the day, anyway. When it rains he moves under the café awning. I keep meaning to ask about the tune. I keep not asking.')] }),
  },
  // ------------------------------------------------------------------------------------------------ scene 2
  {
    id: 'a1-biscuit', act: 1, title: 'Biscuit’s unfinished song', region: 'city', npc: 'biscuit',
    lumi: { x: 516, y: 380 },
    avail: (v) => v.story.done('a1-chime') && !v.story.done('a1-biscuit'),
    goal: 'Find Biscuit in Whiskerwick City and ask about the half-remembered tune.',
    hint: 'Take the train from Pawville Station. Biscuit busks by the fountain by day, under the café awning in rain or after dark.',
    page: (v) => ({
      say: [
        narr('Biscuit is humming something low and slow. A little phrase, again and again — and then it stops dead as Lumi leans in to listen.'),
        biscuit('…Don’t stop on my account. I’m not performing. I’m — warming up.'),
        lumi('It’s the chime! That’s the chime’s phrase, the very one! Sorry — sorry — I talked over you. I do that.'),
        biscuit(v.done('biscuits-song')
          ? 'It’s not the song you helped me finish. That one’s done. This is the other one — the one I can’t put down. It came from an older relative, and it doesn’t finish. I’ve tried to make it.'
          : 'It’s a song I inherited from an older relative. It doesn’t finish. I have been trying to make it finish for… quite some time.'),
        biscuit('It also reminds me of a promise I didn’t keep. So. You’ll understand if I’m not in a hurry to talk about it.'),
      ],
      listen: { label: 'Hear Biscuit’s hum', cue: 'lullaby-1' },
      ask: ask('a1-biscuit.approach', [
        opt('quiet', 'patience', 'Listen. You don’t have to explain.', [
          biscuit('…Thank you. Most cats want the whole story at once, like it’s a parcel.'),
          biscuit('My relative used to say the song has to be sung in a room where nobody is in a hurry. I thought it was an excuse. Maybe it’s a rule.'),
        ], { clue: ['clue:biscuit-room'], bond: { biscuit: 2 } }, biscuitTail()),
        opt('pattern', 'curiosity', 'Ask about the pattern in the notes.', [
          biscuit('Hm. You noticed. Five tones. Always five, in the same order — and the order matters more than the notes. It isn’t a tune so much as a… route.'),
        ], { clue: ['clue:five-tones'], bond: { biscuit: 1 } }, biscuitTail()),
        opt('chime', 'courage', 'Tell Biscuit exactly what you heard: the chime rang by itself.', [
          biscuit('By itself. You’re sure. You’re not just being kind. —No. You aren’t, are you; you’ve got that look of someone who says exactly what happened.'),
          biscuit('…It’s been silent for a very long time. That should frighten me more than it does.'),
        ], { clue: ['clue:chime-answers'], bond: { biscuit: 1 } }, biscuitTail()),
        opt('joke', 'playfulness', 'Offer a joke: “Is it a lullaby or a really long hiccup?”', [
          biscuit('…Hah. A hiccup with excellent posture. Don’t tell my relative, who is not here and would have thrown a cushion.'),
          biscuit('Fine. It has a missing step. Like a staircase where you always, always trip on the fourth stair.'),
        ], { clue: ['clue:missing-step'], bond: { biscuit: 1 } }, biscuitTail()),
        opt('keep', 'kindness', 'Tell Biscuit you’ll keep it between us.', [
          biscuit('That’s… a thing people say. You said it like you meant it. Alright.'),
          biscuit('The promise was to finish it for them. I’ve never told anyone that.'),
        ], { clue: ['clue:biscuit-promise'], bond: { biscuit: 2 } }, biscuitTail()),
      ]),
    }),
    done: { journal: ['biscuit-melody'] },
    after: (v) => (v.story.done('a1-end') ? null : { say: [biscuit(v.story.cluesFound() >= 1 ? 'You’re still looking into it, aren’t you. Good. Come back when you’ve something to show me. I’ll be here. Humming, probably.' : 'The song hasn’t changed since you left. But I notice I’ve been humming the first part more loudly. Go and ask around — the town remembers things I’ve forgotten.')] }),
  },
  // ------------------------------------------------------------------------------------------------ scene 3 (hub: lumi's notebook + the three clue spots live in script_clues.ts)
  {
    id: 'a1-clues', act: 1, title: 'The town’s small clues', region: 'city', npc: 'lumi',
    avail: (v) => v.story.done('a1-biscuit') && !v.story.done('a1-clues') && v.story.cluesFound() >= 1,
    goal: 'Look for clues about the Hearthsong: the harbour, the old garden boundary, the library archive.',
    hint: 'Any one of the three is enough to go on. Lumi will help if you get stuck.',
    page: (v) => ({
      say: [
        lumi(`That’s ${v.story.cluesFound()} of the three small places in my notebook. ${v.story.cluesFound() >= 3 ? 'All three!' : 'Plenty to go on.'}`),
        lumi('Fishermen hear tunes in the fog, gardens remember symbols, and old notes remember keepers. Put them together and — oh. Oh, they all say the same word: Hearthsong.'),
        lumi('It’s an instrument. Or it was. And its keepers marked a route from town to a temple on a hill. That’s why the chime leaned: it points. Biscuit’s five tones might be five stops on that route.'),
      ],
    }),
    done: { journal: ['hearthsong-name'], bond: { lumi: 1 } },
  },
  // ------------------------------------------------------------------------------------------------ scene 4
  {
    id: 'a1-chime-repair', act: 1, title: 'The first choice that changes something', region: 'old-town',
    spot: { id: 'story-broken-chime', label: 'Look at the broken chime', x: 232, y: 296, glyph: 'chime' },
    lumi: { x: 216, y: 314 },
    avail: (v) => v.story.done('a1-clues') && !v.story.done('a1-chime-repair'),
    goal: 'Find the broken chime in Old Town’s Lantern Alley.',
    hint: 'Take the archway north of Whiskerwick Station into Old Town, then follow Lantern Alley west to east.',
    page: (v) => ({
      say: [
        narr('Halfway along Lantern Alley, tucked behind an old lamp, a small chime hangs in pieces. Its glass tubes are cracked; its little striker lies in the dust.'),
        lumi('Look at the markings! Five little marks round the top — it’s the same five-part symbol as the stone in the garden. This one is part of the route. And it’s… broken.'),
        lumi(v.story.clue('clue:five-tones') ? 'Five tones, five marks. Biscuit was right.' : 'Five marks. I wonder whether that matters. It probably matters.'),
        narr('The pieces are delicate. Whatever you do, you will have to decide how.'),
      ],
      ask: ask('a1-chime-repair.how', [
        opt('careful', 'patience', 'Mend it carefully, piece by piece, with thread and glue from your bag.', [
          narr('It takes a long time. Lumi holds each glass tube steady and doesn’t say a word — an enormous effort that you both notice.'),
          narr('When you’re done, the chime shines like a thin moon. It rings with a clear, round voice.'),
        ], { chime: 'careful', clue: ['clue:chime-mended'], bond: { lumi: 1 } }, afterChime('careful')),
        opt('craft', 'kindness', 'Ask Wren, who mends the bindings of old books, for help.', [
          narr('Wren arrives with a roll of waxed thread and an expression of deep professional joy. “Never leave a broken thing on a street,” she says, and sits down in the dust to help.'),
          narr('The chime is stitched together with fine thread, ribbon-bound at every joint. It rings softly, like a well-read page turning.'),
        ], { chime: 'craft', cameo: ['wren'], bond: { lumi: 1 } }, afterChime('craft')),
        opt('improv', 'playfulness', 'Improvise: bottle-caps, a spoon, and a loop of bright ribbon.', [
          narr('Lumi is appalled for about four seconds, then delighted. A spoon becomes the striker. The cracked tubes are replaced by caps from a dozen lemonades.'),
          narr('The chime rings — a cheerful, jangling, slightly rude noise. It sounds like a very happy dog being introduced to a xylophone.'),
        ], { chime: 'improv', bond: { lumi: 1 } }, afterChime('improv')),
        opt('wait', 'curiosity', 'Leave it as it is until we understand more.', [
          lumi('You’re right. If we mend it wrong, we might mend the answer shut. Let’s study the marks first.'),
          narr('You trace the five marks with a paw, copying each into Lumi’s notebook. When you tap the striker back into place, the cracked chime rings anyway — thin, with a hairline crack in its voice. It is still the right note.'),
        ], { chime: 'wait', clue: ['clue:chime-marks'], bond: { lumi: 1 } }, afterChime('wait')),
      ]),
    }),
    done: { journal: ['chime-repaired'] },
    after: (v) => ({ say: [lumi(chimeLine(v.story.chime()))] }),
  },
  // ------------------------------------------------------------------------------------------------ scene 5
  {
    id: 'a1-gate', act: 1, title: 'The closed gate', region: 'old-town', npc: 'velvet',
    spot: { id: 'story-gate', label: 'Look at the old trail gate', x: 28, y: 150, glyph: 'gate' },
    lumi: { x: 40, y: 166 },
    avail: (v) => v.story.done('a1-chime-repair') && !v.story.done('a1-gate'),
    goal: 'Follow the faint light to the hidden courtyard — and the gate beyond it.',
    hint: 'Through the narrow gap at the west end of Old Town, behind Lantern Alley: the hidden courtyard.',
    page: (v) => ({
      say: [
        narr('A faint light has appeared beyond the town — Lumi spotted it from the repaired chime. It leads, of all places, to the hidden courtyard in Old Town: the one with the two-paw bench.'),
        narr('In the west wall stands an old wooden gate, bound with iron, and in front of it, with a lantern and an unreadable face, stands Mr. Velvet.'),
        lumi('Mr. Velvet! The chime is answering. It rang by itself and it ring-rang the five marks and I think the trail—'),
        velvet('The trail is not lost. It is closed. Those are different things, and the difference matters.'),
        lumi('But the chime is answering again —'),
        velvet('A melody answering does not mean anyone has understood the question.'),
        narr(v.done('clock-hour') ? 'Behind his glasses, Mr. Velvet looks at the repaired clock tower in the distance, and almost — not quite — softens. “You mended that,” he says. “Do not take it as a precedent.”' : 'He folds his paws. He is not going to move. He is, you realise, extremely tired.'),
      ],
      ask: ask('a1-gate.approach', [
        opt('listen', 'patience', 'Say nothing for a while. Let him speak when he’s ready.', [
          narr('The courtyard is very quiet. The lantern ticks as it cools. Mr. Velvet watches you not-saying-anything, as if testing whether it is a trick.'),
          velvet('…The keepers could not agree on the last phrase of the Hearthsong. That is all. Not a curse, not a tragedy. They disagreed, and the disagreement stayed longer than the song.'),
        ], { clue: ['clue:keepers-disagreed'], bond: { velvet: 2 } }, gateTail()),
        opt('ask', 'curiosity', 'Ask what happened here before the gate was closed.', [
          velvet('A reasonable question, asked with annoying precision.'),
          velvet('The trail was worn by a great many feet. After the final gathering, it was left to the weather. Parts of the path have fallen. A closed gate is also a safe gate.'),
        ], { clue: ['clue:trail-damaged'], bond: { velvet: 1 } }, gateTail()),
        opt('challenge', 'courage', 'Tell him plainly that closing it isn’t protecting anyone.', [
          velvet('You say that rather loudly for someone without a key.'),
          velvet('…But you’re not wrong that the gate has not helped anyone in a long time. I have been defending it for so long that I forgot to check whether it was still doing its job. Do not repeat that.'),
        ], { clue: ['clue:practical-fears'], bond: { velvet: 1 } }, gateTail()),
        opt('help', 'kindness', 'Offer to inspect the gate together, so you aren’t the only one watching it.', [
          velvet('…Together. I do not recall the last time that word was applied to this gate.'),
          narr('He steps back by exactly one pace. It’s a very large step, for him.'),
          velvet('You may look at the hinges. You may not open it.'),
        ], { clue: ['clue:permission'], bond: { velvet: 2 } }, gateTail()),
        opt('joke', 'playfulness', 'Perform a small, dignified musical bow to the gate.', [
          narr('You bow to the gate. Lumi, not to be outdone, bows to the lantern. Mr. Velvet’s whisker twitches. It happens twice before he can stop it.'),
          velvet('Do you know how tiring it is, being the only one expected to remember what happened? Everyone else forgot. I was the one who stayed behind to remember on their behalf.'),
        ], { clue: ['clue:velvet-tired'], bond: { velvet: 1 } }, gateTail()),
      ]),
    }),
    done: { journal: ['velvet-gate'] },
    after: (v) => (v.story.done('a1-end') ? null : { say: [velvet('The gate remains closed. You may inspect the hinges, however. I will be here. I am always here. It is rather the point of me.')] }),
  },
  // ------------------------------------------------------------------------------------------------ Act I ending
  {
    id: 'a1-end', act: 1, title: 'A path in five notes', region: 'city', npc: 'biscuit',
    lumi: { x: 516, y: 380 },
    avail: (v) => v.story.done('a1-gate') && !v.story.done('a1-end'),
    goal: 'Go back to Biscuit with what you learned at the gate.',
    hint: 'Biscuit is still in Whiskerwick City — fountain by day, café awning when it rains or after dark.',
    page: (v) => ({
      say: [
        biscuit('You went to Velvet’s gate. I can see it all over you — you smell like lantern oil and dust and disapproval.'),
        biscuit('…Alright. Here is the piece I’ve never played for anyone.'),
        narr('Biscuit plays five notes, slowly. Then again. Then, as if forgetting to be guarded, a third time.'),
        lumi('Five notes, five marks, five places! I’ve been comparing them with the chime markings all week. They’re not just a pattern — they’re a map. There’s a wind-swept stair, a harbour lantern, a garden full of chimes, a bridge that answers back and a high place that watches.'),
        lumi('Five places along the old trail. And Mr. Velvet agreed to let us inspect the gate — which isn’t opening it, but it isn’t nothing.'),
        biscuit(`Five notes in a trail, and I’ve been playing them as if they were an exam. ${v.story.bond('biscuit') >= 3 ? 'Maybe I’ve been wrong to play it alone.' : 'I… might be willing to be wrong about that.'}`),
        lumi('Take this. It’s a jar with a little of my glow in it — so I can come along even while I’m stuck at the chime drawing. Please don’t leave it in the rain. Or the dishwasher.'),
        narr('The Story So Far fills with a first entry, written in Lumi’s round handwriting.'),
      ],
      listen: { label: 'Hear the five notes', cue: 'five-notes' },
    }),
    done: { journal: ['five-notes', 'act1-recap'], phrase: ['lullaby'], bond: { biscuit: 1, velvet: 1 } },
    after: () => null,
  },
];

// ---- shared tails -----------------------------------------------------------------------------------

function tail(): Page {
  return { say: [
    lumi('Whoever it is, I think the chime wants us to find them. Biscuit plays by the fountain in Whiskerwick — I’ve heard him humming something with a gap in it. I’ve been far too shy to ask.'),
    lumi('Will you come with me? …I’ll talk a bit less. I’ll try.'),
    narr('Lumi writes “BISCUIT?” in the notebook, underlines it twice, and then adds, smaller, “be brave”.'),
  ] };
}

function biscuitTail(): Page {
  return { say: [
    biscuit('Here. The first few notes, the way it was taught to me. That’s all I’ll play today.'),
    narr('Biscuit plays a short phrase — warm, almost familiar — and stops before the part that goes wrong.'),
    lumi('That’s the lullaby. That’s MY lullaby! Or — a cousin of it. Oh, I’m going to cry on your scarf, I’m so sorry.'),
    biscuit('Please don’t cry on the scarf. But — you can stay. Both of you. If you want.'),
    lumi('I’ll go back to the chime and keep it company — and write everything down. There are three places in my notebook worth a look: the old fog bell at Pawport Harbor, the garden stone in Grand City Park, and the archive in the Old Library. Any one will do. Come and find me by the chime when you’ve a clue.'),
    narr('The Hearthsong, Lumi whispers, a little unsteadily. “Hearth-song.” It sounds like a word she’s known her whole life and never said.'),
  ] };
}

function afterChime(kind: 'careful' | 'craft' | 'improv' | 'wait'): Page {
  return { say: [
    lumi(chimeLine(kind)),
    narr('For a moment nothing happens. Then, far beyond the rooftops, a faint, steady light blooms in the north-west — as if something that had been asleep for a very long time had turned over and opened one eye.'),
    lumi('That light! I’ve seen it — it’s drawn in the margin of my lullaby. A little dot with lines. I always thought it was a spider. It is not a spider.'),
    narr('The light fades. But the chime keeps ringing for a little longer than it should.'),
  ] };
}

export function chimeLine(kind: 'careful' | 'craft' | 'improv' | 'wait' | null): string {
  switch (kind) {
    case 'careful': return 'Every bit of it is where it should be. It rings like it’s been waiting to be asked — I’m going to pretend that’s because we were patient.';
    case 'craft': return 'It sounds like ribbon and paper and Wren’s steady paws. It sounds like a thing someone cared about enough to ask for help with.';
    case 'improv': return 'It sounds like a parade falling down a staircase, and I adore it. I’m afraid it’s now the loudest chime in Old Town.';
    case 'wait': return 'It rings with that little crack in its voice. I think I like it better, actually. The crack sounds like it’s listening.';
    default: return 'It isn’t mended yet.';
  }
}

function gateTail(): Page {
  return { say: [
    lumi('I— I want to say something clever, but all I’ve got is: thank you, Mr. Velvet.'),
    velvet('Do not thank me. I have done nothing. The gate remains closed.'),
    velvet('…Come back when you have the five phrases of the old trail, and not before. I cannot stop you looking.'),
    narr('He turns a key in his paw and doesn’t use it. Somewhere on the other side of the gate, something very small rings once.'),
  ] };
}

