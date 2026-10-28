/**
 * "The Story So Far": journal entries written as memories, not logs. An entry only exists once it has been unlocked,
 * is stored by id (so reloads and scene replays can never duplicate it) and its words may depend on how you answered.
 */
import { PLACES, PLACE_NAMES, leadingTones, type Companion, type StoryState } from './model.ts';
import { montage } from './script3.ts';
import { arrangeLine } from './script2.ts';

export interface StoryEntry { id: string; act: 1 | 2 | 3 | 4; title: string; text: (s: StoryState) => string }

const p = (s: StoryState, ask: string) => s.picks[ask];
const pick = <T extends string>(s: StoryState, ask: string, table: Partial<Record<T, string>>, fallback: string): string => table[p(s, ask) as T] ?? fallback;

export const STORY_ENTRIES: readonly StoryEntry[] = [
  // ---------------------------------------------------------------- Act I
  { id: 'chime-first', act: 1, title: 'A chime that rang by itself',
    text: (s) => `One evening an old street chime rang with no wind at all, and Lumi turned up with a notebook and a very large magnifying glass. ${pick(s, 'a1-chime.first', { where: 'I asked where Lumi first heard the lullaby; they said the chime felt like a word on the tip of their tongue.', joke: 'I made a joke about the magnifying glass. It was received very well.', listen: 'We listened again, properly, and noticed that the chime leans on its last note like a question.', others: 'I suggested finding someone who knows old songs. Lumi liked that.' }, 'The chime rang again, and neither of us left.')}` },
  { id: 'biscuit-melody', act: 1, title: 'Biscuit’s unfinished song',
    text: (s) => pick(s, 'a1-biscuit.approach', { quiet: 'Biscuit finally let us hear the unfinished melody, a few notes at a time. They tried to pretend it was no big deal, but they stayed to play it twice.', pattern: 'Biscuit admitted the melody is always five tones in the same order, and that the order matters more than the notes.', chime: 'I told Biscuit the chime had rung by itself. They said it had been silent a very long time, and that should have frightened them more than it did.', joke: 'A joke about hiccups got Biscuit to admit the song has a missing step, like a stair you always trip on.', keep: 'I promised to keep it between us, and Biscuit told me the promise they’d never kept: to finish the song for an older relative.' }, 'Biscuit hummed a song that never ends, and stopped just before the part that goes wrong.') },
  { id: 'clue-harbor', act: 1, title: 'A tune in the fog',
    text: (s) => `${pick(s, 'a1c-harbor.how', { wait: 'I rang the old fog bell once and the harbour answered from two directions.', hum: 'Captain Marlow hummed what he heard in the fog; it was Biscuit’s first phrase, made rough by thirty years of sea.', sit: 'I sat with Captain Marlow while he told the whole story, even the part about the gull.', play: 'Tapping the bell in the chime’s rhythm made the harbour bounce back. Marlow laughed so hard he dropped his rope.' }, 'Someone at the harbour once heard five notes in the fog.')} “Hearthsong,” someone said. I wrote it down.` },
  { id: 'clue-garden', act: 1, title: 'A stone with five parts',
    text: (s) => `${pick(s, 'a1c-garden.how', { moss: 'I cleared the moss from a garden stone, strand by strand, and found five tiny notes beneath it.', flower: 'A stubborn blue flower leans towards one part of the stone’s five-part symbol: the one like a wave.', water: 'I watered the blue flower; the water filled the carved symbol like a river and made it glint.', press: 'Pressing the five parts of the stone rang five notes from under the soil. It rang them back in the new order, too.' }, 'A stone at the garden’s edge bears a symbol in five parts.')}` },
  { id: 'clue-archive', act: 1, title: 'A note in the archive',
    text: (s) => `${pick(s, 'a1c-archive.how', { quiet: 'An old slip in the archive drawer said the Hearthsong gathered what places remember.', ask: 'Dewey let me help with the miscellany drawer. The note was in the first handful, as it apparently always is.', sniff: 'The oldest-smelling paper led to a pencilled map: a path with five small marks and a hill with a roof.' }, 'Somewhere in the archive, a note remembers keepers and a route.')} Keepers once marked a route between the town and a hilltop temple.` },
  { id: 'hearthsong-name', act: 1, title: 'The Hearthsong',
    text: () => 'Harbour, garden and archive all said the same word: Hearthsong. An old instrument, an old route, a hilltop temple. Lumi says that is why the chime leans: it points.' },
  { id: 'chime-repaired', act: 1, title: 'The broken chime',
    text: (s) => pick(s, 'a1-chime-repair.how', { careful: 'We mended the broken chime in Lantern Alley piece by piece. It shines like a thin moon and rings with a clear, round voice.', craft: 'Wren helped us bind the broken chime with waxed thread and ribbon. It rings like a page turning.', improv: 'We mended the chime with bottle-caps, a spoon and a ribbon. It is now the loudest and happiest chime in Old Town.', wait: 'We left the cracked chime as it was and copied its five marks. It rings anyway, with a hairline in its voice, and I think I like it better.' }, 'We found a broken chime in Old Town.') + ' When it rang, a faint light appeared beyond town. Lumi says it is in the margin of the lullaby; it is not a spider.' },
  { id: 'velvet-gate', act: 1, title: 'The closed gate',
    text: (s) => pick(s, 'a1-gate.approach', { listen: 'Mr. Velvet told me, when I said nothing for long enough, that the keepers couldn’t agree on the last phrase of the Hearthsong. Not a curse. A disagreement that stayed longer than the song.', ask: 'Mr. Velvet told me the trail was worn by a great many feet, and that parts of it have fallen. “A closed gate is also a safe gate.”', challenge: 'I told Mr. Velvet the closed gate wasn’t protecting anyone. He said I was loud for someone without a key, and that I wasn’t entirely wrong.', help: 'I offered to inspect the gate with Mr. Velvet, and he stepped back by one whole pace. I may look at the hinges. I may not open it.', joke: 'We bowed to the gate and to the lantern. Mr. Velvet’s whisker twitched twice. He said he was tired of being the only one expected to remember.' }, 'Mr. Velvet keeps the old trail gate. “Closed,” he says, “is not the same as lost.”') },
  { id: 'five-notes', act: 1, title: 'A path in five notes',
    text: () => 'Biscuit played all five notes, three times, and forgot to be guarded for the third. Lumi worked it out: five notes, five marks, five places along the old trail — a wind-swept stair, a harbour lantern, a garden of chimes, a bridge that answers and a high place that watches.' },
  { id: 'act1-recap', act: 1, title: 'Where we are',
    text: () => 'Mr. Velvet will let us inspect the gate, though not open it. We have five notes and a jar of Lumi’s glow. Next: find the five places.' },
  // ---------------------------------------------------------------- Act II
  { id: 'place-wind', act: 2, title: PLACE_NAMES.wind,
    text: (s) => pick(s, 'a2-wind.how', { stay: 'I stayed longer than I needed to, and a second, softer layer of sound arrived.', hum: 'I hummed the phrase back out loud. The chimes forgave the wobble at once.', whistle: 'I whistled a reply. The wind copied it and improved it.', steady: 'I steadied a chime with my paws, for whoever comes next.', notice: 'The wind curls from the harbour towards the north-west. Exactly where the light was.' }, 'The slate chimes only ring when you stand still long enough.') },
  { id: 'place-lantern', act: 2, title: PLACE_NAMES.lantern,
    text: (s) => pick(s, 'a2-lantern.pane', { blue: 'I lit the blue pane and asked what it pointed at. A note was scratched into a post.', rose: 'The rose pane warmed the boards and the planks leaned in.', amber: 'I lit the amber pane and walked to where it pointed, without waiting to be sure.', green: 'The green light travelled so slowly I nearly missed it.', violet: 'I swung the violet lantern about to chase the beam. The gulls were scandalised.' }, 'The keepers’ lantern has five panes, one for each tone.') },
  { id: 'place-garden', act: 2, title: PLACE_NAMES.garden,
    text: (s) => pick(s, 'a2-garden.last', { hang: 'I hung the smallest chime where passing cats would hear it first.', untangle: 'I found the smallest chime’s string under a fern. It was not even knotted. It had just gone unnoticed.', why: 'The smallest chime hangs low because it was made for a kitten.', beads: 'I gave the smallest chime a string of mismatched beads. Thistle said only, “…oh.”' }, 'The little chimes of the garden were tangled until someone noticed.') },
  { id: 'place-echo', act: 2, title: PLACE_NAMES.echo,
    text: (s) => pick(s, 'a2-echo.reply', { repeat: 'The bridge and I said the same five notes to each other, in turn. It felt like being understood.', change: 'I changed the pattern and the bridge returned it improved. It had waited a long time for someone to improvise.', pause: 'I left a pause where the last note should be, and the bridge filled it with the note that fit.', sing: 'I played softly so the quieter bridges could hear, and little lights woke in answer, one by one.', ask: 'I asked the bridge a question in notes. The answer fell. It was a yes.' }, 'The bridge answers a moment late, a hair softer.') },
  { id: 'place-rise', act: 2, title: PLACE_NAMES.rise,
    text: (s) => pick(s, 'a2-rise.how', { climb: 'I climbed straight up, trusting my feet, and held my breath the whole way.', mark: 'I marked the safest stones with ribbon for whoever climbs next.', test: 'I tested every stone before trusting it, and did not slip once.', hop: 'I zig-zagged up laughing and arrived slightly sideways and completely delighted.', study: 'The broken marker had five lines carved into it, each pointing to a place we’ve been. A map in stone.' }, 'From the high place I could see a roof, small and patient.') },
  { id: 'temple-seen', act: 2, title: 'A roof on the hill',
    text: () => 'From the Watcher’s Rise I saw a temple, far off, small and silver. Lumi says it is the dot with lines in the lullaby’s margin.' },
  { id: 'biscuit-truth', act: 2, title: 'Biscuit tells the truth',
    text: (s) => pick(s, 'a2-biscuit.reply', { reassure: 'Biscuit told me they were afraid the song doesn’t finish because they aren’t good enough. I told them the song is good, and so are they. They said not to be nice at them; it’s disorienting.', practise: 'I offered to sit through all of Biscuit’s bad bits. They have a lot of bad bits.', relative: 'Biscuit remembered that their relative used to hum to the chimes before sunrise and pretend they hadn’t.', imperfect: 'I said the song may not have one perfect ending. Biscuit said it was a terrible thing to say, and possibly true.' }, 'Biscuit told me the song doesn’t finish, and played me all of what they have.') },
  { id: 'velvet-account', act: 2, title: 'Mr. Velvet’s account',
    text: (s) => pick(s, 'a2-velvet.reply', { disagree: 'Mr. Velvet told me what happened at the final gathering. I disagreed, and told him I understood why he was afraid. He said both could be true.', young: 'Mr. Velvet told me he was a very young kitten at the final gathering, and thought the Hearthsong was the loudest thing in the world. It was the quietest.', wish: 'I asked what he wishes he’d done. He wishes he had sat between them and said nothing until someone spoke.', silence: 'I sat with Mr. Velvet on the two-paw bench, and after a long time he sat too.' }, 'Mr. Velvet told me the fuller story: the keepers stopped listening.') },
  { id: 'arrangement', act: 2, title: 'How the five phrases sound together',
    text: (s) => `Lumi laid the five phrases side by side. ${arrangeNote(s)}` },
  { id: 'gate-opens', act: 2, title: 'The gate opens',
    text: (s) => pick(s, 'a2-gate.between', { both: 'Biscuit’s long second phrase and Lumi’s quick one, side by side, neither arguing.', turns: 'We took turns playing the second phrase, long and quick. By the third round, each had borrowed from the other.', why: 'I asked Biscuit and Lumi why they play the phrase their way. Both were listening so hard they forgot to be right.', together: 'We played both readings at once, loudly and wrongly. It became a duet.', either: 'I said I would love to hear both and I wouldn’t pretend to choose. Nobody argued.' }, 'Mr. Velvet watched us play together without insisting on one correct version.') + ' He opened the gate. It creaks. Biscuit laughed, and called it dust.' },
  // ---------------------------------------------------------------- Act III
  { id: 'temple-quiet', act: 3, title: 'The quiet temple',
    text: (s) => pick(s, 'a3-quiet.look', { marks: 'Five marks line the walls of the temple, one for each tone.', offerings: 'I straightened the little offerings, and the hall seemed to breathe out.', floor: 'The worn paths in the temple floor all meet below the dais, at the heart, from every direction.', ring: 'I tapped a silent chime. It coughed. Biscuit winced. Lumi giggled.', hello: 'I said hello in the middle of the hall. The temple returned the last syllable.' }, 'The temple is weathered, and many different cats have been here.') },
  { id: 'temple-phrase', act: 3, title: 'The missing phrase',
    text: (s) => pick(s, 'a3-phrase.how', { everyone: 'We each offered a phrase. Lumi a lullaby-line, Biscuit four notes of the old relative’s hum, Mr. Velvet one very formal note. It was the oddest chord, and perfect.', original: 'We rebuilt the original notes before adding anything. When it was whole, Biscuit sat back and cried a bit. Nobody mentioned it.', ask: 'We asked each other what we want remembered: that someone listened; that the relative hummed; that the gate was closed out of love and opened out of the same.', play: 'I started tapping. Lumi trilled, Biscuit scolded, Mr. Velvet added a wrong note that turned out to be the right wrong note.', silence: 'We left a silence in the song for what can’t be mended. It was the loudest silence I have ever heard.' }, 'We found the missing phrase together.') },
  { id: 'hearthsong-played', act: 3, title: 'The Hearthsong',
    text: (s) => `We played it together, not loudly and not perfectly, and the town answered. ${montage(s.cameos)} ${finaleNote(s.finale)}` },
  { id: 'temple-open', act: 3, title: 'The temple stays open',
    text: (s) => pick(s, 'a3-letgo.keep', { rota: 'We decided the temple’s chimes will be looked after by a rota: everyone takes a turn.', small: 'We decided to start small: one evening a week, and see who comes.', names: 'We put the keepers’ names on the door, and our own.', party: 'We decided the temple will have parties, and the chimes may sound however they like.', ask: 'We decided to ask the town what it wants the temple to be.' }, 'The temple stays open.') + ' Mr. Velvet apologised for the gate, and for the word “closed”, and took the first evening.' },
  { id: 'act2-recap', act: 2, title: 'Where we are',
    text: () => 'Five phrases collected, Biscuit’s song shared, Mr. Velvet’s account heard. Next: the gate.' },
  // ---------------------------------------------------------------- epilogue
  { id: 'ep-purring', act: 4, title: 'The town keeps singing',
    text: (s) => `Biscuit plays the melody at The Purring Cup now. ${epilogueNote(s)}` },
  { id: 'ep-evening', act: 4, title: 'The music evening',
    text: (s) => pick(s, 'ep-evening.part', { lead: 'I sang the tune plainly and the room leaned in.', harmony: 'Crumpet and I found a third that fit exactly. Neither of us was the star; both of us were essential.', rhythm: 'I kept the beat on a cup and every spoon in the café joined in.', listen: 'I came in on the last verse with one soft note, and the room heard how much it had needed it.', ask: 'I asked the café what they wanted to hear. Forty requests, about nine good ideas.' }, 'We held a music evening at The Purring Cup.') + ' Crumpet sang the quiet part. Everyone remembers it.' },
  { id: 'ep-velvet', act: 4, title: 'Mr. Velvet, out and about',
    text: () => 'Mr. Velvet has taken to sitting in Grand City Park. The key is in a drawer — not a locked one. He wanted me to know, and he wishes it to remain between us, and he wishes me to tell everyone.' },
  { id: 'ep-lumi-drawings', act: 4, title: 'Lumi’s drawings',
    text: () => 'Lumi has started adding sketches to the journal: the chime, the bridge, the little chime in the ferns. “So the next ones can remember,” they said, “and nobody has to remember on their own.”' },
  // ---------------------------------------------------------------- residents’ memories (optional)
  { id: 'mem-sky', act: 2, title: 'Sky on the Wind Steps', text: () => 'Sky once sat on the Wind Steps for an hour and a half, and the chimes sang for twelve seconds. “Best twelve seconds of the year.”' },
  { id: 'mem-tide', act: 2, title: 'Tide on the lantern', text: () => 'Tide says the keepers’ lantern needs someone to say what the light is pointing at. Which is the sort of thing Tide writes down and never understands.' },
  { id: 'mem-thistle', act: 2, title: 'Thistle on the strings', text: () => 'Thistle only comes out when it’s quiet, and the quiet is when the chimes would most like fixing. “Nobody notices a tangle until someone does.”' },
  { id: 'mem-starling', act: 2, title: 'Starling on the bridge', text: () => 'Starling thinks the bridge is laughing, then thinks it’s just generous.' },
  { id: 'mem-snowdrop', act: 2, title: 'Snowdrop on the ridge', text: () => 'Snowdrop says the marker on the high ridge cracked years ago. From there, if you know where to look, you can see a roof.' },
  { id: 'mem-moss', act: 2, title: 'Moss on the quiet bell', text: () => 'The quietest bell in the city rings only if nobody is trying. Moss says that’s their method for most things.' },
  { id: 'mem-pepper', act: 2, title: 'Pepper’s hopscotch', text: () => 'Pepper says five notes and a pause is obviously hopscotch. Pepper is right about most guesses.' },
  { id: 'mem-fern', act: 2, title: 'Fern on the blue flower', text: () => 'Fern says the blue flower only grows where chimes used to hang. Wherever you see it, someone once hung something that rang.' },
];

export function storyEntry(id: string): StoryEntry | undefined {
  return STORY_ENTRIES.find((e) => e.id === id);
}

/** Only unlocked entries, in the order they were found. */
export function unlockedEntries(s: StoryState): StoryEntry[] {
  return s.journal.map(storyEntry).filter((e): e is StoryEntry => !!e);
}

// ---- helpers shared with the scripts (kept here so scripts and journal never drift) ---------------------------------
function arrangeNote(s: StoryState): string {
  return arrangeLine(leadingTones(s));
}
function finaleNote(f: string | null): string {
  switch (f) {
    case 'kindness': return 'It sounded like many voices: neighbours I’d helped, one by one, came in without quite knowing why.';
    case 'curiosity': return 'It hid an extra phrase inside the third chime, and every mark on the walls lit to show its history.';
    case 'courage': return 'It was direct and honest, and Mr. Velvet and Biscuit each said something they’d never said.';
    case 'patience': return 'It was slower than anyone expected, with long rests; afterwards nobody spoke, and nobody minded.';
    case 'playfulness': return 'It skipped and stumbled and laughed, and the temple laughed with it.';
    default: return 'It sounded like all of us at once: warm, bold, quiet and silly.';
  }
}
function epilogueNote(s: StoryState): string {
  const bits: string[] = [];
  if (s.chime === 'improv') bits.push('The bottle-cap chime in Old Town is the loudest thing in the district.');
  if (s.chime === 'careful') bits.push('The carefully mended chime rings like a small moon.');
  if (s.chime === 'craft') bits.push('The ribbon-bound chime sounds like a page turning.');
  if (s.chime === 'wait') bits.push('The cracked chime still has a hairline in its voice, and nobody wants it mended.');
  bits.push('The trail is open, and it has visitors. The temple has a notice on its gate: “Please take a turn.”');
  return bits.join(' ');
}

/** The partner’s recap of how we heard things differently (paired play only). Never says either of us was wrong. */
export function pairedRecap(s: StoryState): { shared: number; different: string[] } {
  const different = Object.keys(s.partner).filter((k) => s.picks[k] && s.picks[k] !== s.partner[k]);
  const shared = Object.keys(s.picks).length - different.length;
  return { shared, different };
}

export const BOND_WORDS = ['we’ve just met', 'warming up', 'warming up', 'friends', 'friends', 'good friends', 'good friends', 'close', 'close', 'dear', 'dear'] as const;
export const bondWord = (n: number): string => BOND_WORDS[Math.max(0, Math.min(10, n))];
export const COMPANION_NAMES: Record<Companion, string> = { lumi: 'Lumi', biscuit: 'Biscuit', velvet: 'Mr. Velvet', crumpet: 'Crumpet' };
export { PLACES };
