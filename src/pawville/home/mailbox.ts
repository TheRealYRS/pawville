/**
 * Notes & gifts. With a backend pair, mail goes through the pv_send_mail / pv_my_mail RPCs
 * (cross-device, private to the two of you). Without one, a LOCAL mailbox on this device is used
 * — the UI says so; nothing is shown as "delivered" to another device.
 */
import { arr, createStore, isObj, num, oneOf, str, type KeyValueStorage } from '../persistence.ts';

export const NOTE_MAX = 280;
export const GIFTABLE = ['bouquet', 'apple', 'shell', 'snack-cookies', 'snack-milk', 'plush-fish'] as const;
export type Giftable = (typeof GIFTABLE)[number];

export interface LocalMail {
  id: string;
  kind: 'note' | 'gift';
  body: string;
  gift: Giftable | null;
  fromMe: boolean;
  at: number;
  openedAt: number | null;
}

/** Validates note text: trims, collapses whitespace, strips control characters, enforces the limit. */
export function cleanNote(raw: string): string {
  return raw.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, NOTE_MAX);
}

export function validateMail(kind: 'note' | 'gift', body: string, gift: string | null): string | null {
  if (kind === 'note' && cleanNote(body).length === 0) return 'Write a few words first.';
  if (kind === 'gift' && (!gift || !GIFTABLE.includes(gift as Giftable))) return 'Pick something from your bag to give.';
  if (body.length > NOTE_MAX * 2) return 'That note is a little too long.';
  return null;
}

export function localMailStore(storage?: KeyValueStorage | null) {
  return createStore<LocalMail[]>({
    key: 'mail-local', version: 1, defaults: () => [],
    sanitize: (raw) => arr(raw, (x) => {
      if (!isObj(x)) return null;
      return {
        id: str(x.id, `l${num(x.at, 0)}`, 40), kind: oneOf(x.kind, ['note', 'gift'] as const, 'note'), body: cleanNote(str(x.body, '', NOTE_MAX * 2)),
        gift: x.gift === null || x.gift === undefined ? null : oneOf(x.gift, GIFTABLE, 'bouquet'), fromMe: x.fromMe !== false, at: num(x.at, 0),
        openedAt: x.openedAt === null || x.openedAt === undefined ? null : num(x.openedAt, 0),
      };
    }, 200),
  }, storage);
}
