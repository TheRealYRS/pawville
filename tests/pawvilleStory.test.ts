/**
 * The Song Beneath the Stars: engine, content, save compatibility, paired answers, music and world placement.
 * The centrepiece is a whole-story simulator: it plays the entire story through the real engine with many different
 * answer policies and checks that it can always be finished (no soft locks), that effects never duplicate, and that
 * the ending's shape follows how the player answered.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyAdventure, sanitizeAdventure, viewOf, adventureStore, isSharedFlag, type AdventureState } from '../src/pawville/adventure/state.ts';
import { memoryStorage } from '../src/pawville/persistence.ts';
import { mergeShared } from '../src/pawville/adventure/sync.ts';
import { SCENES, applyAnswer, applyFx, completeScene, companionTalk, finishScene, lumiAt, openScene, sceneAvailable, sceneById, sceneForNpc, sceneForSpot, storyObjective } from '../src/pawville/story/engine.ts';
import { CAST } from '../src/pawville/story/cast.ts';
import { STORY_ENTRIES, storyEntry, unlockedEntries, pairedRecap } from '../src/pawville/story/journal.ts';
import { TONES, applyStoryFx, emptyStory, finaleVariant, leadingTones, sanitizeStory, toneSummary, type Tone } from '../src/pawville/story/model.ts';
import { PICK_WAIT_MS, PickBox, parsePick, resolvePick, STORY_PICK } from '../src/pawville/story/pairing.ts';
import { CUES, PHRASES, arrange, cueClip } from '../src/pawville/story/music.ts';
import { renderOffline } from '../src/pawville/audio/synth.ts';
import { storyGlyphs, storyNpcs, storySpots, buildTemple } from '../src/pawville/story/world.ts';
import { regionDef, resetRegionCacheForTests, townNpcs, townSpots } from '../src/pawville/adventure/regions.ts';
import { reachableTiles, regionPropCollider, RTILE } from '../src/pawville/adventure/regionKit.ts';
import { auditRegion } from '../src/pawville/world/mapAudit.ts';
import { buildTown, SPAWN_POINT } from '../src/pawville/world/townMap.ts';
import { rasterFactory } from '../scripts/preview/raster.ts';
import { buildRegionSprites, regionSpriteKey } from '../src/pawville/render/regionArt.ts';

const CTX = { phase: 'afternoon', rain: false };

/** An adventure save in which Lumi has been found (the story's only outside requirement). */
const unlockedSave = (): AdventureState => ({
  ...emptyAdventure(),
  quests: { 'lost-star': { status: 'done', step: 8, count: 0, hits: [], startedAt: 1, doneAt: 2 } },
  flags: ['lumi-home', 'constellation-lumi', 'region:city'],
});

type Policy = (n: number, step: number) => number;
const policies: Record<string, Policy> = {
  first: () => 0, second: (n) => Math.min(1, n - 1), third: (n) => Math.min(2, n - 1), fourth: (n) => Math.min(3, n - 1), last: (n) => n - 1,
  rotating: (n, s) => s % n,
};
for (let seed = 1; seed <= 12; seed++) policies[`random${seed}`] = (n, s) => ((s * 2654435761 + seed * 40503) >>> 7) % n;

/** Plays the whole story. Returns the final save and the sequence of scenes played. */
function playThrough(policy: Policy): { st: AdventureState; played: string[]; objectives: string[] } {
  let st = unlockedSave();
  const played: string[] = [];
  const objectives: string[] = [];
  let step = 0;
  for (let guard = 0; guard < 120; guard++) {
    const v = viewOf(st);
    const obj = storyObjective(v);
    objectives.push(obj.text);
    // the untangling of the three garden chimes is environmental (spots), do them whenever the garden is open
    if (v.story.done('a1-end')) {
      for (let i = 0; i < 3; i++) if (!v.story.mark(`garden:${i}`)) { st = applyFx(st, { mark: [`garden:${i}`] }); }
    }
    const v2 = viewOf(st);
    const next = SCENES.find((s) => sceneAvailable(s, v2) && !s.id.startsWith('cm-')) ?? SCENES.find((s) => sceneAvailable(s, v2));
    if (!next) break;
    // play it: answer every question (following `then` pages), then finish
    const sd = openScene(next, viewOf(st), CTX);
    let choices = sd.choices;
    let finished = false;
    while (choices?.length) {
      const c = choices[policy(choices.length, step++)];
      st = applyAnswer(st, c.story!, c.story!);
      finished = !!c.story!.finish;
      choices = c.then?.choices;
    }
    if (!finished) st = finishScene(st, next.id);
    played.push(next.id);
  }
  return { st, played, objectives };
}

// ================================================================================================================ content
test('story: every scene is well formed, spoken by known characters, and has a goal and a hint', () => {
  const ids = new Set<string>();
  for (const sc of SCENES) {
    assert.ok(!ids.has(sc.id), `duplicate scene ${sc.id}`); ids.add(sc.id);
    assert.ok(sc.title && sc.goal.length > 10 && sc.hint.length > 10, `${sc.id}: title/goal/hint`);
    assert.ok(sc.npc || sc.spot, `${sc.id}: needs a trigger`);
    const page = sc.page(viewOf(unlockedSave()), CTX);
    const walk = (p: typeof page, depth = 0) => {
      assert.ok(depth < 4, `${sc.id}: too deep`);
      assert.ok(p.say.length > 0, `${sc.id}: empty page`);
      for (const l of p.say) { assert.ok(CAST[l.w], `${sc.id}: unknown speaker ${l.w}`); assert.ok(l.t.length > 3 && l.t.length < 700, `${sc.id}: line length`); }
      if (p.ask) {
        assert.ok(p.ask.opts.length >= 3 && p.ask.opts.length <= 5, `${sc.id}: ${p.ask.opts.length} options`);
        const optIds = new Set<string>();
        for (const o of p.ask.opts) {
          assert.ok(!optIds.has(o.id), `${sc.id}: dup option ${o.id}`); optIds.add(o.id);
          assert.ok(o.label.length > 5 && o.label.length < 110, `${sc.id}/${o.id}: label`);
          assert.ok((TONES as readonly string[]).includes(o.tone));
          assert.ok(o.say.length > 0);
          if (o.next) walk(o.next, depth + 1);
        }
        assert.ok(p.ask.id.startsWith(sc.id.split('-').slice(0, 2).join('-')) || p.ask.id.startsWith(sc.id), `${sc.id}: ask id ${p.ask.id} should be scoped to its scene`);
      }
    };
    walk(page);
  }
  assert.ok(SCENES.length >= 35, `${SCENES.length} scenes`);
});

test('story: every journal entry referenced by a scene exists, and entries have unique ids and real text', () => {
  const ids = new Set(STORY_ENTRIES.map((e) => e.id));
  assert.equal(ids.size, STORY_ENTRIES.length);
  const refs = new Set<string>();
  const collect = (fx?: { journal?: readonly string[] }) => fx?.journal?.forEach((j) => refs.add(j));
  for (const sc of SCENES) {
    collect(sc.done);
    const walk = (p: ReturnType<typeof sc.page>) => p.ask?.opts.forEach((o) => { collect(o.fx); if (o.next) walk(o.next); });
    walk(sc.page(viewOf(unlockedSave()), CTX));
  }
  for (const r of refs) assert.ok(ids.has(r), `journal entry ${r} is referenced but not defined`);
  const s = emptyStory();
  for (const e of STORY_ENTRIES) assert.ok(e.text(s).length > 20, `${e.id}: text`);
});

test('story: every music cue used by a scene exists, and every cue produces finite, non-empty notes', () => {
  const used = new Set<string>();
  for (const sc of SCENES) {
    const walk = (p: ReturnType<typeof sc.page>) => { if (p.listen) used.add(p.listen.cue); p.ask?.opts.forEach((o) => { if (o.fx?.play) used.add(o.fx.play); if (o.next) walk(o.next); }); };
    walk(sc.page(viewOf(unlockedSave()), CTX));
    if (sc.done?.play) used.add(sc.done.play);
  }
  for (const c of used) assert.ok((CUES as readonly string[]).includes(c), `unknown cue ${c}`);
  const s = { ...emptyStory(), phrases: ['wind', 'lantern', 'garden', 'echo', 'rise'] };
  for (const c of CUES) {
    const clip = cueClip(c, s);
    assert.ok(clip && clip.notes.length > 0, `${c}: empty`);
    assert.ok(clip.seconds > 1 && clip.seconds < 240, `${c}: ${clip.seconds}s`);
    for (const n of clip.notes) assert.ok(Number.isFinite(n.t) && n.t >= 0 && Number.isFinite(n.dur) && n.dur > 0 && Number.isFinite(n.freq) && n.freq > 0 && n.vel > 0 && n.vel <= 1.5, `${c}: bad note`);
  }
  assert.equal(cueClip('nope'), null);
});

// ================================================================================================================ whole-story simulator
test('story: the whole story can be finished with every answer policy (no soft locks), in a sensible order', () => {
  for (const [name, policy] of Object.entries(policies)) {
    const { st, played } = playThrough(policy);
    const v = viewOf(st);
    for (const must of ['a1-chime', 'a1-biscuit', 'a1-clues', 'a1-chime-repair', 'a1-gate', 'a1-end', 'a2-biscuit-truth', 'a2-velvet-account', 'a2-arrange', 'a2-gate', 'a3-quiet', 'a3-phrase', 'a3-hearthsong', 'a3-letgo', 'ep-purring', 'ep-evening']) {
      assert.ok(v.story.done(must), `${name}: never finished ${must}\n  played: ${played.join(', ')}`);
    }
    for (const p of ['wind', 'lantern', 'garden', 'echo', 'rise']) assert.ok(v.story.phrase(p), `${name}: phrase ${p}`);
    assert.ok(v.has('region:temple') && v.has('sshared:temple-open'), `${name}: temple/gate flags`);
    assert.equal(v.story.act(), 4, `${name}: ends in the epilogue`);
    assert.ok(v.story.finale(), `${name}: has a finale`);
    assert.ok(v.story.chime(), `${name}: chime variant recorded`);
    // order: Act I strictly before Act II before Act III
    const idx = (id: string) => played.indexOf(id);
    assert.ok(idx('a1-chime') < idx('a1-biscuit') && idx('a1-biscuit') < idx('a1-clues') && idx('a1-clues') < idx('a1-chime-repair') && idx('a1-chime-repair') < idx('a1-gate') && idx('a1-gate') < idx('a1-end'), `${name}: act I order`);
    assert.ok(idx('a1-end') < idx('a2-arrange') && idx('a2-arrange') < idx('a2-gate') && idx('a2-gate') < idx('a3-quiet') && idx('a3-quiet') < idx('a3-phrase') && idx('a3-phrase') < idx('a3-hearthsong') && idx('a3-hearthsong') < idx('a3-letgo'), `${name}: act II/III order`);
    // no duplicates anywhere in the persisted lists
    for (const list of [st.story.done, st.story.clues, st.story.phrases, st.story.marks, st.story.cameos, st.story.journal]) assert.equal(new Set(list).size, list.length);
    // and the save survives a round trip
    assert.deepEqual(sanitizeAdventure(JSON.parse(JSON.stringify(st))).story, st.story);
  }
});

test('story: the objective always points somewhere real, from the first step to the last', () => {
  let st = unlockedSave();
  for (let guard = 0; guard < 100; guard++) {
    const v = viewOf(st);
    const o = storyObjective(v);
    assert.ok(o.text.length > 5 && o.hint.length > 5);
    if (o.scene) {
      const sc = sceneById(o.scene);
      assert.ok(sc, `objective names an unknown scene ${o.scene}`);
      // a scene named by the objective is either available now, or waits only on environmental steps (the garden chimes)
      assert.ok(sceneAvailable(sc!, v) || sc!.id === 'a2-garden', `objective names ${o.scene} which is not available`);
    }
    if (v.story.done('a1-end')) for (let i = 0; i < 3; i++) st = applyFx(st, { mark: [`garden:${i}`] });
    const v2 = viewOf(st);
    const next = SCENES.find((s) => sceneAvailable(s, v2) && !s.id.startsWith('cm-'));
    if (!next) break;
    const sd = openScene(next, v2, CTX);
    let choices = sd.choices; let fin = false;
    while (choices?.length) { const c = choices[0]; st = applyAnswer(st, c.story!); fin = !!c.story!.finish; choices = c.then?.choices; }
    if (!fin) st = finishScene(st, next.id);
  }
  assert.equal(storyObjective(viewOf(st)).act, 4);
  assert.equal(storyObjective(viewOf(emptyAdventure())).act, 0, 'locked until Lumi is found');
});

test('story: the ending follows how you answered (and mixes when no tone leads)', () => {
  const byTone = (tone: Tone) => {
    let st = unlockedSave();
    for (let guard = 0; guard < 100; guard++) {
      if (viewOf(st).story.done('a1-end')) for (let i = 0; i < 3; i++) st = applyFx(st, { mark: [`garden:${i}`] });
      const v = viewOf(st);
      const next = SCENES.find((s) => sceneAvailable(s, v) && !s.id.startsWith('cm-'));
      if (!next) break;
      const sd = openScene(next, v, CTX);
      let ch = sd.choices; let fin = false;
      while (ch?.length) { const c = ch.find((x) => x.story!.tone === tone) ?? ch[0]; st = applyAnswer(st, c.story!); fin = !!c.story!.finish; ch = c.then?.choices; }
      if (!fin) st = finishScene(st, next.id);
    }
    return st;
  };
  const finales = new Set<string>();
  for (const t of TONES) {
    const st = byTone(t);
    assert.equal(st.story.finale, t, `a ${t}-led player gets the ${t} finale`);
    finales.add(st.story.finale!);
    // the arrangement music differs for every tone
    const clip = cueClip('hearthsong', st.story)!;
    assert.ok(clip.notes.length > 30);
  }
  assert.equal(finales.size, 5);
  const clips = TONES.map((t) => JSON.stringify(cueClip('hearthsong', byTone(t).story)!.notes.slice(0, 40)));
  assert.equal(new Set(clips).size, 5, 'every tone is arranged differently');
  // mixed: a fresh story state with all five tones equal has no single leader
  const mixed = { ...emptyStory(), tones: { kindness: 3, curiosity: 3, courage: 3, patience: 3, playfulness: 3 } };
  assert.equal(finaleVariant(mixed), 'mixed');
  assert.deepEqual(leadingTones(mixed), []);
});

test('story: choices have visible, persistent consequences (the chime, Wren, Biscuit and the finale)', () => {
  const take = (opt: string): AdventureState => {
    let st = unlockedSave();
    const run = (id: string, pick: string) => {
      const sc = sceneById(id)!;
      const sd = openScene(sc, viewOf(st), CTX);
      const c = sd.choices?.find((x) => x.story!.opt === pick);
      if (c) { st = applyAnswer(st, c.story!); } else st = finishScene(st, id);
    };
    run('a1-chime', 'where'); run('a1-biscuit', 'quiet'); run('a1c-harbor', 'wait'); st = finishScene(st, 'a1c-harbor'); run('a1-clues', 'x'); run('a1-chime-repair', opt);
    return st;
  };
  const kinds = ['careful', 'craft', 'improv', 'wait'] as const;
  const seen = new Set<string>();
  for (const k of kinds) {
    const st = take(k);
    assert.equal(st.story.chime, k);
    const v = viewOf(st);
    seen.add(storyGlyphs('old-town', v).find((g) => g.id === 'repair')!.state!);
    seen.add(JSON.stringify(cueClip('chime-phrase', st.story)!.notes[0].voice));
    assert.ok(unlockedEntries(st.story).some((e) => e.id === 'chime-repaired' && e.text(st.story).length > 40));
  }
  assert.ok(seen.has('careful') && seen.has('craft') && seen.has('improv') && seen.has('wait'), 'the chime LOOKS different for each way of mending it');
  assert.ok(seen.has('"chime-paper"') && seen.has('"chime-crack"') && seen.has('"bell"'), 'and SOUNDS different');
  // Wren reacts to how you mended it
  const wrenLines = new Set(kinds.map((k) => { const st = take(k); const sc = sceneById('cm-wren')!; return sc.page(viewOf(st), CTX).say[0].t; }));
  assert.equal(wrenLines.size, 4);
  // Biscuit's journal entry reflects how you listened to him
  const e = (opt: string) => { let st = unlockedSave(); st = applyAnswer(st, openScene(sceneById('a1-chime')!, viewOf(st), CTX).choices![0].story!); const c = openScene(sceneById('a1-biscuit')!, viewOf(st), CTX).choices!.find((x) => x.story!.opt === opt)!; st = applyAnswer(st, c.story!); return storyEntry('biscuit-melody')!.text(st.story); };
  assert.notEqual(e('quiet'), e('keep'));
  assert.match(e('quiet'), /stayed to play it twice/);
});

test('story: answering is idempotent and resumable (closing the window midway never loses or doubles anything)', () => {
  let st = unlockedSave();
  const sc = sceneById('a1-chime')!;
  const sd = openScene(sc, viewOf(st), CTX);
  const c = sd.choices![0];
  const once = applyAnswer(st, c.story!);
  const twice = applyAnswer(once, c.story!);
  assert.equal(twice.story.tones.curiosity, once.story.tones.curiosity + 1, 'a repeated answer is a repeated choice (tone only)');
  assert.deepEqual(twice.story.clues, once.story.clues);
  assert.deepEqual(twice.story.journal, once.story.journal);
  // after answering, reopening the scene resumes after the answer instead of asking again
  const re = openScene(sc, viewOf(once), CTX);
  assert.equal(re.choices, undefined, 'the question is not asked twice');
  assert.ok(re.lines.length > sd.lines.length, 'the earlier answer’s reply is replayed');
  st = completeScene(once, sc.id); const again = completeScene(st, sc.id);
  assert.deepEqual(again.story.done, st.story.done);
  assert.equal(again.story.journal.length, st.story.journal.length);
});

test('story: essential information has more than one source (no clue can be missed for good)', () => {
  // Act I needs ONE clue; each clue has a place, a resident and Lumi's notebook
  const base = (() => { let st = unlockedSave(); st = completeScene(st, 'a1-chime'); st = completeScene(st, 'a1-biscuit'); return st; })();
  const v0 = viewOf(base);
  assert.ok(!sceneAvailable(sceneById('a1-clues')!, v0), 'no clues yet');
  assert.ok(sceneAvailable(sceneById('a1-lumi-help')!, v0), 'Lumi can help when nothing has been found');
  for (const [place, cameo] of [['harbor', 'cm-kelp'], ['garden', 'cm-pemberton'], ['archive', 'cm-dewey']] as const) {
    const spotScene = SCENES.find((s) => s.id === `a1c-${place}`)!;
    assert.ok(sceneAvailable(spotScene, v0), `${place}: the place`);
    assert.ok(sceneAvailable(sceneById(cameo)!, v0), `${place}: a resident offers it too`);
    const st = completeScene(base, cameo);
    assert.ok(viewOf(st).story.clue(`clue:${place}`), `${place}: the resident provides the same clue`);
    assert.ok(sceneAvailable(sceneById('a1-clues')!, viewOf(st)), `${place}: one clue is enough`);
  }
  const st = completeScene(base, 'a1-lumi-help');
  assert.ok(sceneAvailable(sceneById('a1-clues')!, viewOf(st)), 'Lumi’s notebook alone unlocks the next step');
});

test('story: Act II places can be done in any order, and the gate waits for all five phrases and both friends', () => {
  const orders = [['wind', 'lantern', 'garden', 'echo', 'rise'], ['rise', 'echo', 'garden', 'lantern', 'wind'], ['garden', 'rise', 'wind', 'echo', 'lantern']];
  for (const order of orders) {
    let st = unlockedSave();
    for (const id of ['a1-chime', 'a1-biscuit', 'a1c-harbor', 'a1-clues', 'a1-chime-repair', 'a1-gate', 'a1-end']) st = completeScene(applyFx(st, { clue: id === 'a1c-harbor' ? ['clue:harbor'] : [] }), id);
    for (let i = 0; i < 3; i++) st = applyFx(st, { mark: [`garden:${i}`] });
    for (const p of order) {
      const sc = sceneById(`a2-${p}`)!;
      assert.ok(sceneAvailable(sc, viewOf(st)), `a2-${p} available in any order`);
      st = applyAnswer(st, openScene(sc, viewOf(st), CTX).choices![0].story!);
    }
    assert.ok(!sceneAvailable(sceneById('a2-arrange')!, viewOf(st)), 'arranging needs both friends first');
    assert.ok(sceneAvailable(sceneById('a2-biscuit-truth')!, viewOf(st)) && sceneAvailable(sceneById('a2-velvet-account')!, viewOf(st)));
    st = completeScene(st, 'a2-biscuit-truth'); st = completeScene(st, 'a2-velvet-account');
    assert.ok(sceneAvailable(sceneById('a2-arrange')!, viewOf(st)));
    st = completeScene(st, 'a2-arrange');
    assert.ok(!viewOf(st).has('region:temple'), 'the gate has not opened yet');
    assert.ok(sceneAvailable(sceneById('a2-gate')!, viewOf(st)));
  }
});

test('story: Lumi and Velvet are where the story needs them (and Lumi goes home to the isles at the end)', () => {
  let st = unlockedSave();
  assert.equal(lumiAt(viewOf(st)), null, 'before the chime Lumi lives on the isles');
  const seq: [string, string, string][] = [['a1-chime', 'city', 'biscuit'], ['a1-biscuit', 'town', 'chime'], ['a1-clues', 'old-town', 'repair'], ['a1-chime-repair', 'old-town', 'gate'], ['a1-gate', 'city', 'biscuit'], ['a1-end', 'town', 'chime'], ['a2-gate', 'temple', 'temple']];
  for (const [done, region, at] of seq) {
    st = completeScene(st, done);
    const p = lumiAt(viewOf(st));
    assert.deepEqual(p && [p.region, p.at], [region, at], `after ${done}`);
  }
  const fresh = completeScene(unlockedSave(), 'a1-chime-repair');
  assert.ok(viewOf(fresh).story.velvetAtGate(), 'Mr. Velvet leaves the shop for the gate once the chime is mended');
  assert.ok(!viewOf(completeScene(fresh, 'a3-letgo')).story.velvetAtGate(), 'and goes back to the shop afterwards');
  const end = completeScene(st, 'a3-letgo');
  assert.equal(lumiAt(viewOf(end)), null, 'in the epilogue Lumi is home on the isles again');
  const isles = regionDef('isles').npcs.find((n) => n.id === 'lumi')!;
  assert.ok(isles.when!(viewOf(end)), 'the isles show Lumi again');
  assert.ok(!isles.when!(viewOf(completeScene(unlockedSave(), 'a1-chime'))), 'but not while she is out and about');
  // a companion with no scene still has something to say
  assert.ok(companionTalk('lumi', viewOf(st)).say.length >= 1);
});

// ================================================================================================================ save compatibility
test('save: old saves (no story) load fresh, the adventure store migrates v1 → v2, and hostile story data is repaired', () => {
  const old = JSON.parse(JSON.stringify(emptyAdventure())); delete old.story;
  const s = sanitizeAdventure(old);
  assert.deepEqual(s.story, emptyStory());
  const storage = memoryStorage();
  storage.setItem('pawville:adventure', JSON.stringify({ v: 1, data: { ...old, flags: ['region:harbor'], journal: ['marlow-story'] } }));
  const loaded = adventureStore(storage).load();
  assert.deepEqual(loaded.flags, ['region:harbor']);
  assert.deepEqual(loaded.journal, ['marlow-story']);
  assert.deepEqual(loaded.story, emptyStory());
  adventureStore(storage).save({ ...loaded, story: { ...loaded.story, done: ['a1-chime'] } });
  assert.deepEqual(JSON.parse(storage.getItem('pawville:adventure')!).v, 2);
  assert.deepEqual(adventureStore(storage).load().story.done, ['a1-chime']);
  const hostile = sanitizeStory({ tones: { kindness: 9999, courage: 'x', nope: 4 }, done: ['a1-chime', 'a1-chime', '<script>', 5, 'x'.repeat(100)], picks: { good: 'opt', 'bad key!': 'x', also: 3 }, chime: 'banana', bonds: { lumi: -4, biscuit: 99 }, journal: Array(500).fill('x') });
  assert.equal(hostile.tones.kindness, 60); assert.equal(hostile.tones.courage, 0);
  assert.deepEqual(hostile.done, ['a1-chime']);
  assert.deepEqual(hostile.picks, { good: 'opt' });
  assert.equal(hostile.chime, null); assert.equal(hostile.bonds.lumi, 0); assert.equal(hostile.bonds.biscuit, 10);
  assert.ok(hostile.journal.length <= 100);
  assert.deepEqual(sanitizeStory('garbage'), emptyStory());
  assert.ok(JSON.stringify(sanitizeAdventure({ story: hostile })).length < 20_000, 'story state stays small');
});

test('save: a finished story is small and viewOf never throws on partial data', () => {
  const { st } = playThrough(() => 0);
  assert.ok(JSON.stringify(st.story).length < 6_000, `story save is ${JSON.stringify(st.story).length} bytes`);
  assert.doesNotThrow(() => viewOf({ ...emptyAdventure(), story: undefined as never }));
});

test('save: only the temple/gate flags travel between partners; everything personal stays personal', () => {
  assert.ok(isSharedFlag('region:temple') && isSharedFlag('sshared:temple-open'));
  assert.ok(!isSharedFlag('story:done') && !isSharedFlag('met:biscuit'));
  const m = mergeShared(emptyAdventure(), ['region:temple', 'sshared:temple-open', 'story-secret', 'clue:harbor']);
  assert.deepEqual(m.added.sort(), ['region:temple', 'sshared:temple-open']);
});

// ================================================================================================================ paired play
test('pairing: both partners compute the SAME outcome, differences are recorded for the recap, nobody has to wait', () => {
  // M leads: from M's side my answer wins; from T's side M's answer wins
  const m = resolvePick('kind', 'bold', 'M'), t = resolvePick('bold', 'kind', 'T');
  assert.equal(m.opt, 'kind'); assert.equal(t.opt, 'kind'); assert.ok(m.differ && t.differ);
  assert.equal(m.followed, 'mine'); assert.equal(t.followed, 'theirs');
  assert.deepEqual(resolvePick('x', 'x', 'T'), { opt: 'x', differ: false, followed: 'mine' });
  assert.deepEqual(resolvePick('x', null, 'T'), { opt: 'x', differ: false, followed: 'mine' }, 'no partner answer: carry on with mine');
  // messages are validated
  assert.deepEqual(parsePick({ t: STORY_PICK, ask: 'a1-chime.first', opt: 'where' }), { ask: 'a1-chime.first', opt: 'where' });
  for (const bad of [null, 5, {}, { t: 'x', ask: 'a', opt: 'b' }, { t: STORY_PICK, ask: '<b>', opt: 'x' }, { t: STORY_PICK, ask: 'a', opt: 'x'.repeat(80) }, { t: STORY_PICK, ask: 3, opt: 'x' }]) assert.equal(parsePick(bad), null);
  // each keeps their own tone; the shared outcome (clues) follows the resolved answer
  const sc = sceneById('a1-chime')!;
  const choices = openScene(sc, viewOf(unlockedSave()), CTX).choices!;
  const kind = choices.find((c) => c.story!.opt === 'others')!.story!, curious = choices.find((c) => c.story!.opt === 'where')!.story!;
  const mine = applyAnswer(unlockedSave(), kind, curious, 'where');   // I chose kindness, the scene followed curiosity
  assert.equal(mine.story.tones.kindness, 1); assert.equal(mine.story.tones.curiosity, 0);
  assert.ok(mine.story.clues.includes('clue:lumi-knew'), 'the shared outcome follows the resolved answer');
  assert.equal(mine.story.picks['a1-chime.first'], 'others'); assert.equal(mine.story.partner['a1-chime.first'], 'where');
  const recap = pairedRecap(mine.story);
  assert.deepEqual(recap.different, ['a1-chime.first']);
});

test('pairing: the answer box delivers late answers, times out, and clears when the partner leaves', async () => {
  const fired: (() => void)[] = []; const timers = { set: (fn: () => void) => { fired.push(fn); return fired.length - 1; }, clear: () => undefined };
  const box = new PickBox(timers);
  const w = box.wait('a'); box.receive('a', 'x'); assert.equal(await w.promise, 'x');
  assert.equal(box.peek('a'), 'x'); assert.equal(await box.wait('a').promise, 'x', 'an answer that arrived early is waiting for you');
  box.forget('a'); assert.equal(box.peek('a'), null);
  const t = box.wait('b', PICK_WAIT_MS); fired[fired.length - 1](); assert.equal(await t.promise, null, 'times out');
  const c = box.wait('c'); box.clear(); assert.equal(await c.promise, null, 'partner left');
  const d = box.wait('d'); d.cancel(); assert.equal(await d.promise, null, 'carry on without waiting');
});

// ================================================================================================================ the tone system
test('tones: recorded consistently, never shown as a score, never punishing, mixed patterns combine', () => {
  let s = emptyStory();
  s = applyStoryFx(s, { tone: ['kindness', 'curiosity'] }, 'kindness');
  assert.equal(s.tones.kindness, 2); assert.equal(s.tones.curiosity, 1);
  assert.match(toneSummary(emptyStory()), /perfectly fine/);
  assert.match(toneSummary(s), /kindness/i);
  assert.ok(!/\d/.test(toneSummary(s)), 'the journal never prints a number');
  for (const t of TONES) { const only = { ...emptyStory(), tones: { ...emptyStory().tones, [t]: 4 } }; assert.equal(finaleVariant(only), t); assert.match(toneSummary(only), new RegExp(t, 'i')); }
  assert.deepEqual(leadingTones({ tones: { kindness: 5, curiosity: 4, courage: 0, patience: 0, playfulness: 0 } }), ['kindness', 'curiosity']);
  // every scene with a question offers a spread of tones (nobody is pushed into one way of being)
  for (const sc of SCENES) { const p = sc.page(viewOf(unlockedSave()), CTX); if (p.ask) assert.ok(new Set(p.ask.opts.map((o) => o.tone)).size >= 3, `${sc.id}: at least three different tones`); }
  // across the whole story each tone is available many times
  const counts: Record<string, number> = {};
  for (const sc of SCENES) sc.page(viewOf(unlockedSave()), CTX).ask?.opts.forEach((o) => { counts[o.tone] = (counts[o.tone] ?? 0) + 1; });
  for (const t of TONES) assert.ok(counts[t] >= 8, `${t} is offered ${counts[t]} times`);
});

// ================================================================================================================ music
test('music: the lullaby, phrases and arrangements are original, bounded, differ by tone, and render without clipping', () => {
  assert.equal(Object.keys(PHRASES).length, 6);
  const s = { ...emptyStory(), phrases: ['wind', 'lantern', 'garden', 'echo', 'rise'] };
  const variants = (['kindness', 'curiosity', 'courage', 'patience', 'playfulness'] as Tone[]).map((t) => arrange({ lead: [t], chime: null, phrases: s.phrases, finale: true }));
  assert.equal(new Set(variants.map((c) => JSON.stringify(c.notes))).size, 5);
  assert.ok(variants[3].seconds > variants[2].seconds * 0.9, 'patience is not rushed');
  const pcm = renderOffline(cueClip('hearthsong', s)!.notes, 11025);
  let peak = 0, energy = 0; for (const x of pcm) { peak = Math.max(peak, Math.abs(x)); energy += x * x; }
  assert.ok(peak > 0.05 && peak <= 0.93, `peak ${peak}`);
  assert.ok(energy / pcm.length > 1e-5, 'not silent');
  assert.deepEqual(Array.from(renderOffline(cueClip('lullaby-1')!.notes, 8000).slice(0, 4000)), Array.from(renderOffline(cueClip('lullaby-1')!.notes, 8000).slice(0, 4000)), 'deterministic');
  // the lullaby is not a karaoke song
  const karaoke = SCENES.flatMap((sc) => (sc.id.includes('karaoke') ? [sc] : []));
  assert.equal(karaoke.length, 0);
});

// ================================================================================================================ world
test('world: every story spot and companion is reachable on foot, in the right region, and the temple map is clean', () => {
  resetRegionCacheForTests();
  const sprites = buildRegionSprites(rasterFactory().factory as never);
  const everything = (() => { let st = unlockedSave(); for (const id of SCENES.map((s) => s.id)) st = completeScene(st, id); st = applyFx(st, { flags: ['region:temple'], mark: ['garden:0', 'garden:1', 'garden:2', 'temple:kindness'] }); return st; })();
  const views = [viewOf(unlockedSave()), viewOf(everything)];
  for (const id of ['old-town', 'city', 'city-park', 'library', 'rooftops', 'harbor', 'forest', 'isles', 'highlands', 'purring-cup', 'temple'] as const) {
    const d = regionDef(id);
    const solids = d.props.filter((p) => !p.when).map(regionPropCollider).filter((x): x is NonNullable<typeof x> => !!x);
    const reach = reachableTiles(d, d.spawn, solids);
    const at = (x: number, y: number) => reach.has(Math.floor(y / RTILE) * d.cols + Math.floor(x / RTILE));
    for (const sp of storySpots(id)) {
      assert.ok(at(sp.point.x, sp.point.y), `${id}/${sp.id} at ${sp.point.x},${sp.point.y} is not reachable on foot`);
      assert.ok(d.spots.some((x) => x.id === sp.id), `${id}/${sp.id} is registered in the region`);
    }
    for (const n of storyNpcs(id)) assert.ok(at(n.x, n.y), `${id}/${n.id} at ${n.x},${n.y} stands somewhere unreachable`);
    const ids = d.spots.map((s) => s.id); assert.equal(new Set(ids).size, ids.length, `${id}: duplicate spot ids`);
    for (const v of views) for (const g of storyGlyphs(id, v)) assert.ok(at(g.x, g.y), `${id}/glyph ${g.id} at ${g.x},${g.y} is not reachable`);
    const issues = auditRegion(d, (p) => { const s = sprites[regionSpriteKey(p.kind, p.variant ?? 0)] as never as { canvas: { width: number; height: number }; ox: number; oy: number } | undefined; return s ? { x: p.x + s.ox, y: p.y + s.oy, w: s.canvas.width, h: s.canvas.height } : null; });
    assert.deepEqual(issues, [], `${id}: map audit`);
  }
  // the village (the original town) too: the chime and Lumi stand in the open
  const solids = buildTown().solids;
  const free = (x: number, y: number) => !solids.some((r) => x >= r.x - 6 && x < r.x + r.w + 6 && y >= r.y - 6 && y < r.y + r.h + 6);
  for (const sp of storySpots('town')) assert.ok(free(sp.point.x, sp.point.y), `town/${sp.id} stands inside something`);
  assert.ok(townNpcs().some((n) => n.id === 'lumi') && townSpots().some((s) => s.scene === 'a1-chime'));
  assert.ok(SPAWN_POINT.x > 0);
});

test('world: spots open exactly the right scene at the right time, with the right glyph', () => {
  const v0 = viewOf(unlockedSave());
  const chime = townSpots().find((s) => s.id === 'story-chime')!;
  assert.ok(chime.when!(v0) && sceneForSpot('story-chime', v0)?.id === 'a1-chime');
  assert.ok(!chime.when!(viewOf(emptyAdventure())), 'nothing happens before Lumi is found');
  assert.equal(storyGlyphs('town', viewOf(emptyAdventure())).length, 0);
  assert.equal(storyGlyphs('town', v0)[0].state, 'old');
  const gate = storySpots('old-town').filter((s) => s.id.startsWith('story-gate'));
  assert.ok(gate.length >= 1);
  const open = viewOf(completeScene(completeScene(unlockedSave(), 'a1-chime-repair'), 'a2-gate'));
  assert.equal(storyGlyphs('old-town', open).find((g) => g.id === 'gate')!.state, 'open', 'the gate is drawn open once the scene has opened it');
  assert.equal(storyGlyphs('old-town', viewOf(completeScene(unlockedSave(), 'a1-chime-repair'))).find((g) => g.id === 'gate')!.state, 'closed');
  // Mr. Velvet's conversation depends on where he stands
  assert.equal(sceneForNpc('velvet', 'old-town', viewOf(completeScene(unlockedSave(), 'a1-chime-repair')))?.id, 'a1-gate');
  // the gate exit appears only when the trail is open
  const exit = storySpots('old-town').find((s) => s.id === 'story-gate-passage')!;
  assert.ok(!exit.when!(v0) && exit.when!(viewOf(applyFx(unlockedSave(), { flags: ['region:temple'] }))));
  assert.equal(exit.to!.region, 'temple');
  const t = buildTemple();
  assert.equal(t.id, 'temple'); assert.ok(t.spots.some((s) => s.id === 'temple-exit' && s.to?.region === 'old-town'));
});

test('world: the Wind Steps ask you to hold still, and nothing else does', () => {
  const holds = SCENES.filter((s) => s.hold);
  assert.deepEqual(holds.map((s) => s.id), ['a2-wind']);
  assert.ok(holds[0].hold! >= 3000 && holds[0].hold! <= 8000);
  assert.equal(storySpots('rooftops').find((s) => s.id === 'story-windsteps')!.hold, holds[0].hold);
});
