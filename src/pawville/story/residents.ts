/**
 * The residents' personalities, made playable (pure). Reuses what already exists — AdventureState.choices (their remembered answers),
 * AdventureState.friends (familiarity), the dialogue sheet's choices — and adds NO new subsystem.
 *
 * For every character (see ROSTER_IDS) a profile gives: something they care about, a worry, a quirk, a personality conversation with
 * two or three replies, a follow-up that opens on its own trigger (weather, time of day, a world event or a story step — and always
 * once the second act is over), and what they remember afterwards. Persistence keys: `${id}:topic` and `${id}:follow` (the option id).
 *
 * Cross-NPC memory is limited to what is plausible: a resident only hears about your answer to THEIR FRIEND, and only local events
 * (`hear`) the character could actually know. Nobody magically knows everything you did.
 */
import { PROFILES_A } from './residentsA.ts';
import { PROFILES_B } from './residentsB.ts';
import { PROFILES_C } from './residentsC.ts';
import { toneOfChoice, type Tone } from './model.ts';
import type { RChoice, RProfile } from './residentTypes.ts';
import type { AdvView } from '../adventure/state.ts';
import { npcName, type DialogueChoice } from '../adventure/dialogue.ts';
import { NEW_RESIDENTS } from '../living/roster.ts';

export const PROFILES: readonly RProfile[] = [...PROFILES_A, ...PROFILES_B, ...PROFILES_C];
const BY_ID = new Map(PROFILES.map((p) => [p.id, p]));
export const profileOf = (id: string): RProfile | undefined => BY_ID.get(id);
/** The stray cat of the forest shares an id with the town's lantern keeper: the story quest uses `bramble` in the forest. */
export const profileKey = (npc: string, region: string): string => (npc === 'bramble' && region === 'forest' ? 'bramble-stray' : npc);

export const optId = (kind: 'topic' | 'follow', i: number) => `${kind === 'topic' ? 't' : 'f'}${i}`;
const keyOf = (id: string, kind: 'topic' | 'follow') => `${id}:${kind}`;

export function pickedChoice(p: RProfile, v: Pick<AdvView, 'choice'>, kind: 'topic' | 'follow'): RChoice | undefined {
  const o = v.choice(keyOf(p.id, kind));
  const list = kind === 'topic' ? p.opts : p.fopts;
  return o ? list[Number(o.slice(1))] : undefined;
}

export interface Ctx { phase: string; rain: boolean }
/** Does the follow-up's trigger hold right now? */
export function triggerHolds(trig: string, v: AdvView, c: Ctx): boolean {
  if (v.story.done('a2-gate')) return true; // after the second act every follow-up is open: weather never locks anyone out
  if (trig === 'rain') return c.rain;
  if (trig === 'night') return c.phase === 'night' || c.phase === 'evening';
  if (trig === 'morning') return c.phase === 'morning';
  if (trig === 'day') return c.phase === 'morning' || c.phase === 'afternoon';
  if (trig.startsWith('flag:')) return v.has(trig.slice(5));
  if (trig.startsWith('story:')) return v.story.done(trig.slice(6));
  return false;
}
/** Human text for the journal ("when will they open up?") — never a puzzle. */
export function triggerHint(trig: string): string {
  if (trig === 'rain') return 'on a rainy day'; if (trig === 'night') return 'in the evening'; if (trig === 'morning') return 'in the morning'; if (trig === 'day') return 'during the day';
  if (trig.startsWith('flag:')) return 'after something changes in the world'; if (trig.startsWith('story:')) return 'once the old song has begun to matter';
  return 'in time';
}

/** Display name of a character (the roster first, then the quest characters’ names). */
export function nameOf(id: string): string { return id === 'bramble-stray' ? 'Bramble' : NEW_RESIDENTS.find((r) => r.id === id)?.name ?? npcName(id); }

const toDialogueChoice = (id: string, kind: 'topic' | 'follow', list: readonly RChoice[]): DialogueChoice[] =>
  list.map((o, i) => ({ label: o.label, tone: o.tone, reply: [o.reply], friend: 1, remember: { key: keyOf(id, kind), value: optId(kind, i) } }));

/** What a character remembers and says beyond their usual lines (callbacks, a friend's gossip, local news, a quirk). */
export function memoryLines(p: RProfile, v: AdvView, c: Ctx): string[] {
  const out: string[] = [];
  const t = pickedChoice(p, v, 'topic');
  if (t?.back) out.push(t.back);
  const friend = p.friend ? profileOf(p.friend) : undefined;
  if (friend) { const ft = pickedChoice(friend, v, 'topic'); if (ft?.told) out.push(`${nameOf(friend.id)} mentioned you ${ft.told}. News travels between friends.`); }
  if (p.hear) {
    const [cond, line] = p.hear;
    const ok = cond.startsWith('story:') ? v.story.done(cond.slice(6)) : v.has(cond.startsWith('flag:') ? cond.slice(5) : cond) || v.done(cond);
    if (ok) out.push(line);
  }
  if (v.story.epilogue() && v.story.cameo(p.id)) out.push('Did you hear the music evening? The whole town sang. I still hum it.');
  else if (v.story.act() >= 2 && (p.id.length + (c.rain ? 1 : 0)) % 4 === 0) out.push(p.quirk);
  return out;
}

/**
 * Wraps a base conversation (the existing hand-written lines or the voice-based chatter) with the character's personality layer.
 * Never replaces a base conversation that already offers choices (first meetings, quest offers).
 */
export function layerConversation<T extends { lines: string[]; choices?: DialogueChoice[] }>(base: T, p: RProfile, v: AdvView, c: Ctx): T {
  if (base.choices?.length) return base;
  const topicDone = !!v.choice(keyOf(p.id, 'topic'));
  const followDone = !!v.choice(keyOf(p.id, 'follow'));
  if (!topicDone) return { ...base, lines: [...base.lines, p.q], choices: toDialogueChoice(p.id, 'topic', p.opts) };
  const memory = memoryLines(p, v, c);
  if (!followDone && triggerHolds(p.ftrig, v, c)) return { ...base, lines: [...base.lines, ...memory.slice(0, 1), p.fq], choices: toDialogueChoice(p.id, 'follow', p.fopts) };
  return { ...base, lines: [...base.lines, ...memory] };
}

/** The tone an answer adds to the gentle tendency (resident chats count too). */
export const answerTone = (tone: string): Tone | null => toneOfChoice(tone);

export interface PeopleEntry { id: string; cares: string; worry: string; memory: string | null; follow: string | null; locked: string | null }
/** The journal's "People" page: what you have learned about each character, in memory form. */
export function peopleEntries(v: AdvView, nameFor: (id: string) => string): (PeopleEntry & { name: string })[] {
  const out: (PeopleEntry & { name: string })[] = [];
  for (const p of PROFILES) {
    const t = pickedChoice(p, v, 'topic');
    if (!t) continue;
    const f = pickedChoice(p, v, 'follow');
    out.push({ id: p.id, name: nameFor(p.id), cares: p.cares, worry: p.worry, memory: t.told ? `You ${t.told}.` : null, follow: f ? `They opened up later: you ${f.label.charAt(0).toLowerCase()}${f.label.slice(1)}` : null, locked: f ? null : `They may say more ${triggerHint(p.ftrig)}.` });
  }
  return out;
}

export const ROSTER_IDS: readonly string[] = PROFILES.map((p) => p.id);
