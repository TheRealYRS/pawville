/**
 * The story engine (pure): which scene is available where, how a scene becomes a conversation, what answering does,
 * where Lumi and Velvet are, and what the player's current objective is.
 *
 * Rules the engine guarantees (and the tests check):
 *  - every scene is reachable from the start, in order, with ANY combination of choices (no soft-locks);
 *  - essential information has at least two sources (a clue spot, a resident and Lumi's notebook);
 *  - answering is idempotent: re-opening a half-finished scene resumes after the answers already given;
 *  - effects apply once; journal entries, clues, phrases and scene ids are sets (a replay can never duplicate them).
 */
import type { AdvView, AdventureState, RegionId } from '../adventure/state.ts';
import { addFlags } from '../adventure/state.ts';
import type { DialogueChoice, DialoguePage, StoryChoiceMeta } from '../adventure/dialogue.ts';
import { applyStoryFx, finaleVariant, recordPartnerPick, recordPick, type StoryFx } from './model.ts';
import type { Ctx, L, Opt, Page, Scene } from './kit.ts';
import { ACT1 } from './script1.ts';
import { CAMEOS, CLUES } from './script_clues.ts';
import { ACT2 } from './script2.ts';
import { ACT3 } from './script3.ts';
import { CAST, speakerName } from './cast.ts';

/** Order matters: the first available scene for an NPC / spot wins. */
export const SCENES: readonly Scene[] = [...ACT1, ...CLUES, ...ACT2, ...CAMEOS, ...ACT3];
const BY_ID = new Map(SCENES.map((s) => [s.id, s]));
export const sceneById = (id: string): Scene | undefined => BY_ID.get(id);

export const sceneAvailable = (s: Scene, v: AdvView): boolean => v.story.unlocked && !v.story.done(s.id) && s.avail(v);

export function sceneForNpc(npc: string, region: string, v: AdvView): Scene | null {
  return SCENES.find((s) => s.npc === npc && s.region === region && sceneAvailable(s, v)) ?? null;
}
export function sceneForSpot(spotId: string, v: AdvView): Scene | null {
  return SCENES.find((s) => s.spot?.id === spotId && sceneAvailable(s, v)) ?? null;
}
/** A scene that is finished but still has something to say when you come back (null = normal conversation). */
export function afterPage(scene: Scene, v: AdvView, c: Ctx): Page | null {
  return scene.after ? scene.after(v, c) : null;
}
export function afterSceneForNpc(npc: string, region: string, v: AdvView, c: Ctx): { scene: Scene; page: Page } | null {
  for (const s of SCENES) {
    if (s.npc !== npc || s.region !== region || !v.story.done(s.id)) continue;
    const page = afterPage(s, v, c);
    if (page) return { scene: s, page };
  }
  return null;
}
export function afterSceneForSpot(spotId: string, v: AdvView, c: Ctx): { scene: Scene; page: Page } | null {
  const s = SCENES.find((x) => x.spot?.id === spotId && v.story.done(x.id));
  if (!s) return null;
  const page = afterPage(s, v, c);
  return page ? { scene: s, page } : null;
}

// ---- conversation building -----------------------------------------------------------------------------------------

export interface StoryDialogue {
  title: string;
  lines: string[];
  who: string[];
  choices?: DialogueChoice[];
  scene: Scene | null;
  /** The scene finishes when the player closes the last line (it has no question to answer). */
  finishOnClose: boolean;
  listen?: { label: string; cue: string };
  /** The first speaker's portrait key. */
  lead: string;
}

const texts = (ls: readonly L[]) => ls.map((l) => l.t);
const whos = (ls: readonly L[]) => ls.map((l) => l.w);
const isTerminal = (o: Opt) => !o.next || !o.next.ask;

function toChoice(scene: Scene, ask: { id: string; secret?: boolean }, o: Opt): DialogueChoice {
  const meta: StoryChoiceMeta = { scene: scene.id, ask: ask.id, opt: o.id, tone: o.tone, fx: o.fx, secret: ask.secret, finish: isTerminal(o) };
  return { label: o.label, tone: o.tone, reply: texts(o.say), replyWho: whos(o.say), then: o.next ? toPage(scene, o.next) : undefined, story: meta };
}
function toPage(scene: Scene, page: Page): DialoguePage {
  return {
    lines: texts(page.say), who: whos(page.say),
    choices: page.ask ? page.ask.opts.map((o) => toChoice(scene, page.ask!, o)) : undefined,
    listen: page.listen,
  };
}

/**
 * Build the first screen of a scene. If some questions were already answered (the player closed the window midway),
 * the conversation resumes AFTER them instead of asking again.
 */
export function openScene(scene: Scene, v: AdvView, c: Ctx, pageOverride?: Page): StoryDialogue {
  let page: Page | undefined = pageOverride ?? scene.page(v, c);
  const lines: L[] = [];
  let listen = page.listen;
  let choices: DialogueChoice[] | undefined;
  let finish = false;
  let guard = 0;
  while (page && guard++ < 8) {
    lines.push(...page.say);
    listen = page.listen ?? listen;
    if (!page.ask) { finish = !pageOverride; break; }
    const answered = v.story.pick(page.ask.id);
    const o: Opt | undefined = answered ? page.ask.opts.find((x) => x.id === answered) : undefined;
    if (!o) { choices = page.ask.opts.map((x) => toChoice(scene, page!.ask!, x)); break; }
    lines.push(...o.say);
    page = o.next;
    if (!page) break;
  }
  const lead = lines.find((l) => l.w !== 'narr')?.w ?? 'narr';
  return { title: scene.title, lines: texts(lines), who: whos(lines), choices, scene, finishOnClose: finish && !choices, listen, lead };
}

/** A plain page with no scene attached (a companion's hint). */
export function openPlain(title: string, page: Page): StoryDialogue {
  const lines = page.say;
  return { title, lines: texts(lines), who: whos(lines), choices: undefined, scene: null, finishOnClose: false, listen: page.listen, lead: lines.find((l) => l.w !== 'narr')?.w ?? 'narr' };
}

export function openAfter(scene: Scene, page: Page): StoryDialogue {
  const lines = page.say;
  const lead = lines.find((l) => l.w !== 'narr')?.w ?? 'narr';
  return { title: scene.title, lines: texts(lines), who: whos(lines), choices: undefined, scene, finishOnClose: false, listen: page.listen, lead };
}

/** What the speaker label and portrait should be for a line. Narration shows the scene title. */
export function speakerOf(who: string | undefined, fallback: string): string {
  return speakerName(who, fallback);
}
export const castOf = (who: string | undefined) => (who ? CAST[who] : undefined);

// ---- applying choices and finishing scenes -----------------------------------------------------------------------------

/** Adds the adventure flags a story effect asks for. */
function withFlags(st: AdventureState, fx: StoryFx | undefined): AdventureState {
  return fx?.flags?.length ? addFlags(st, fx.flags).state : st;
}

/** Mark a scene done and apply its completion effects (once). */
export function completeScene(st: AdventureState, sceneId: string): AdventureState {
  const scene = sceneById(sceneId);
  if (!scene || st.story.done.includes(sceneId)) return st;
  let story = applyStoryFx(st.story, scene.done, undefined, sceneId);
  if (sceneId === 'a3-hearthsong') story = { ...story, finale: finaleVariant(story) };
  if (sceneId === 'a3-letgo' && !story.journal.includes('ep-lumi-drawings')) story = applyStoryFx(story, { journal: ['ep-lumi-drawings'] });
  if (sceneId === 'a2-gate') story = applyStoryFx(story, { journal: ['act2-recap'] });
  return withFlags({ ...st, story }, scene.done);
}

/**
 * Apply an answer. `own` is what I chose; `resolved` is what the scene follows (the same unless a partner chose
 * differently and the shared outcome was settled by the pairing rules). Each player keeps THEIR OWN tone.
 */
export function applyAnswer(st: AdventureState, own: StoryChoiceMeta, resolved: StoryChoiceMeta = own, partnerOpt?: string): AdventureState {
  let story = recordPick(st.story, own.ask, own.opt);
  if (partnerOpt && partnerOpt !== own.opt) story = recordPartnerPick(story, own.ask, partnerOpt);
  // my tone is mine; everything else (clues, phrases, flags, the chime…) is the shared outcome
  story = applyStoryFx(story, own === resolved ? own.fx : { ...resolved.fx, tone: undefined }, own.tone);
  let next = withFlags({ ...st, story }, resolved.fx);
  if (resolved.finish) next = completeScene(next, resolved.scene);
  return next;
}

/** Complete a scene that ended without a question (called when the player closes the last line). */
export function finishScene(st: AdventureState, sceneId: string): AdventureState {
  return completeScene(st, sceneId);
}

// ---- Lumi and Velvet: where are they? --------------------------------------------------------------------------------

export interface LumiPlace { region: RegionId; at: string }

/**
 * Lumi is a companion only while the story needs her; otherwise she lives on the Dreaming Isles as before.
 *  - before the chime: nowhere special (the isles);  - Act I: with you at the next stop;  - Act II: at the chime in the village,
 *  with a jar of her glow in your bag;  - Act III: at the temple;  - epilogue: back on the isles (and in the journal).
 */
export function lumiAt(v: AdvView): LumiPlace | null {
  const s = v.story;
  if (!s.unlocked || !s.done('a1-chime') || s.act() === 4) return null;
  if (!s.done('a1-biscuit')) return { region: 'city', at: 'biscuit' };
  if (!s.done('a1-clues')) return { region: 'town', at: 'chime' };
  if (!s.done('a1-chime-repair')) return { region: 'old-town', at: 'repair' };
  if (!s.done('a1-gate')) return { region: 'old-town', at: 'gate' };
  if (!s.done('a1-end')) return { region: 'city', at: 'biscuit' };
  if (!s.done('a2-gate')) return { region: 'town', at: 'chime' };
  return { region: 'temple', at: 'temple' };
}

// ---- the objective line (journal + tracker) --------------------------------------------------------------------------------

export interface Objective { act: 0 | 1 | 2 | 3 | 4; title: string; text: string; hint: string; scene?: string }

const ACT_TITLES = ['The Song Beneath the Stars', 'Act I · The Song with a Missing Step', 'Act II · The Trail That Remembers', 'Act III · The Temple of Many Voices', 'Epilogue · The Town Keeps Singing'];

export function storyObjective(v: AdvView): Objective {
  const s = v.story, act = s.act();
  if (act === 0) return { act, title: ACT_TITLES[0], text: 'Not yet.', hint: 'Help Lumi find the way home (“The Lost Star”). Afterwards, something curious will happen in the village.' };
  const order = ['a1-chime', 'a1-biscuit', 'a1-clues', 'a1-chime-repair', 'a1-gate', 'a1-end', 'a2-places', 'a2-biscuit-truth', 'a2-velvet-account', 'a2-arrange', 'a2-gate', 'a3-quiet', 'a3-phrase', 'a3-hearthsong', 'a3-letgo', 'ep-purring', 'ep-evening', 'ep-velvet'];
  for (const id of order) {
    if (id === 'a2-places') {
      if (!s.done('a1-end') || s.phraseCount() >= 5) continue;
      const left = ['wind', 'lantern', 'garden', 'echo', 'rise'].filter((p) => !s.phrase(p));
      const next = sceneById(`a2-${left[0]}`)!;
      return { act, title: ACT_TITLES[act], text: `Follow the five notes: ${5 - left.length}/5 places found. ${next.goal}`, hint: next.hint, scene: next.id };
    }
    const sc = sceneById(id)!;
    if (s.done(id)) continue;
    // Act II side scenes that wait for the places keep the objective on the places
    if ((id === 'a2-biscuit-truth' || id === 'a2-velvet-account') && s.phraseCount() < (id === 'a2-biscuit-truth' ? 2 : 3)) continue;
    if (id === 'a2-arrange' && !(s.done('a2-biscuit-truth') && s.done('a2-velvet-account'))) {
      return { act, title: ACT_TITLES[act], text: !s.done('a2-biscuit-truth') ? sceneById('a2-biscuit-truth')!.goal : sceneById('a2-velvet-account')!.goal, hint: !s.done('a2-biscuit-truth') ? sceneById('a2-biscuit-truth')!.hint : sceneById('a2-velvet-account')!.hint };
    }
    if (id === 'a1-clues' && s.cluesFound() === 0) return { act, title: ACT_TITLES[1], text: sceneById('a1-lumi-help')!.goal, hint: sceneById('a1-lumi-help')!.hint, scene: 'a1-lumi-help' };
    if (id === 'ep-evening' && !s.done('ep-purring')) continue;
    return { act: id.startsWith('ep') ? 4 : act, title: ACT_TITLES[id.startsWith('ep') ? 4 : act], text: sc.goal, hint: sc.hint, scene: sc.id };
  }
  return { act: 4, title: ACT_TITLES[4], text: 'Nothing is required of you. The chimes are singing; the temple is open; the town keeps going.', hint: 'Visit the temple whenever you like, or sit in on the music evening at The Purring Cup.' };
}

/** The gentle fallback when you talk to a companion who has no scene right now: they point you onward, in their own voice. */
export function companionTalk(npc: 'lumi' | 'biscuit' | 'velvet', v: AdvView): Page {
  const o = storyObjective(v);
  const hintLine = o.hint;
  if (npc === 'lumi') return { say: [{ w: 'lumi', t: v.story.act() >= 3 ? 'It’s so lovely in here. I keep humming and then stopping to listen to what comes back.' : `I’m so glad you came. ${hintLine}` }, { w: 'lumi', t: 'Sorry — I’m rambling. Is that a lot? It’s a lot. I’ll stop. …Not yet.' }] };
  if (npc === 'biscuit') return { say: [{ w: 'biscuit', t: v.story.act() >= 3 ? 'I keep checking whether it’s still there. The song. It is. Every time. It’s infuriating.' : 'Still humming. Still stuck on the fourth stair. Go on — the town remembers what I’ve forgotten.' }] };
  return { say: [{ w: 'velvet', t: v.story.act() >= 3 ? 'The temple has more visitors than I had planned for. I had not planned for any. A very instructive error.' : 'The gate remains as it is. I am, however, listening.' }] };
}

/** Apply a story effect to the adventure save (story fields + any adventure flags it asks for). Used by spots. */
export function applyFx(st: AdventureState, fx: StoryFx): AdventureState {
  return withFlags({ ...st, story: applyStoryFx(st.story, fx) }, fx);
}
