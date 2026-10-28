/**
 * Harmless, local-only preferences. Game state is NEVER stored here.
 */
import { ACCESSORIES, type Accessory, type Difficulty } from '../game/types';

const KEY = 'pawvspaw.prefs.v1';

export interface Preferences {
  nickname: string;
  accessory: Accessory;
  sound: boolean;
  difficulty: Difficulty;
  /** Pointer to the last online room so a player who hit Back can rejoin. Not game state. */
  lastRoomId: string | null;
}

const DEFAULTS: Preferences = { nickname: '', accessory: 'none', sound: false, difficulty: 'medium', lastRoomId: null };

export const NICKNAME_MAX = 16;

/** Mirrors pvp_clean_nickname in SQL (the server re-validates anyway). */
export function cleanNickname(raw: string): string {
  return raw
    .replace(/[^\p{L}\p{N} _.!?'-]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, NICKNAME_MAX);
}

export function loadPreferences(): Preferences {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULTS };
    const p = JSON.parse(raw) as Partial<Preferences>;
    return {
      nickname: typeof p.nickname === 'string' ? cleanNickname(p.nickname) : '',
      accessory: ACCESSORIES.includes(p.accessory as Accessory) ? (p.accessory as Accessory) : 'none',
      sound: p.sound === true,
      difficulty: p.difficulty === 'easy' || p.difficulty === 'hard' ? p.difficulty : 'medium',
      lastRoomId: typeof p.lastRoomId === 'string' ? p.lastRoomId : null,
    };
  } catch {
    return { ...DEFAULTS };
  }
}

export function savePreferences(patch: Partial<Preferences>): Preferences {
  const next = { ...loadPreferences(), ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* private mode / storage full: preferences are optional */
  }
  return next;
}
