/**
 * Paired play for the story (pure). Two partners answer the same question; the scene follows ONE answer so both players see
 * the same story, and each keeps THEIR OWN tone (so differences are recorded, never judged).
 *
 *  - Answers travel over the private couple channel as `story:pick` messages.
 *  - The shared outcome follows the answer of the partner with the lower role ('M' before 'T'), so both clients compute the
 *    SAME result without a server and without asking who is right.
 *  - A `secret` question hides the partner's answer until you have answered too.
 *  - Nobody ever has to wait: after a short time (or by choosing to continue) the scene goes on with your own answer.
 *  - Messages are validated; unknown ids are dropped.
 */
export const STORY_PICK = 'story:pick';
export const PICK_WAIT_MS = 25_000;

export interface PickMessage { t: typeof STORY_PICK; ask: string; opt: string }

const ID = /^[a-z0-9:_\-.]{1,60}$/i;
export function parsePick(raw: unknown): { ask: string; opt: string } | null {
  if (!raw || typeof raw !== 'object') return null;
  const m = raw as Record<string, unknown>;
  if (m.t !== STORY_PICK || typeof m.ask !== 'string' || typeof m.opt !== 'string') return null;
  return ID.test(m.ask) && ID.test(m.opt) ? { ask: m.ask, opt: m.opt } : null;
}

export type Role = 'T' | 'M';

export interface Resolution {
  /** The option the scene follows. */
  opt: string;
  /** True when the two answers differed. */
  differ: boolean;
  /** Which player's answer the scene followed. */
  followed: 'mine' | 'theirs';
}

/** Who leads when answers differ: a fixed, symmetric rule ('M' leads), so both sides agree. */
export const leadRole: Role = 'M';

export function resolvePick(mine: string, theirs: string | null | undefined, myRole: Role): Resolution {
  if (!theirs) return { opt: mine, differ: false, followed: 'mine' };
  if (theirs === mine) return { opt: mine, differ: false, followed: 'mine' };
  const iLead = myRole === leadRole;
  return iLead ? { opt: mine, differ: true, followed: 'mine' } : { opt: theirs, differ: true, followed: 'theirs' };
}

/**
 * Collects the partner's answers as they arrive, and lets the UI wait for one with a timeout.
 * (Injected timers keep it testable.)
 */
export class PickBox {
  private got = new Map<string, string>();
  private waiters = new Map<string, ((opt: string | null) => void)[]>();
  private readonly timers: { set: (fn: () => void, ms: number) => unknown; clear: (h: unknown) => void };
  constructor(timers?: { set: (fn: () => void, ms: number) => unknown; clear: (h: unknown) => void }) {
    this.timers = timers ?? { set: (fn, ms) => setTimeout(fn, ms), clear: (h) => clearTimeout(h as ReturnType<typeof setTimeout>) };
  }

  receive(ask: string, opt: string): void {
    this.got.set(ask, opt);
    const ws = this.waiters.get(ask);
    if (ws) { this.waiters.delete(ask); for (const w of ws) w(opt); }
  }
  /** The partner's answer if it has arrived (not consumed). */
  peek(ask: string): string | null { return this.got.get(ask) ?? null; }
  forget(ask: string): void { this.got.delete(ask); }
  clear(): void { this.got.clear(); for (const ws of this.waiters.values()) for (const w of ws) w(null); this.waiters.clear(); }

  /** Resolves with the partner's answer, or null after `ms` (or when cancelled). */
  wait(ask: string, ms = PICK_WAIT_MS): { promise: Promise<string | null>; cancel: () => void } {
    const have = this.got.get(ask);
    if (have) return { promise: Promise.resolve(have), cancel: () => undefined };
    let done = false;
    let resolveFn: (v: string | null) => void = () => undefined;
    const promise = new Promise<string | null>((r) => { resolveFn = r; });
    const finish = (v: string | null) => { if (done) return; done = true; this.timers.clear(handle); resolveFn(v); };
    const handle = this.timers.set(() => { const ws = this.waiters.get(ask); if (ws) this.waiters.set(ask, ws.filter((w) => w !== finish)); finish(null); }, ms);
    const list = this.waiters.get(ask) ?? [];
    list.push(finish);
    this.waiters.set(ask, list);
    return { promise, cancel: () => finish(null) };
  }
}
