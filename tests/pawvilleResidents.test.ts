/**
 * Part 7: the residents' personalities (story/residents*.ts) on top of the established dialogue, in the merged project
 * (old story engine + karaoke + multiplayer fixes). Pure rules; the real-browser run is tests/browser/story_and_npcs.py.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { NEW_RESIDENTS } from '../src/pawville/living/roster.ts';
import { emptyAdventure, sanitizeAdventure, viewOf, addFlags, befriend, remember, type AdventureState } from '../src/pawville/adventure/state.ts';
import { cityDialogue, dialogueFor, type Dialogue } from '../src/pawville/adventure/dialogue.ts';
import { regionDef, townNpcs, EXPLORE_REGIONS } from '../src/pawville/adventure/regions.ts';
import { SCENES, completeScene } from '../src/pawville/story/engine.ts';
import { PROFILES, ROSTER_IDS, layerConversation, memoryLines, nameOf, peopleEntries, pickedChoice, profileKey, profileOf, triggerHolds } from '../src/pawville/story/residents.ts';
import { toneOfChoice } from '../src/pawville/story/model.ts';

const DAY = { phase: 'afternoon', rain: false };
const unlocked = (): AdventureState => ({ ...emptyAdventure(), quests: { 'lost-star': { status: 'done', step: 8, count: 0, hits: [], startedAt: 1, doneAt: 2 } }, flags: ['lumi-home', 'constellation-lumi', 'region:city'] });

// ======================================================================================= Part 7: the roster
const QUEST_IDS = ['mabel', 'marlow', 'pip', 'bramble-stray', 'finn', 'coral', 'juniper', 'clementine', 'biscuit', 'rosie', 'pemberton', 'ozzie', 'tulip', 'bloom', 'velvet', 'wren', 'sky', 'hazel', 'nutmeg'];

test('roster: EVERY character in the game has a personality profile (44 residents + 19 quest characters; Lumi has the story arc)', () => {
  const real = new Set<string>(NEW_RESIDENTS.map((r) => r.id));
  for (const id of QUEST_IDS) real.add(id);
  assert.equal(NEW_RESIDENTS.length, 44);
  assert.equal(PROFILES.length, 63);
  assert.equal(new Set(ROSTER_IDS).size, 63, 'unique ids');
  for (const id of real) assert.ok(profileOf(id), `${id} has a profile`);
  // and every npc that exists on any map is covered (a profile, or the story arc for Lumi)
  const onMaps = new Set<string>();
  for (const n of townNpcs()) onMaps.add(n.id === 'bramble' ? 'bramble' : n.id);
  for (const r of EXPLORE_REGIONS) for (const n of regionDef(r as never).npcs) onMaps.add(profileKey(n.id, r));
  for (const id of onMaps) assert.ok(id === 'lumi' || profileOf(id), `${id} (on a map) is covered`);
  assert.equal(profileKey('bramble', 'forest'), 'bramble-stray');
});

test('roster: every profile is individual — own worry, own quirk, own questions, 2–3 replies, a follow-up, a trigger; nothing is copy-pasted', () => {
  const seen = { q: new Set<string>(), worry: new Set<string>(), quirk: new Set<string>(), cares: new Set<string>(), fq: new Set<string>() };
  for (const p of PROFILES) {
    assert.ok(p.cares.length > 8 && p.worry.length > 12 && p.quirk.length > 8, `${p.id}: cares/worry/quirk`);
    assert.ok(p.opts.length >= 2 && p.opts.length <= 3, `${p.id}: ${p.opts.length} topic replies`);
    assert.equal(p.fopts.length, 2, `${p.id}: follow-up replies`);
    for (const o of [...p.opts, ...p.fopts]) { assert.ok(o.label.length > 4 && o.label.length < 90 && o.reply.length > 8, `${p.id}: option text`); }
    for (const o of p.opts) assert.ok(o.back.length > 10 && o.told.length > 6, `${p.id}: topic answers are remembered (back) and gossip-able (told)`);
    assert.ok(new Set(p.opts.map((o) => o.tone)).size === p.opts.length, `${p.id}: replies differ in tone`);
    assert.match(p.ftrig, /^(rain|night|morning|day|flag:.+|story:.+)$/, `${p.id}: trigger`);
    for (const [k, v] of [['q', p.q], ['worry', p.worry], ['quirk', p.quirk], ['cares', p.cares], ['fq', p.fq]] as const) { assert.ok(!seen[k].has(v), `${p.id}: duplicate ${k}`); seen[k].add(v); }
    if (p.friend) assert.ok(profileOf(p.friend), `${p.id}: friend ${p.friend} exists`);
    if (p.hear) assert.equal(p.hear.length, 2);
    const sceneIds = new Set(SCENES.map((s) => s.id)); if (p.ftrig.startsWith('story:')) assert.ok(sceneIds.has(p.ftrig.slice(6)), `${p.id}: story trigger exists`);
  }
  // not one generic choice tree: the set of reply tone patterns across the roster is varied
  const patterns = new Set(PROFILES.map((p) => p.opts.map((o) => o.tone).sort().join('+')));
  assert.ok(patterns.size >= 8, `${patterns.size} distinct tone patterns`);
  const trig = new Set(PROFILES.map((p) => p.ftrig.split(':')[0])); for (const t of ['rain', 'night', 'morning', 'day', 'flag', 'story']) assert.ok(trig.has(t), `a ${t} trigger is used`);
});

test('before/after coverage: choices existed for 8 characters; now all 63 have a personality conversation, a follow-up and a memory', () => {
  const v = viewOf(unlocked());
  const before = ['clementine', 'biscuit', 'rosie', 'tulip', 'bloom', 'velvet', 'ozzie', 'nutmeg'];
  let withChoicesBefore = 0;
  for (const id of [...QUEST_IDS, ...NEW_RESIDENTS.map((r) => r.id)]) {
    const d = cityDialogue(id, v, DAY) ?? dialogueFor(id, v, 'town');
    if (d.choices?.length) withChoicesBefore++;
  }
  assert.ok(withChoicesBefore >= 6 && withChoicesBefore <= 12, `${withChoicesBefore} had choices on a first visit before`);
  for (const id of before) assert.ok(profileOf(id));
  let after = 0;
  for (const p of PROFILES) {
    const base: Dialogue = { name: p.id, lines: ['…'] };
    const d = layerConversation(base, p, v, DAY);
    if (d.choices && d.choices.length >= 2) after++;
  }
  assert.equal(after, 63);
});

test('conversation: topic first → remembered → follow-up when its trigger holds → callbacks; existing first-meeting choices are never overridden', () => {
  const p = profileOf('rosie')!;
  let st = unlocked();
  let d: Dialogue = layerConversation<Dialogue>({ name: 'Rosie', lines: ['Hi.'] }, p, viewOf(st), DAY);
  assert.deepEqual(d.lines, ['Hi.', p.q]); assert.equal(d.choices!.length, p.opts.length);
  const pick = d.choices![1]; assert.equal(pick.remember!.key, 'rosie:topic'); assert.equal(pick.remember!.value, 't1'); assert.equal(pick.friend, 1);
  st = befriend(remember(st, pick.remember!.key, pick.remember!.value), 'rosie', 1);
  assert.equal(pickedChoice(p, viewOf(st), 'topic')!.label, p.opts[1].label);
  // the follow-up is NOT offered yet (it is not raining), but the answer is remembered
  d = layerConversation({ name: 'Rosie', lines: ['Hi.'] }, p, viewOf(st), DAY);
  assert.equal(d.choices, undefined); assert.ok(d.lines.includes(p.opts[1].back), 'remembers what you said');
  // it opens on its trigger…
  const rain = { phase: 'afternoon', rain: true };
  d = layerConversation({ name: 'Rosie', lines: ['Hi.'] }, p, viewOf(st), rain);
  assert.equal(d.choices!.length, 2); assert.ok(d.lines.includes(p.fq));
  st = remember(st, 'rosie:follow', 'f0');
  d = layerConversation({ name: 'Rosie', lines: ['Hi.'] }, p, viewOf(st), rain);
  assert.equal(d.choices, undefined, 'answered once: never asked twice');
  // a base conversation that already offers choices is left alone
  const quest = { name: 'x', lines: ['Quest?'], choices: [{ label: 'a', tone: 'friendly' as const, reply: ['b'] }] };
  assert.equal(layerConversation(quest, p, viewOf(emptyAdventure()), DAY), quest);
});

test('conversation: every follow-up opens once Act II is over, whatever the weather (optional content never blocks anyone)', () => {
  const finished = completeScene(completeScene(unlocked(), 'a1-end'), 'a2-gate');
  for (const p of PROFILES) assert.ok(triggerHolds(p.ftrig, viewOf(finished), { phase: 'night', rain: false }) && triggerHolds(p.ftrig, viewOf(finished), { phase: 'morning', rain: true }), `${p.id}`);
  assert.ok(!triggerHolds('rain', viewOf(unlocked()), DAY) && triggerHolds('rain', viewOf(unlocked()), { phase: 'day', rain: true }));
  assert.ok(triggerHolds('night', viewOf(unlocked()), { phase: 'evening', rain: false}) && !triggerHolds('night', viewOf(unlocked()), DAY));
  assert.ok(triggerHolds('flag:harbor-restored', viewOf(addFlags(unlocked(), ['harbor-restored']).state), DAY) && !triggerHolds('flag:harbor-restored', viewOf(unlocked()), DAY));
});

test('memory: cross-NPC knowledge is plausible — only a FRIEND hears about your answer, and only local events are known', () => {
  let st = unlocked();
  // the player answered Sol's topic
  st = remember(st, 'sol:topic', 't0');
  const marzipan = profileOf('marzipan')!, ticket = profileOf('ticket')!;
  assert.equal(marzipan.friend, 'sol');
  assert.ok(memoryLines(marzipan, viewOf(st), DAY).some((l) => l.includes('Sol mentioned you') && l.includes(profileOf('sol')!.opts[0].told)), 'Sol’s friend Marzipan heard');
  assert.ok(!memoryLines(ticket, viewOf(st), DAY).some((l) => l.includes('mentioned you')), 'Ticket (not Sol’s friend) did not');
  assert.ok(!memoryLines(profileOf('moss')!, viewOf(st), DAY).some((l) => l.includes('Sol')), 'a stranger across town knows nothing');
  // local events: Finn knows the harbour was restored; the arcade’s Ozzie does not comment on it
  const kelp = profileOf('kelp')!;
  assert.ok(!memoryLines(kelp, viewOf(st), DAY).some((l) => l.includes('lamp')));
  assert.ok(memoryLines(kelp, viewOf(addFlags(st, ['harbor-restored']).state), DAY).some((l) => l.includes('lamp')));
  // nobody knows about an answer that was never given
  assert.deepEqual(memoryLines(profileOf('quill')!, viewOf(unlocked()), DAY).filter((l) => l.includes('mentioned')), []);
});

test('journal: the People page shows what you learned and when each character may say more; nothing is a puzzle', () => {
  let st = unlocked();
  st = remember(st, 'tulip:topic', 't0'); st = remember(st, 'dozy:topic', 't1'); st = remember(st, 'dozy:follow', 'f0');
  const list = peopleEntries(viewOf(st), nameOf);
  assert.deepEqual(list.map((x) => x.name).sort(), ['Dozy', 'Nana Tulip']);
  const t = list.find((x) => x.id === 'tulip')!; assert.match(t.memory!, /^You asked how Nana Tulip really is\.$/); assert.match(t.locked!, /rainy day/); assert.equal(t.follow, null);
  const d = list.find((x) => x.id === 'dozy')!; assert.match(d.follow!, /opened up later/); assert.equal(d.locked, null);
  assert.equal(nameOf('bramble-stray'), 'Bramble');
});

test('save: 63 characters × 2 answers survive a reload (the old 60-entry cap silently dropped memories)', () => {
  let st = unlocked();
  for (const p of PROFILES) { st = remember(st, `${p.id}:topic`, 't0'); st = remember(st, `${p.id}:follow`, 'f1'); st = befriend(st, p.id, 2); }
  assert.equal(Object.keys(st.choices).length, 126);
  const back = sanitizeAdventure(JSON.parse(JSON.stringify(st)));
  assert.equal(Object.keys(back.choices).length, 126); assert.equal(Object.keys(back.friends).length, 63);
  assert.deepEqual(back.choices, st.choices);
  assert.ok(JSON.stringify(st).length < 150_000, 'well under the record cap');
});

test('merge: the residents layer uses the OLD story engine’s real scene ids and tones (no dangling triggers)', () => {
  const ids = new Set(SCENES.map((s) => s.id));
  for (const p of PROFILES) if (p.ftrig.startsWith('story:')) assert.ok(ids.has(p.ftrig.slice(6)), `${p.id}: ${p.ftrig}`);
  for (const p of PROFILES) if (p.hear?.[0].startsWith('story:')) assert.ok(ids.has(p.hear[0].slice(6)), `${p.id}: hear ${p.hear[0]}`);
  for (const p of PROFILES) for (const o of [...p.opts, ...p.fopts]) assert.ok(toneOfChoice(o.tone), `${p.id}: tone ${o.tone} feeds the five tones`);
  assert.ok(toneOfChoice('friendly') === 'kindness' && toneOfChoice('skeptical') === 'courage' && toneOfChoice('patience') === 'patience' && toneOfChoice('nonsense') === null);
  assert.ok(viewOf(completeScene({ ...emptyAdventure(), flags: ['lumi-home'] }, 'a1-end')).story.done('a1-end'));
});
