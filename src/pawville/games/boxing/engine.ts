/**
 * Cat Boxing — a gentle, cartoon boxing game with soft paw gloves (pure fixed-step engine).
 *
 * The simulation runs at 30 ticks per second and is deterministic for a given input stream,
 * which makes it testable and lets ONE side run it authoritatively in online matches.
 *
 * Moves (ticks @30/s)          startup  active  recovery  damage  range  notes
 *   jab   (J / tap)                3       2        5        6      18
 *   heavy (K / hold-tap)           9       3       12       14      22    knockback + dizzy stun
 *   flurry (L, needs full meter)   4      12       10      4×4     20    hits every 3 ticks
 *   block (S / hold)               —       —        —      −80%     —    slow walk, heavy pushes back
 *   dodge (Space)                  —   6 invulnerable —       —      —    hops back, 30-tick cooldown
 * Attacks can't be cancelled and each has a cooldown, so there are no infinite jab loops:
 * jab hit-stun (6) is shorter than a jab's total time (10), so the defender can always act.
 * Rounds: 45 s or knockout (0 fluff). Best of 3 (draw rounds don't count, max 5 rounds).
 */
import { seededRandom } from '../../world/geometry.ts';

export const TICK_HZ = 30;
export const ROUND_TICKS = 45 * TICK_HZ;
export const BETWEEN_ROUNDS_TICKS = 2 * TICK_HZ;
export const ARENA = { min: 6, max: 94 };
export const BODY_GAP = 11;
export const MAX_HP = 100;
export const METER_MAX = 100;
export const WALK = 1.1; // units per tick
export const ROUNDS_TO_WIN = 2;
export const MAX_ROUNDS = 5;

export type AttackKind = 'jab' | 'heavy' | 'flurry';
export type ActionKind = 'idle' | AttackKind | 'dodge' | 'stun';

export const MOVES: Record<AttackKind, { startup: number; active: number; recovery: number; damage: number; range: number; cooldown: number; stun: number; knock: number }> = {
  jab: { startup: 3, active: 2, recovery: 5, damage: 6, range: 18, cooldown: 10, stun: 6, knock: 2 },
  heavy: { startup: 9, active: 3, recovery: 12, damage: 14, range: 22, cooldown: 30, stun: 14, knock: 8 },
  flurry: { startup: 4, active: 12, recovery: 10, damage: 4, range: 20, cooldown: 40, stun: 4, knock: 1 },
};
export const DODGE = { ticks: 10, invulnerable: 6, distance: 1.6, cooldown: 30 };

export interface Input {
  move: -1 | 0 | 1; // -1 = towards the left edge
  jab?: boolean;
  heavy?: boolean;
  flurry?: boolean;
  block?: boolean;
  dodge?: boolean;
}
export const NO_INPUT: Input = { move: 0 };

export interface Fighter {
  x: number;
  hp: number;
  meter: number;
  action: ActionKind;
  frame: number; // ticks into the current action
  length: number; // total ticks of the current action
  hitThisAction: number; // ticks at which the current attack already connected (flurry hits several times)
  blocking: boolean;
  cooldown: Record<AttackKind | 'dodge', number>;
  landed: number;
  thrown: number;
  lastHitAt: number; // tick of last time this fighter got hit (for reactions)
}

export type Phase = 'fight' | 'round-over' | 'match-over';

export interface BoxState {
  tick: number;
  roundTick: number;
  round: number;
  phase: Phase;
  phaseTicks: number;
  fighters: [Fighter, Fighter];
  wins: [number, number];
  roundWinner: 0 | 1 | 'draw' | null;
  matchWinner: 0 | 1 | null;
  forfeit: 0 | 1 | null;
  events: BoxEvent[]; // events produced by the last step (for sound/feedback)
}

export type BoxEvent =
  | { type: 'hit'; by: 0 | 1; move: AttackKind; blocked: boolean; damage: number }
  | { type: 'whiff'; by: 0 | 1; move: AttackKind }
  | { type: 'dodged'; by: 0 | 1 }
  | { type: 'ko'; loser: 0 | 1 }
  | { type: 'round'; winner: 0 | 1 | 'draw' }
  | { type: 'match'; winner: 0 | 1 };

function fighter(x: number): Fighter {
  return {
    x, hp: MAX_HP, meter: 0, action: 'idle', frame: 0, length: 0, hitThisAction: 0, blocking: false,
    cooldown: { jab: 0, heavy: 0, flurry: 0, dodge: 0 }, landed: 0, thrown: 0, lastHitAt: -999,
  };
}

export function createBox(): BoxState {
  return {
    tick: 0, roundTick: 0, round: 1, phase: 'fight', phaseTicks: 0, fighters: [fighter(30), fighter(70)], wins: [0, 0],
    roundWinner: null, matchWinner: null, forfeit: null, events: [],
  };
}

const facing = (s: BoxState, i: 0 | 1) => (s.fighters[i].x <= s.fighters[1 - i].x ? 1 : -1);
export const isAttack = (a: ActionKind): a is AttackKind => a === 'jab' || a === 'heavy' || a === 'flurry';
export const busy = (f: Fighter) => f.action !== 'idle';

export function attackPhase(f: Fighter): 'startup' | 'active' | 'recovery' | null {
  if (!isAttack(f.action)) return null;
  const m = MOVES[f.action];
  if (f.frame < m.startup) return 'startup';
  if (f.frame < m.startup + m.active) return 'active';
  return 'recovery';
}

export function invulnerable(f: Fighter): boolean {
  return f.action === 'dodge' && f.frame < DODGE.invulnerable;
}

function startAction(f: Fighter, a: ActionKind, length: number): Fighter {
  return { ...f, action: a, frame: 0, length, hitThisAction: 0, blocking: false };
}

function cloneFighter(f: Fighter): Fighter {
  return { ...f, cooldown: { ...f.cooldown } };
}

/** Advance one tick with both players' inputs. Pure: returns a new state. */
export function stepBox(prev: BoxState, inputs: [Input, Input]): BoxState {
  if (prev.phase === 'match-over') return { ...prev, events: [] };
  const s: BoxState = { ...prev, tick: prev.tick + 1, events: [], fighters: [cloneFighter(prev.fighters[0]), cloneFighter(prev.fighters[1])], wins: [...prev.wins] as [number, number] };
  if (s.phase === 'round-over') {
    s.phaseTicks++;
    if (s.phaseTicks >= BETWEEN_ROUNDS_TICKS) {
      const wins = s.wins;
      return { ...createBox(), tick: s.tick, round: s.round + 1, wins, events: [] };
    }
    return s;
  }
  s.roundTick++;
  for (const i of [0, 1] as const) {
    const f = s.fighters[i];
    for (const k of Object.keys(f.cooldown) as (keyof Fighter['cooldown'])[]) f.cooldown[k] = Math.max(0, f.cooldown[k] - 1);
    const inp = inputs[i];
    // advance current action
    if (f.action !== 'idle') {
      f.frame++;
      if (f.action === 'dodge') f.x -= facing(s, i) * DODGE.distance * (f.frame <= 6 ? 1 : 0.3);
      if (f.frame >= f.length) {
        f.action = 'idle';
        f.frame = 0;
        f.length = 0;
      }
    }
    // start new things only when idle
    f.blocking = false;
    if (f.action === 'idle') {
      if (inp.dodge && f.cooldown.dodge === 0) {
        Object.assign(f, startAction(f, 'dodge', DODGE.ticks));
        f.cooldown.dodge = DODGE.cooldown;
      } else if (inp.flurry && f.meter >= METER_MAX && f.cooldown.flurry === 0) {
        const m = MOVES.flurry;
        Object.assign(f, startAction(f, 'flurry', m.startup + m.active + m.recovery));
        f.cooldown.flurry = m.cooldown;
        f.meter = 0;
        f.thrown++;
      } else if (inp.heavy && f.cooldown.heavy === 0) {
        const m = MOVES.heavy;
        Object.assign(f, startAction(f, 'heavy', m.startup + m.active + m.recovery));
        f.cooldown.heavy = m.cooldown;
        f.thrown++;
      } else if (inp.jab && f.cooldown.jab === 0) {
        const m = MOVES.jab;
        Object.assign(f, startAction(f, 'jab', m.startup + m.active + m.recovery));
        f.cooldown.jab = m.cooldown;
        f.thrown++;
      } else {
        f.blocking = !!inp.block;
        f.x += inp.move * WALK * (f.blocking ? 0.4 : 1);
      }
    }
  }
  // keep bodies apart and inside the ring
  const [a, b] = s.fighters;
  const left = a.x <= b.x ? a : b;
  const right = left === a ? b : a;
  if (right.x - left.x < BODY_GAP) {
    const mid = (left.x + right.x) / 2;
    left.x = mid - BODY_GAP / 2;
    right.x = mid + BODY_GAP / 2;
  }
  for (const f of s.fighters) f.x = Math.min(ARENA.max, Math.max(ARENA.min, f.x));
  if (right.x - left.x < BODY_GAP) {
    if (left.x <= ARENA.min) right.x = left.x + BODY_GAP;
    else left.x = right.x - BODY_GAP;
  }

  // resolve hits — decided from the same snapshot for both sides, so simultaneous hits trade fairly
  const pre = [{ ...s.fighters[0] }, { ...s.fighters[1] }] as const;
  const landing: { i: 0 | 1; move: AttackKind }[] = [];
  for (const i of [0, 1] as const) {
    const att = s.fighters[i];
    const def = pre[1 - i];
    if (!isAttack(att.action)) continue;
    const m = MOVES[att.action];
    const inActive = att.frame >= m.startup && att.frame < m.startup + m.active;
    if (!inActive) {
      if (att.frame === m.startup + m.active && att.hitThisAction === 0) s.events.push({ type: 'whiff', by: i, move: att.action });
      continue;
    }
    if (att.hitThisAction === -1) continue;
    const due = att.action === 'flurry' ? (att.frame - m.startup) % 3 === 0 : att.hitThisAction === 0;
    if (!due || Math.abs(att.x - def.x) > m.range) continue;
    if (invulnerable(def)) {
      if (att.hitThisAction === 0) s.events.push({ type: 'dodged', by: (1 - i) as 0 | 1 });
      att.hitThisAction = -1; // a dodged attack can't land late
      continue;
    }
    landing.push({ i, move: att.action });
  }
  for (const { i, move } of landing) {
    const att = s.fighters[i];
    const def = s.fighters[1 - i];
    const m = MOVES[move];
    const blocked = pre[1 - i].blocking;
    const damage = blocked ? Math.max(1, Math.round(m.damage * 0.2)) : m.damage;
    def.hp = Math.max(0, def.hp - damage);
    def.lastHitAt = s.tick;
    att.hitThisAction = Math.max(0, att.hitThisAction) + 1;
    att.landed++;
    att.meter = Math.min(METER_MAX, att.meter + (blocked ? 4 : 12));
    def.meter = Math.min(METER_MAX, def.meter + 6);
    const dir = pre[i].x <= pre[1 - i].x ? 1 : -1;
    def.x = Math.min(ARENA.max, Math.max(ARENA.min, def.x + dir * (blocked ? m.knock * 0.5 + (move === 'heavy' ? 3 : 0) : m.knock)));
    if (!blocked) Object.assign(def, startAction(def, 'stun', m.stun)); // cartoon wobble
    s.events.push({ type: 'hit', by: i, move, blocked, damage });
  }

  // round end
  const ko = s.fighters.findIndex((f) => f.hp <= 0) as -1 | 0 | 1;
  const timeUp = s.roundTick >= ROUND_TICKS;
  if (ko !== -1 || timeUp) {
    let winner: 0 | 1 | 'draw';
    if (ko !== -1) {
      winner = (1 - ko) as 0 | 1;
      if (s.fighters[0].hp <= 0 && s.fighters[1].hp <= 0) winner = 'draw';
      else s.events.push({ type: 'ko', loser: ko });
    } else {
      const [h0, h1] = [s.fighters[0].hp, s.fighters[1].hp];
      winner = h0 === h1 ? 'draw' : h0 > h1 ? 0 : 1;
    }
    if (winner !== 'draw') s.wins[winner]++;
    s.events.push({ type: 'round', winner });
    s.roundWinner = winner;
    const decided = s.wins[0] >= ROUNDS_TO_WIN || s.wins[1] >= ROUNDS_TO_WIN;
    const outOfRounds = s.round >= MAX_ROUNDS;
    if (decided || outOfRounds) {
      const mw: 0 | 1 | null = s.wins[0] === s.wins[1] ? (s.fighters[0].hp >= s.fighters[1].hp ? 0 : 1) : s.wins[0] > s.wins[1] ? 0 : 1;
      s.phase = 'match-over';
      s.matchWinner = mw;
      s.events.push({ type: 'match', winner: mw });
    } else {
      s.phase = 'round-over';
      s.phaseTicks = 0;
    }
  }
  return s;
}

/** A player left: the other wins immediately. */
export function forfeit(s: BoxState, quitter: 0 | 1): BoxState {
  if (s.phase === 'match-over') return s;
  const winner = (1 - quitter) as 0 | 1;
  return { ...s, phase: 'match-over', matchWinner: winner, forfeit: quitter, events: [{ type: 'match', winner }] };
}

// ------------------------------------------------------------------ AI
export type BoxAiLevel = 'easy' | 'medium' | 'hard';
const AI: Record<BoxAiLevel, { think: number; aggression: number; blockChance: number; dodgeChance: number; reaction: number }> = {
  easy: { think: 9, aggression: 0.35, blockChance: 0.2, dodgeChance: 0.05, reaction: 10 },
  medium: { think: 6, aggression: 0.55, blockChance: 0.45, dodgeChance: 0.15, reaction: 6 },
  hard: { think: 3, aggression: 0.7, blockChance: 0.7, dodgeChance: 0.3, reaction: 3 },
};

export interface AiMemory {
  plan: Input;
  until: number;
  rand: () => number;
}

export function createAi(seed: number): AiMemory {
  return { plan: NO_INPUT, until: 0, rand: seededRandom(seed) };
}

/** Decides fighter `me`'s input from the visible state only (no peeking at the future). */
export function aiInput(s: BoxState, me: 0 | 1, level: BoxAiLevel, mem: AiMemory): Input {
  const cfg = AI[level];
  const self = s.fighters[me];
  const foe = s.fighters[1 - me];
  const dir = self.x <= foe.x ? 1 : -1;
  const dist = Math.abs(self.x - foe.x);
  const foePhase = attackPhase(foe);
  // React to an incoming attack that has been visible for `reaction` ticks.
  if (foePhase === 'startup' && foe.frame >= Math.min(cfg.reaction, MOVES[foe.action as AttackKind].startup - 1) && dist <= MOVES[foe.action as AttackKind].range + 4) {
    const r = mem.rand();
    if (r < cfg.dodgeChance && self.cooldown.dodge === 0) return { move: 0, dodge: true };
    if (r < cfg.dodgeChance + cfg.blockChance) return { move: 0, block: true };
  }
  if (s.tick < mem.until) return mem.plan;
  const r = mem.rand();
  let plan: Input;
  if (self.meter >= METER_MAX && dist <= MOVES.flurry.range) plan = { move: 0, flurry: true };
  else if (dist > MOVES.jab.range - 2) plan = { move: dir as 1 | -1 };
  else if (r < cfg.aggression) plan = r < cfg.aggression * 0.3 ? { move: 0, heavy: true } : { move: 0, jab: true };
  else if (r < cfg.aggression + 0.15) plan = { move: (-dir) as 1 | -1 };
  else plan = { move: 0, block: mem.rand() < 0.5 };
  mem.plan = plan;
  mem.until = s.tick + cfg.think;
  return plan;
}

// ------------------------------------------------------------------ network helpers
/** Compact snapshot the host sends to the guest (no hidden info exists in boxing). */
export function snapshotBox(s: BoxState) {
  return {
    tick: s.tick, roundTick: s.roundTick, round: s.round, phase: s.phase, wins: s.wins, roundWinner: s.roundWinner, matchWinner: s.matchWinner,
    forfeit: s.forfeit,
    f: s.fighters.map((f) => ({ x: Math.round(f.x * 10) / 10, hp: f.hp, meter: f.meter, action: f.action, frame: f.frame, blocking: f.blocking, lastHitAt: f.lastHitAt, landed: f.landed, thrown: f.thrown })),
    events: s.events,
  };
}

export function sanitizeInput(raw: unknown): Input {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const move = r.move === -1 || r.move === 1 ? r.move : 0;
  return { move, jab: r.jab === true, heavy: r.heavy === true, flurry: r.flurry === true, block: r.block === true, dodge: r.dodge === true };
}
