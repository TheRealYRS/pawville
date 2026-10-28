/**
 * Every couple label in the UI is DERIVED here from the canonical controller state — no screen
 * keeps its own partnerOnline / invitePending / partnerAway booleans that could contradict each
 * other. Town headcount ("N cats in town") is a different thing and is labelled separately.
 */
import type { PairState } from './pairController.ts';

export type CoupleTone = 'none' | 'ok' | 'wait' | 'warn';

export interface CoupleView {
  /** Short HUD label. */
  label: string;
  /** One-line explanation for panels/tooltips. */
  detail: string;
  tone: CoupleTone;
  /** Can a shared activity be offered right now? */
  canInvite: boolean;
}

export function coupleView(s: Pick<PairState, 'pair' | 'invite' | 'transport' | 'partner' | 'partnerOnline' | 'backend'>): CoupleView {
  const p = s.pair;
  if (!p) return { label: 'Couple', detail: 'Not in a couple yet.', tone: 'none', canInvite: false };
  const demo = p.source === 'demo';
  const prefix = demo ? 'Demo: ' : '';
  if (s.transport === 'conflict') {
    return { label: `${prefix}role clash`, detail: 'Both sides joined with the same cat role. One of you must leave the couple and join again.', tone: 'warn', canInvite: false };
  }
  if (!p.partnerJoined) {
    const st = s.invite?.status ?? 'open';
    if (st === 'declined') return { label: 'Invite declined', detail: 'Your invite was declined. Make a new one to try again.', tone: 'warn', canInvite: false };
    if (st === 'expired') return { label: 'Invite expired', detail: 'Your invite expired. Make a new one.', tone: 'warn', canInvite: false };
    if (st === 'cancelled') return { label: 'No open invite', detail: 'Your invite was cancelled. Make a new one when you’re ready.', tone: 'warn', canInvite: false };
    return { label: 'Invite pending', detail: 'Waiting for your partner to accept the invite.', tone: 'wait', canInvite: false };
  }
  if (s.transport === 'connecting' || s.transport === 'none') {
    return { label: `${prefix}connecting…`, detail: 'Connecting to your couple’s private channel…', tone: 'wait', canInvite: false };
  }
  if (s.partner === 'online') return { label: demo ? 'Demo partner here' : 'Partner here', detail: 'Your partner is connected right now.', tone: 'ok', canInvite: true };
  if (s.partner === 'away' && s.partnerOnline) {
    return { label: `${prefix}partner reconnecting…`, detail: 'Your partner’s connection blinked — waiting a few seconds for them.', tone: 'wait', canInvite: false };
  }
  if (s.transport === 'error') {
    return { label: `${prefix}reconnecting…`, detail: 'Your connection to the couple channel dropped; retrying automatically.', tone: 'warn', canInvite: false };
  }
  return { label: demo ? 'Demo: partner away' : 'Partner away', detail: demo ? 'Open the other demo tab in this same browser.' : 'Your partner isn’t connected right now (they may be offline or on another device).', tone: 'warn', canInvite: false };
}

/** Town headcount, kept separate from partner availability. */
export function townLabel(status: string, others: number): string {
  if (status !== 'online') return status === 'disabled' ? 'Solo town' : status === 'connecting' ? 'Connecting…' : status === 'reconnecting' ? 'Reconnecting…' : 'Offline';
  return others === 0 ? 'Online · only you in town' : `Online · ${others + 1} cats in town`;
}
