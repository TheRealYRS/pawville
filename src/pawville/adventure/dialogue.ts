/**
 * NPC dialogue (Milestone 6). Lines are chosen from the CURRENT world state, so NPCs react to
 * restored places, finished quests and discoveries, and never repeat something stale. Short and
 * charming by design; the quest event for talking fires when the conversation closes.
 */
import type { AdvView } from './state.ts';
import type { StoryFx, Tone } from '../story/model.ts';

/** Milestone 7: an optional reply the player can pick after the last line. */
/** Story choices carry what they change, so the dialogue sheet can apply it (and share it between two partners). */
export interface StoryChoiceMeta {
  scene: string;
  /** The question's id (unique per scene) and this option's id. */
  ask: string;
  opt: string;
  tone: Tone;
  fx?: StoryFx;
  /** Answers are only revealed to a partner once both of you have answered. */
  secret?: boolean;
  /** This answer ends the scene's questions (the rest is only reading): the scene is completed when it is given. */
  finish?: boolean;
}
/** One page of a conversation: lines (with who says each), and optionally a question. */
export interface DialoguePage { lines: string[]; who?: string[]; choices?: DialogueChoice[]; /** A button on the last line that plays a music cue. */ listen?: { label: string; cue: string } }

export interface DialogueChoice {
  label: string;
  tone: 'friendly' | 'curious' | 'playful' | 'comforting' | 'skeptical' | 'mysterious' | Tone;
  /** What the NPC says back. */
  reply: string[];
  /** Who says each reply line (story scenes have several speakers). */
  replyWho?: string[];
  /** Story scenes: what happens next after the reply (another page, maybe another question). */
  then?: DialoguePage;
  story?: StoryChoiceMeta;
  /** Remember this answer (choices[key] = value) — later dialogue can refer to it. */
  remember?: { key: string; value: string };
  /** Friendship change (+1 for a kind/curious answer; nothing is ever lost for honesty). */
  friend?: number;
  /** Optional discovery unlocked by asking (journal entry id). */
  journal?: string;
}

export interface Dialogue {
  name: string;
  lines: string[];
  /** Story scenes: who says each line (a key of story/cast.ts). */
  who?: string[];
  choices?: DialogueChoice[];
  /** Mark the NPC as met (so introductions are never repeated). */
  meet?: string;
}

const NAMES: Record<string, string> = {
  mabel: 'Mabel', marlow: 'Captain Marlow', finn: 'Finn', coral: 'Coral', pip: 'Pip', juniper: 'Juniper', bramble: 'Bramble', lumi: 'Lumi',
  clementine: 'Clementine', biscuit: 'Biscuit', rosie: 'Rosie', pemberton: 'Mr. Pemberton', ozzie: 'Ozzie',
  tulip: 'Nana Tulip', bloom: 'Professor Bloom', velvet: 'Mr. Velvet', wren: 'Wren', sky: 'Sky', hazel: 'Hazel', nutmeg: 'Nutmeg',
};

export interface WorldContext { phase: string; rain: boolean }

/** Milestone 7: the Whiskerwick residents — branching, remembered, aware of the wider world. */
export function cityDialogue(npc: string, v: AdvView, w: WorldContext): Dialogue | null {
  const name = npcName(npc);
  const met = v.has(`met:${npc}`);
  const f = v.friend(npc);
  const d = (lines: string[], choices?: DialogueChoice[]): Dialogue => ({ name, lines, choices, meet: met ? undefined : npc });
  const greet = w.phase === 'morning' ? 'Morning' : w.phase === 'night' || w.phase === 'evening' ? 'Evening' : 'Afternoon';
  switch (npc) {
    case 'clementine': {
      if (!met) return d(['Welcome to Whiskerwick! I’m Clementine, station master. Trains to Pawville run whenever you like — no timetable, no fuss.', 'First time in the city? The plaza is straight ahead, shops to the north, the arcade to the east and the boardwalk down south.'], [
        { label: 'It’s beautiful here!', tone: 'friendly', reply: ['Isn’t it? Here — a little welcome gift. Spend it on something nice.'], friend: 1, remember: { key: 'clementine:first', value: 'friendly' } },
        { label: 'Is there anything secret in the city?', tone: 'curious', reply: ['Ha! Look up, little one. Rooftops, old alleys… and the boardwalk telescope sees further than you’d think.'], friend: 1, remember: { key: 'clementine:first', value: 'curious' } },
        { label: 'Trains without timetables? Sounds suspicious.', tone: 'skeptical', reply: ['*laughs* Fair. The trains just like you. Don’t tell the board of directors.'], remember: { key: 'clementine:first', value: 'skeptical' } },
      ]);
      if (v.has('harbor-restored') && !v.choice('clementine:marlow')) return d([`${greet}! I heard the Pawport lighthouse is shining again. Was that… you?`, 'I worked the Pawport ferry for years, you know. With Captain Marlow.'], [
        { label: 'Tell me about Marlow.', tone: 'curious', reply: ['He taught me to read the stars before he taught me to read a timetable. Gruff as a barnacle, kind as a kitten. Give him my best.'], friend: 1, remember: { key: 'clementine:marlow', value: 'asked' }, journal: 'marlow-city' },
        { label: 'He misses having company, I think.', tone: 'comforting', reply: ['…Then I’ll take the train out to Pawport on my day off. Thank you for saying so.'], friend: 2, remember: { key: 'clementine:marlow', value: 'visit' }, journal: 'marlow-city' },
      ]);
      if (v.choice('clementine:marlow') === 'visit') return d(['I visited Marlow! We sat on the pier and argued about knots for an hour. Best day off in years.']);
      return d([f >= 3 ? `${greet}, friend! The 4:15 is running late — because I let it nap.` : `${greet}! All aboard whenever you’re ready.`]);
    }
    case 'biscuit': {
      if (v.done('biscuits-song')) return d([w.rain ? 'Rain on the awning makes the best drum. Want to hear the song again?' : 'The whole song, start to finish! People stop and sway now. I owe you a hundred encores.']);
      if (v.onStep('biscuits-song', 2)) return d(['You learned it?! Hum it for me… yes… YES. That’s the ending! Da-da-dum, mrrrow!', 'Listen — this one is for you.']);
      if (v.quest('biscuits-song')?.status === 'active') return d(['Ozzie at the arcade knows the old melody machine. It was built from my songbook, you know.']);
      return d([met ? `Back for another tune? ${w.rain ? 'I’ve moved under the café awning — strings hate rain.' : ''}` : 'Oh! A listener! I’m Biscuit. I play by the fountain when it’s sunny and under the café awning when it isn’t.', 'I wrote a song once… and lost the ending. The old Meow Melody cabinet at the arcade plays it, but I never get past round five.'], [
        { label: 'I’ll learn it for you!', tone: 'friendly', reply: ['Really? Ask Ozzie at the arcade — he knows that machine inside out.'], friend: 1 },
        { label: 'Maybe the song doesn’t need an ending.', tone: 'mysterious', reply: ['…Hm. Songs without endings are just long goodbyes. I’d still like to finish it. If you change your mind, the arcade’s on Arcade Row.'], remember: { key: 'biscuit:ending', value: 'mysterious' } },
      ]);
    }
    case 'rosie': {
      if (!met) return d(['Hello, sweet pea! Rosie, from Crumbs & Whiskers. The cookies are fresh and the milk is warm.'], [
        { label: 'What’s your favourite thing to bake?', tone: 'curious', reply: ['Paw cookies. The trick is a pinch of love and an extra pinch of sugar.'], friend: 1 },
        { label: 'I could smell your bakery from the station!', tone: 'playful', reply: ['*giggles* That’s the plan! Nobody walks past a warm cookie.'], friend: 1 },
      ]);
      if (w.phase === 'night' || w.phase === 'evening') return d(['Bakery’s closed — this is my tea time. Biscuit usually plays over there. Sit with me a while?']);
      return d([f >= 3 ? 'My favourite customer! I saved you the crispiest cookie.' : 'Back for more? The onigiri are popular with the fishing crowd.', v.has('biscuit-song') ? 'Did you hear Biscuit finished his song? I cried into the dough.' : 'Poor Biscuit has been humming the same half-song all week.']);
    }
    case 'pemberton': return d([met ? 'Fish? Shells? Mushrooms that glow? I buy it all. Fair prices, written on the board.' : 'Pemberton, Corner Market. I buy what you find and sell what you need. Simple as that.', v.has('region:highlands') ? 'Frost crystals from Frostbell fetch a nice price, by the way.' : 'If you ever get up to Frostbell, bring me a frost crystal.']);
    // ---- Milestone 8 residents ----
    case 'tulip': {
      if (v.onStep('lost-scarf', 1)) return d(['My scarf! Oh, you lovely thing. It still smells of peppermint.', 'Here — take a bunch of herbs from my garden too.']);
      if (v.done('lost-scarf')) return d([w.rain ? 'Rain’s good for the garden. Come sit on the step with me.' : 'The community garden is doing beautifully. Pick some herbs any time — they grow back.']);
      if (v.quest('lost-scarf')?.status === 'active') return d(['I walked home past the gazebo on that windy day. Perhaps it blew onto the railing?']);
      return d([met ? 'Hello again, dear.' : 'Oh, a new face! I’m Tulip. Everyone calls me Nana.', 'I’ve lost my favourite blue scarf — you might have seen the notice in the plaza. I’d be so grateful if you kept an eye out.'], [
        { label: 'I’ll find it for you.', tone: 'comforting', reply: ['Bless your whiskers.'], friend: 1 },
        { label: 'What does it look like?', tone: 'curious', reply: ['Blue as a summer pond, and it smells of peppermint. I knitted it forty years ago.'], friend: 1 },
      ]);
    }
    case 'bloom': return d([met ? (w.rain ? 'Ducks love the rain. I do not.' : 'Seventeen ducks yesterday. Three today. The others are on holiday.') : 'Professor Bloom, botanist. The conservatory is mine — I grow moonflowers from the Dreaming Isles.',
      v.has('region:isles') ? 'You’ve BEEN up there? Then you know why I can’t stop growing them.' : 'The seeds came from very high up. Higher than birds go.'], met ? undefined : [
      { label: 'How did you get seeds from the sky?', tone: 'mysterious', reply: ['A star-creature dropped them in my hat. I’m not joking. Well, a little.'], friend: 1, journal: 'conservatory' },
      { label: 'Can I see inside?', tone: 'curious', reply: ['Peek through the glass — it’s too warm and wet for paws in there.'] },
    ]);
    case 'velvet': {
      if (v.done('clock-hour')) return d(['Listen… tick, tock. A hundred years of eleven o’clock, and you fixed it. Thank you, truly.']);
      if (v.quest('clock-hour')?.status === 'active') return d(['The ledger in the library, the lamplighter’s rooftops… you’re closer than anyone has been.']);
      return d([met ? 'Back again? Something old is always calling.' : 'Velvet. Tick & Trinket Antiques. I sell old things and keep old secrets.', 'That clock tower has been stuck at eleven for a century. The clockmaker’s ledger is in the Old Library, they say. I’m too old for ladders.'], [
        { label: 'I’ll look into it.', tone: 'curious', reply: ['Splendid. Library Row, the columned building. Mind the dust.'], friend: 1 },
        { label: 'Maybe the clock likes eleven.', tone: 'playful', reply: ['*chuckles* Eleven is a fine hour. But twelve has better gossip. Do look into it, if you change your mind.'] },
      ]);
    }
    case 'wren': {
      const n = v.inv('old-stamp');
      return d([met ? 'Shh — library voice, even in the shop.' : 'Wren. I run the bookshop, and I help at the Old Library on Sundays.', n ? `You’ve found ${n} old Whiskerwick stamp${n === 1 ? '' : 's'}! There are five. One is in a library book, I’d bet my glasses on it.` : 'There are five old city stamps hidden around Whiskerwick. Collectors have searched for years.']);
    }
    case 'sky': {
      if (v.onStep('clock-hour', 1)) return d(['The lamplighter? She lived up here! I’ve seen something brass glint in the gutter of the secret roof — east, across the plank bridge.', 'Careful on the planks.']);
      return d([w.phase === 'night' ? 'Shh. Look up. Every star has a name — some of them I made up.' : met ? 'The light on the clock tower is perfect right now. Hold still, I’m sketching you.' : 'Hi! I’m Sky. I draw the skyline by day and the stars by night.',
        v.has('constellation-lumi') ? 'Did you see the new constellation? Five stars and a tail. I named it Tail.' : 'Some nights, the stars over the sea look like they’re missing a few.']);
    }
    case 'hazel': return d([met ? 'Back for another piece? Everything goes straight to your home storage.' : 'Welcome to Hearth & Whisker! I’m Hazel. Six styles: cozy rustic, cottage garden, soft pastel, warm wooden, elegant classic and playful.',
      'Buy a piece at the counter, then place it from Decorate at home. Move it as much as you like — it’s always yours, even in storage.']);
    case 'ozzie': {
      if (v.onStep('biscuits-song', 0)) return d(['Biscuit’s song? Oh, the Meow Melody cabinet! I built it from his old songbook years ago.', 'Clear round five and it plays the whole tune. One second chance per game — the machine is kinder than it looks.']);
      if (!met) return d(['Welcome to the Whiskerwick Arcade! I’m Ozzie. PawType, Paw vs Paw, Whack-a-Cat, Paw Pairs, Cat Boxing and my pride and joy, Meow Melody.', 'The claw machine takes one paw token. No tricks — line the claw up over a plush and drop it.'], [
        { label: 'Is the claw machine really fair?', tone: 'skeptical', reply: ['Totally! Dead centre always wins. Near the edge it might wobble — you’ll see it wobble. No secret odds.'], friend: 1 },
        { label: 'Where do I get tokens?', tone: 'curious', reply: ['Mr. Pemberton buys fish and finds at the Corner Market, and you earn a few playing here. Clementine likes to give newcomers a little welcome gift too.'] },
      ]);
      return d([v.has('constellation-lumi') ? 'Someone put a new constellation in the sky. I made a cabinet light for it — see the five stars up top?' : 'The machines are warm. Pick your favourite!']);
    }
    case 'nutmeg': {
      const mood = w.rain ? 'Rain makes the carousel horses shine. Nobody minds getting a little damp on a ride.' : w.phase === 'night' || w.phase === 'evening' ? 'Evenings are the best — every bulb on the wheel is lit, and the whole park glows.' : 'Sunny day! The wheel is turning, the carousel is humming and the queue is… nobody. Perfect.';
      if (!met) return d(['Tickets, please! …Oh, I never actually check them. Everything at the Whiskerwick Funfair is free — I just like saying it.', 'I’m Nutmeg. Ferris wheel to the west, the Moonbeam Carousel to the east, Bumper Paws and the Cloud Swing Ride down here, and Ring Toss up north.'], [
        { label: 'Which ride is your favourite?', tone: 'friendly', reply: ['The Ferris wheel, at night. One slow turn and the whole park is lit up below you. Bring someone you like.'], friend: 1, remember: { key: 'nutmeg:first', value: 'favourite' } },
        { label: 'Any tips for the rides?', tone: 'curious', reply: ['Just walk up and press E — your seat comes round to you, no timing needed. The Cloud Swing Ride only loads while it’s slow, so if it’s spinning, wait a moment. Esc gets you off at the next stop.'], friend: 1, remember: { key: 'nutmeg:first', value: 'tips' } },
        { label: 'Free? What’s the catch?', tone: 'skeptical', reply: ['*grins* The catch is you’ll want to go twice. Bumper Paws and Ring Toss pay out a few paw tokens if you’re good — that’s all.'], remember: { key: 'nutmeg:first', value: 'skeptical' } },
      ]);
      if (v.choice('nutmeg:first') === 'tips' && f < 2) return d(['Learning the rides? Ring Toss: aim with the mouse, hold to charge, let go. The far pegs are worth more — and the golden one slides, so lead it a little.']);
      return d([f >= 3 ? 'Friend of the funfair! Your cat’s bumper-car driving is the talk of the park.' : met ? 'Back again! Tickets, please… *waves you through*' : 'Welcome!', mood, 'In Bumper Paws, the harder you hit, the more you score — and bots go after you as much as you go after them.']);
    }
  }
  return null;
}

export function npcName(id: string): string {
  return NAMES[id] ?? id;
}

export function dialogueFor(npc: string, v: AdvView, region: string): Dialogue {
  const name = npcName(npc);
  const say = (...lines: string[]): Dialogue => ({ name, lines });
  switch (npc) {
    case 'mabel': {
      if (v.onStep('missing-kitten', 1)) return say('Pip! Oh, you found her! Look at those muddy paws…', 'Thank you, dear. I’ll put the milk on.');
      if (v.quest('lost-star')?.status === 'active' && v.has('region:forest') && !v.quest('missing-kitten')) return say('Have you been in the south woods? Then perhaps you can help…', 'My grand-kitten Pip went after that light, and she hasn’t come home. Could you look for her?');
      if (v.done('lighthouse-mystery') && !v.quest('lost-star')) return say('Did you see it last night? A light fell into the south woods.', 'The same thing happened years ago, the night the stars went quiet. Nobody ever found out why.', 'The old bramble gate at the end of the main road… that’s the way the light went.');
      if (v.onStep('lost-star', 0)) return say('The light fell past the bramble gate, south of the park. Go and see — but be careful.');
      if (!v.quest('lost-chart')) return say('Hello, dear! I’m Mabel. I’ve lived in Whiskerwood longer than the fountain.', 'Have you noticed the old sailor on the sand by the pier? He sits there every evening, looking across the bay.', 'Ever since the storm, he’s seemed so lost. Would you see if he needs a paw?');
      if (v.quest('lost-chart')?.status === 'active') return say('Captain Marlow used to run the harbor across the bay. If anyone can get it going again, it’s him — with your help.');
      if (v.quest('lighthouse-mystery')?.status === 'active') return say('Boats again! I can hear the gulls from here. Is the lighthouse lit yet?');
      if (v.has('constellation-lumi')) return say('Look up tonight, dear — there’s a new constellation over the village. It looks like a little creature with a starry tail.');
      return say('Lovely weather for a walk. Pip says hello — she’s practising her pounce.');
    }
    case 'marlow': {
      if (region === 'harbor') {
        if (v.onStep('lighthouse-mystery', 4) || (v.has('lighthouse-lit') && !v.done('lighthouse-mystery'))) return say('Look at that light! Pawport is awake again — I can hardly believe it.', 'Finn’s opening his stall, Coral’s dusting her shelves… and this is for you, matey: a proper captain’s hat.');
        if (v.quest('lighthouse-mystery')?.status === 'active') return say('Welcome to Pawport! Well… what’s left of her.', 'The lighthouse has been dark since the storm. The keeper left a note somewhere inside — the lens can be set if you know the trick.');
        if (v.has('harbor-restored')) return say('Fair winds! The bay’s calm today. Try fishing off the long dock — the herring are biting.', v.has('beach-clean') ? 'And the beach! Spotless. The crabs are throwing a party.' : 'The south beach could use a tidy, if you’ve a spare paw.');
        return say('Ahoy!');
      }
      if (!v.quest('lost-chart') || v.onStep('lost-chart', 0)) return say('Hm? Oh, hello, little one. Captain Marlow, harbor master of Pawport — across the bay there.', 'The storm took the end of this pier and tore my navigation chart to pieces. A gull ran off with the scraps.', 'Without that chart I can’t sail, and without the pier I can’t even board. If you find the pieces, I’d be grateful.');
      if (v.onStep('lost-chart', 1)) return say('Three pieces, I think. That gull loved apples, reeds and… stargazing, oddly enough.');
      if (v.onStep('lost-chart', 2)) return say('You found them! All three!', 'There — mended. Now, the pier: I need three good pieces of driftwood from the shore, and my toolbox from the shed by the harbor building.');
      if (v.onStep('lost-chart', 3)) return say('Driftwood washes up all along the beach on the east side of town.');
      if (v.onStep('lost-chart', 4)) return say('The toolbox is with the crates by the harbor building’s door. Heavy thing.');
      if (v.onStep('lost-chart', 5)) return say('Off to the end of the pier with you! Mind the gap.');
      return say('The boat’s waiting at the end of the pier whenever you are.');
    }
    case 'finn': return say(v.has('harbor-restored') ? 'Fresh fish! Well — fresh-ish. Catch your own off the dock, it’s more fun.' : 'Closed till the light’s back, sorry.', 'Lanternfish only come up at night. Herring, any time.');
    case 'coral': return say('Welcome to Coral’s Curiosities! Shells, sea glass, postcards…', 'If you ever find shells on the sandbar, bring me stories, not shells. Keep the shells!');
    case 'pip': return say('Mew! …mew?', 'Pip peeks out of the log, sees you, and tumbles out happily. She’ll follow you home now.');
    case 'juniper': {
      if (region === 'highlands') {
        if (!v.quest('cable-car')) return say('We made it! Frostbell, after all these years.', 'There’s an old cable car down to the village — but its gears were lost in the ice cave, north of the lake. Want to help me get it running?');
        if (v.onStep('cable-car', 0)) return say('Two brass gears, somewhere in the ice cave. Watch your paws — it’s slippery!');
        if (v.onStep('cable-car', 1)) return say('Got them? The station is the red-roofed hut at the top of the sled hill.');
        return say('The aurora’s been wild lately. Aurora Point, after dark — trust me.');
      }
      if (!v.quest('vanishing-trail') && v.done('lighthouse-mystery')) return say('Oh! Hello. Juniper, explorer. Mostly of snow.', 'There used to be a trail up to Frostbell Highlands from here, but it vanished under a drift years ago.', 'I heard a bottle washed up on Pawport’s south beach with an old map inside. If you find it…');
      if (v.onStep('vanishing-trail', 0)) return say('The map in the bottle — Pawport’s south beach, I’m sure of it.');
      if (v.onStep('vanishing-trail', 1)) return say('That’s it! That’s the old trail! Look — it goes around the drift, not through it.', 'Give me a moment… there. The way up is open. Race you to the top!');
      return say('I like it here. Quiet. Except for the waterfall. And the birds. And that fox.');
    }
    case 'bramble': {
      if (v.done('stray-friend')) return say('Bramble purrs and bumps your head.');
      if (v.quest('stray-friend')?.status === 'active') return say('Bramble sniffs your paws hopefully…', 'Maybe a fish would help?');
      return say('A grey stray watches you from the ferns. When you step closer, it shrinks back.', 'It looks hungry. Maybe it likes fish?');
    }
    case 'lumi': {
      if (region === 'isles') return say('Lumi spins happily around you, leaving little sparkles.', 'Home! And you know the way now — come back whenever the stars are out.');
      return say('A tiny star-creature, curled up and glowing faintly. It opens its eyes…', '“I fell. I can’t find the way back up. The lighthouse could show my pattern to the sky… if someone lit it for me.”', 'Lumi shows you its pattern — five stars: one on top, two wings, two feet. (It’s in your journal.)');
    }
  }
  return say('…');
}
