/** Thin wrappers around the pairing RPCs (supabase/migrations/20261024000001_pawville_pairs.sql). */
import { readyClient } from '../net/backend.ts';
import type { PairInfo, Role } from './pairModel.ts';

export class PairError extends Error {
  code: string;
  constructor(code: string) {
    super(code);
    this.code = code;
  }
}

function toCode(message: string): string {
  const known = ['not_signed_in', 'rate_limited', 'pair_full', 'invite_not_found', 'invite_closed', 'invite_expired', 'own_invite', 'already_paired', 'not_paired'];
  const hit = known.find((k) => message.includes(k));
  if (hit) return hit;
  if (/function .*pv_.* does not exist|Could not find the function/i.test(message)) return 'missing_migration';
  return 'network';
}

async function call<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  let client;
  try {
    client = await readyClient();
  } catch (e) {
    throw new PairError(e instanceof Error ? e.message : 'network');
  }
  const { data, error } = await client.rpc(fn, args);
  if (error) throw new PairError(toCode(error.message));
  return data as T;
}

const first = <T>(rows: unknown): T | null => (Array.isArray(rows) ? ((rows[0] as T) ?? null) : ((rows as T) ?? null));

export async function fetchMyPair(): Promise<PairInfo | null> {
  const row = first<{ pair_id: string; my_role: Role; partner_name: string; partner_joined: boolean }>(await call('pv_my_pair'));
  if (!row) return null;
  return { pairId: row.pair_id, source: 'backend', myRole: row.my_role === 'M' ? 'M' : 'T', partnerName: row.partner_name ?? '', partnerJoined: !!row.partner_joined };
}

export async function createInvite(role: Role, name: string): Promise<{ code: string; pairId: string; myRole: Role; expiresAt: string }> {
  const row = first<{ code: string; pair_id: string; my_role: Role; expires_at: string }>(await call('pv_create_pair_invite', { p_role: role, p_name: name }));
  if (!row) throw new PairError('network');
  return { code: row.code, pairId: row.pair_id, myRole: row.my_role === 'M' ? 'M' : 'T', expiresAt: row.expires_at };
}

export async function acceptInvite(code: string, name: string): Promise<PairInfo> {
  const row = first<{ pair_id: string; my_role: Role; partner_name: string }>(await call('pv_accept_pair_invite', { p_code: code, p_name: name }));
  if (!row) throw new PairError('network');
  return { pairId: row.pair_id, source: 'backend', myRole: row.my_role === 'M' ? 'M' : 'T', partnerName: row.partner_name ?? '', partnerJoined: true };
}

export type InviteStatus = 'open' | 'accepted' | 'declined' | 'cancelled' | 'expired';
export interface MyInvite {
  code: string;
  status: InviteStatus;
  expiresAt: string;
  mine: boolean;
}

/**
 * Latest invitation of MY pair (needs migration 20261026000001). Returns `undefined` when that
 * migration isn't applied yet, so callers can fall back to `pv_my_pair` alone.
 */
export async function fetchMyInvite(): Promise<MyInvite | null | undefined> {
  try {
    const row = first<{ code: string; status: string; expires_at: string; mine: boolean }>(await call('pv_my_pair_invite'));
    if (!row) return null;
    const expired = row.status === 'open' && Date.parse(row.expires_at) < Date.now();
    const st = (['open', 'accepted', 'declined', 'cancelled'] as const).find((x) => x === row.status) ?? 'cancelled';
    return { code: row.code, status: expired ? 'expired' : st, expiresAt: row.expires_at, mine: !!row.mine };
  } catch (e) {
    if (e instanceof PairError && e.code === 'missing_migration') return undefined;
    throw e;
  }
}

export const declineInvite = (code: string) => call<void>('pv_decline_pair_invite', { p_code: code });
export const cancelInvites = () => call<void>('pv_cancel_pair_invites');
export const leavePair = () => call<void>('pv_leave_pair');

export interface MailRow {
  id: number;
  kind: 'note' | 'gift';
  body: string;
  gift: string | null;
  from_me: boolean;
  created_at: string;
  opened_at: string | null;
}
export const sendMail = (kind: 'note' | 'gift', body: string, gift: string | null) => call<number>('pv_send_mail', { p_kind: kind, p_body: body, p_gift: gift ?? '' });
export const fetchMail = () => call<MailRow[]>('pv_my_mail', { p_limit: 60 });
export const openMail = (id: number) => call<void>('pv_open_mail', { p_id: id });
