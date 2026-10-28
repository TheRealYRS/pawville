/**
 * Couple identity on the client.
 *
 * Source of truth for a REAL pair is the backend (public.pawville_pairs, see the SQL migration).
 * The client only caches a pointer for quick display. A "demo" pair is a clearly-labelled local
 * development mode: two tabs of the same browser talk over BroadcastChannel. It is never shown as
 * an online/verified couple.
 */
import { createStore, isObj, oneOf, str, type KeyValueStorage } from '../persistence.ts';

export type Role = 'T' | 'M';
export type PairSource = 'backend' | 'demo';

export interface PairInfo {
  pairId: string;
  source: PairSource;
  myRole: Role;
  partnerName: string;
  /** Has the second seat been claimed? (false while waiting for the partner to accept) */
  partnerJoined: boolean;
}

export const otherRole = (r: Role): Role => (r === 'T' ? 'M' : 'T');

export const INVITE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function normalizeInviteCode(raw: string): string | null {
  const code = raw.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  if (code.length !== 6) return null;
  for (const ch of code) if (!INVITE_ALPHABET.includes(ch)) return null;
  return code;
}

/** Accepts a code or a pasted invite link (…/pair/ABC234). */
export function codeFromInput(input: string): string | null {
  const m = /\/pair\/([A-Za-z0-9]{6})\b/.exec(input);
  return normalizeInviteCode(m ? m[1] : input.trim());
}

export function randomInviteCode(rand: () => number = Math.random): string {
  let s = '';
  for (let i = 0; i < 6; i++) s += INVITE_ALPHABET[Math.floor(rand() * INVITE_ALPHABET.length)];
  return s;
}

export function sanitizePair(raw: unknown): PairInfo | null {
  if (!isObj(raw)) return null;
  const pairId = str(raw.pairId, '', 60);
  if (!/^[A-Za-z0-9:-]{6,60}$/.test(pairId)) return null;
  return {
    pairId,
    source: oneOf(raw.source, ['backend', 'demo'] as const, 'demo'),
    myRole: oneOf(raw.myRole, ['T', 'M'] as const, 'T'),
    partnerName: str(raw.partnerName, '', 16),
    partnerJoined: raw.partnerJoined === true,
  };
}

/** Cached pointer to the backend pair (localStorage) — refreshed from the server on load. */
export function pairCacheStore(storage?: KeyValueStorage | null) {
  return createStore<PairInfo | null>({ key: 'pair-cache', version: 1, defaults: () => null, sanitize: sanitizePair }, storage);
}

/** Demo pairs live per tab (sessionStorage) so two tabs can be two different cats. */
export function demoPairStore(storage?: KeyValueStorage | null) {
  let s = storage;
  if (s === undefined) {
    try {
      s = typeof window !== 'undefined' ? window.sessionStorage : null;
    } catch {
      s = null;
    }
  }
  return createStore<PairInfo | null>({ key: 'pair-demo', version: 1, defaults: () => null, sanitize: sanitizePair }, s);
}

export const PAIR_ERRORS: Record<string, string> = {
  not_signed_in: 'Could not sign in as a guest. Check your connection and try again.',
  not_configured: 'Online pairing is not set up on this deployment (Supabase is not configured).',
  client_missing: "Online pairing couldn't find the game's Supabase client — see the README section on pairing.",
  rate_limited: 'Too many invites in a short time. Wait a few minutes and try again.',
  pair_full: 'This couple already has two cats.',
  invite_not_found: "That invite code doesn't exist. Check the letters and try again.",
  invite_closed: 'That invite was already used or cancelled. Ask for a fresh one.',
  invite_expired: 'That invite expired (invites last 48 hours). Ask for a fresh one.',
  own_invite: "That's your own invite — send it to your partner instead.",
  already_paired: "You're already in a couple. Leave it first if you want to pair with someone else.",
  not_paired: 'You need a partner in your couple first.',
  missing_migration: 'The pairing tables are missing — run supabase/migrations/20261024000001_pawville_pairs.sql.',
  network: "Couldn't reach the server. Check your connection and try again.",
  demo_not_found: "That demo code wasn't started in this browser. Demo couples only work between tabs of the SAME browser.",
  role_conflict: 'Both sides joined with the same cat role. One of you should leave the couple and join again.',
};

export function pairErrorText(code: string): string {
  return PAIR_ERRORS[code] ?? PAIR_ERRORS.network;
}
