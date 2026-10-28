/**
 * Sharing world progress with your partner (Milestone 6).
 *
 * Only whitelisted WORLD flags travel (region unlocks, restorations). Merging is a set union, so
 * it is idempotent, order-independent and duplicate-safe: a late, repeated or reordered message can
 * never remove progress or grant a reward twice (rewards are guarded by the engine's `rewarded`
 * list). Received values are validated; anything unknown is dropped.
 *
 * Authority: this is client-to-client over the private, member-only couple channel. It is NOT a
 * server-validated store — a modified client could claim flags. For a cozy co-op game between two
 * partners that is acceptable and is stated in the docs; a server table is the documented upgrade.
 */
import { addFlags, isSharedFlag, type AdventureState } from './state.ts';

export const ADV_MESSAGE = 'adv:flags';
const FLAG_RE = /^[a-z0-9:_\-.]{1,60}$/i;

export function sharedFlagsOf(s: AdventureState): string[] {
  return s.flags.filter(isSharedFlag).sort();
}

export function parseSharedFlags(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const f of raw.slice(0, 120)) if (typeof f === 'string' && FLAG_RE.test(f) && isSharedFlag(f) && !out.includes(f)) out.push(f);
  return out;
}

export function mergeShared(s: AdventureState, incoming: unknown): { state: AdventureState; added: string[] } {
  return addFlags(s, parseSharedFlags(incoming));
}
