import test from 'node:test';
import assert from 'node:assert/strict';
import { buy, sell, spend, grantOnce, earnArcade, setRecord, ARCADE_DAILY_CAP, SHOPS } from '../src/pawville/city/economy.ts';
import { clawDrop, clawPosition, melodyPress, melodyShown, melodyScore, newMelody, melodyTokens, CLAW_PLUSHES } from '../src/pawville/city/arcadeGames.ts';
import { voicePlan, voiceForEmote } from '../src/pawville/city/voices.ts';
import { cityNpcs, buildCity, buildArcadeHall, ARCADE_MACHINES } from '../src/pawville/city/cityRegion.ts';
import { emptySave, sanitizeSave, ITEM_NAMES } from '../src/pawville/worldSave.ts';
import { QUESTS } from '../src/pawville/adventure/content.ts';
import { dispatch, validateQuests } from '../src/pawville/adventure/engine.ts';
import { emptyAdventure, viewOf, addFlags, sanitizeAdventure, befriend } from '../src/pawville/adventure/state.ts';
import { cityDialogue } from '../src/pawville/adventure/dialogue.ts';
import { GAMES } from '../src/pawville/destinations.ts';
import { matchAppPath } from '../src/pawville/routes.ts';
import { BUILDINGS, INTERACTABLES } from '../src/pawville/world/townMap.ts';
import { townSpots } from '../src/pawville/adventure/regions.ts';

const seq = (...xs: number[]) => { let i = 0; return () => xs[i++ % xs.length]; };

test('economy: buy/sell are atomic, validated and never go negative', () => {
  let s = { ...emptySave(), tokens: 3 };
  const r1 = buy(s, 'bakery', 'snack-cookies');
  assert.ok(r1.ok);
  s = r1.ok ? r1.save : s;
  assert.equal(s.tokens, 1);
  assert.equal(s.inventory['snack-cookies'], 1);
  const r2 = buy(s, 'bakery', 'snack-onigiri');
  assert.ok(!r2.ok && r2.reason === 'tokens', 'cannot afford');
  assert.ok(!buy(s, 'bakery', 'plush-fish').ok, 'not sold at the bakery');
  assert.ok(!sell(s, 'market', 'fish-koi').ok, 'cannot sell what you do not have');
  s = { ...s, inventory: { ...s.inventory, 'fish-koi': 1 } };
  const r3 = sell(s, 'market', 'fish-koi');
  assert.ok(r3.ok && r3.save.tokens === 6 && !r3.save.inventory['fish-koi']);
  assert.ok(!sell(s, 'bakery', 'fish-koi').ok, 'only the market buys');
  assert.ok(!spend({ ...s, tokens: 0 }, 1, 'x').ok);
  for (const shop of SHOPS) for (const it of shop.sells) assert.ok(ITEM_NAMES[it.item] && it.price > 0, `${shop.id} sells a real item`);
});

test('economy: one-time gifts are idempotent; arcade earnings are capped per day', () => {
  const g1 = grantOnce(emptySave(), 'city-welcome', 10);
  assert.ok(g1.ok);
  const g2 = grantOnce(g1.ok ? g1.save : emptySave(), 'city-welcome', 10);
  assert.ok(!g2.ok, 'a retried gift does not pay twice');
  let s = emptySave();
  let total = 0;
  for (let i = 0; i < 10; i++) { const e = earnArcade(s, 5, '2026-10-24'); s = e.save; total += e.earned; }
  assert.equal(total, ARCADE_DAILY_CAP);
  assert.equal(earnArcade(s, 5, '2026-10-25').earned, 5, 'a new day, a fresh cap');
  const r = setRecord(emptySave(), 'meow-melody', 4);
  assert.ok(r.isNew);
  assert.ok(!setRecord(r.save, 'meow-melody', 3).isNew, 'lower scores never overwrite a best');
});

test('save migration: older saves gain tokens/claims/records safely; junk is cleaned', () => {
  const old = sanitizeSave({ inventory: { shell: 2 }, stats: { coins: 3 } });
  assert.equal(old.tokens, 0);
  assert.deepEqual(old.claims, []);
  assert.deepEqual(old.records, {});
  assert.equal(old.inventory.shell, 2, 'existing items kept');
  const junk = sanitizeSave({ tokens: -5, claims: ['a', 'a', 7], records: { x: 'nope', y: 3 } });
  assert.equal(junk.tokens, 0);
  assert.deepEqual(junk.claims, ['a']);
  assert.equal(junk.records.y, 3);
  assert.equal(sanitizeSave({ tokens: 1e9 }).tokens, 9999);
  const adv = sanitizeAdventure({ flags: ['region:harbor'] });
  assert.deepEqual(adv.friends, {}, 'older adventure saves gain an empty friendship map');
  assert.equal(befriend(befriend(adv, 'rosie', 7), 'rosie', 7).friends.rosie, 10, 'friendship is capped');
});

test('Meow Melody: pattern grows, one second chance, then game over', () => {
  let s = newMelody(seq(0.1));
  assert.equal(s.seq.length, 1);
  assert.equal(melodyPress(s, 0, seq(0.5)), s, 'no input while the pattern is showing');
  s = melodyShown(s);
  s = melodyPress(s, s.seq[0], seq(0.6));
  assert.equal(s.round, 2);
  assert.equal(s.seq.length, 2);
  s = melodyShown(s);
  const wrong = (s.seq[0] + 1) % 4;
  s = melodyPress(s, wrong, seq(0.5));
  assert.equal(s.last, 'mistake');
  assert.equal(s.phase, 'show', 'second chance replays the pattern');
  s = melodyShown(s);
  s = melodyPress(s, wrong, seq(0.5));
  assert.equal(s.phase, 'over');
  assert.equal(melodyScore(s), 1);
  assert.deepEqual([0, 1, 3, 5, 8].map(melodyTokens), [0, 1, 2, 3, 5]);
  // patterns never contain three identical notes in a row
  let t = melodyShown(newMelody(seq(0)));
  for (let round = 0; round < 12; round++) {
    const n = t.seq.length;
    for (let k = 0; k < n; k++) t = melodyPress(t, t.seq[t.pos], seq(0));
    t = melodyShown(t);
  }
  assert.ok(t.seq.length >= 12);
  for (let i = 2; i < t.seq.length; i++) assert.ok(!(t.seq[i] === t.seq[i - 1] && t.seq[i] === t.seq[i - 2]));
});

test('claw machine: centred wins, edge may slip (fair 50%), far misses; motion ping-pongs', () => {
  const p = CLAW_PLUSHES[1];
  assert.deepEqual(clawDrop(p.x + 2, seq(0.99)), { result: 'win', item: p.item, offset: 2 });
  assert.equal(clawDrop(p.x + 8, seq(0.2)).result, 'win');
  assert.equal(clawDrop(p.x + 8, seq(0.8)).result, 'slip');
  assert.equal(clawDrop(34, seq(0)).result, 'miss');
  assert.equal(clawPosition(0), 0);
  assert.ok(Math.abs(clawPosition(1000 * 100 / 38) - 100) < 1e-6);
  assert.ok(clawPosition(1000 * 150 / 38) < 60, 'comes back after the far wall');
});

test('voices: each character sounds different; Racon chitters, never meows; no voice for the purr emote', () => {
  const r = seq(0.5);
  const racon = voicePlan('racon', 'greet', r);
  assert.ok(racon.length >= 4 && racon.every((s) => s.dur < 0.06), 'raccoon chatter is a quick burst');
  const mini = voicePlan('mini', 'greet', seq(0.5));
  const magic = voicePlan('magic', 'greet', seq(0.5));
  assert.ok(mini[0].f0 > magic[0].f0 * 2, 'Mini chirps high, Magic mrrps low');
  assert.equal(voiceForEmote('puchu-loud-purr'), null);
  assert.equal(voiceForEmote('chutki-belly-nap'), 'sleepy');
  assert.equal(voiceForEmote('racon-fence-dance'), 'playful');
});

test('city residents keep routines but never disappear; Biscuit shelters from rain', () => {
  const biscuit = cityNpcs().find((n) => n.id === 'biscuit')!;
  const day = biscuit.schedule!({ phase: 'afternoon', rain: false });
  const rain = biscuit.schedule!({ phase: 'afternoon', rain: true });
  const night = biscuit.schedule!({ phase: 'night', rain: false });
  assert.notDeepEqual([day.x, day.y], [rain.x, rain.y]);
  assert.deepEqual([rain.x, rain.y], [night.x, night.y]);
  for (const n of cityNpcs()) for (const phase of ['morning', 'afternoon', 'sunset', 'evening', 'night']) for (const r of [true, false]) {
    const at = n.schedule!({ phase, rain: r });
    assert.ok(Number.isFinite(at.x) && Number.isFinite(at.y), `${n.id} always has a place`);
  }
});

test('branching dialogue: intro once, remembered choices change later lines, world-aware', () => {
  let s = emptyAdventure();
  const w = { phase: 'afternoon', rain: false };
  const first = cityDialogue('clementine', viewOf(s), w)!;
  assert.equal(first.meet, 'clementine');
  assert.ok(first.choices && first.choices.length >= 2);
  assert.ok(new Set(first.choices.map((c) => c.tone)).size === first.choices.length, 'each reply has its own tone');
  s = addFlags(s, ['met:clementine']).state;
  const again = cityDialogue('clementine', viewOf(s), w)!;
  assert.equal(again.meet, undefined, 'no repeated introduction');
  s = addFlags(s, ['harbor-restored']).state;
  const marlow = cityDialogue('clementine', viewOf(s), w)!;
  assert.ok(marlow.lines.join(' ').includes('Marlow'), 'reacts to the restored harbor');
  s = { ...s, choices: { 'clementine:marlow': 'visit' } };
  assert.ok(cityDialogue('clementine', viewOf(s), w)!.lines[0].includes('visited Marlow'), 'remembers the answer');
  const rainy = cityDialogue('biscuit', viewOf(addFlags(s, ['met:biscuit']).state), { phase: 'afternoon', rain: true })!;
  assert.ok(rainy.lines[0].includes('café awning'));
  assert.equal(cityDialogue('mabel', viewOf(s), w), null, 'village NPCs keep their own dialogue');
});

test('Biscuit’s Unfinished Song: talk → arcade → melody round 5 → encore; reward once, tokens granted', () => {
  assert.deepEqual(validateQuests(QUESTS), []);
  let s = addFlags(emptyAdventure(), ['region:city']).state;
  const go = (ev: Parameters<typeof dispatch>[2]) => { const r = dispatch(QUESTS, s, ev, 1); s = r.state; return r; };
  go({ type: 'talk', npc: 'biscuit' });
  assert.equal(s.quests['biscuits-song'].status, 'active');
  go({ type: 'puzzle', id: 'melody-5' });
  assert.equal(s.quests['biscuits-song'].step, 0, 'must ask Ozzie first (no skipping)');
  go({ type: 'talk', npc: 'ozzie' });
  go({ type: 'puzzle', id: 'melody-5' });
  const done = go({ type: 'talk', npc: 'biscuit' });
  assert.equal(s.quests['biscuits-song'].status, 'done');
  assert.ok(s.flags.includes('biscuit-song'));
  assert.ok(done.grants.some((g) => g.kind === 'tokens' && g.n === 10));
  assert.equal(dispatch(QUESTS, s, { type: 'talk', npc: 'biscuit' }, 2).grants.length, 0, 'no duplicate rewards');
});

test('city map: districts, arcade cabinets launch real games, Battleship retired, PawType in the arcade', () => {
  const city = buildCity();
  for (const a of ['Whiskerwick Station', 'Central Plaza', 'Shopping Street', 'Entertainment District', 'Café Quarter', 'The Boardwalk']) assert.ok(city.areas.some((x) => x.name === a), a);
  assert.ok(city.spots.some((s) => s.to?.region === 'town'), 'train home');
  assert.ok(city.spots.some((s) => s.to?.region === 'arcade-hall'), 'arcade door');
  const hall = buildArcadeHall();
  assert.ok(hall.spots.some((s) => s.to?.region === 'city'), 'arcade exit');
  for (const m of ARCADE_MACHINES) if (m.route) assert.notEqual(matchAppPath(m.route).name, 'notfound', `${m.id} cabinet route exists`);
  assert.ok(!GAMES.some((g) => (g.id as string) === 'cat-battleship'));
  assert.equal(GAMES.find((g) => g.id === 'pawtype')!.destination, 'arcade');
  assert.ok(!BUILDINGS.some((b) => (b.id as string) === 'typing-arena') && !INTERACTABLES.some((i) => (i.action as string) === 'typing-arena'));
  assert.ok(townSpots().some((s) => s.id === 'town-station' && s.to?.region === 'city'));
});
