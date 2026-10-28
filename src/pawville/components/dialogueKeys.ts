/**
 * Keyboard control of conversations (PC). Pure logic — what a key means while a conversation is open — plus the guard that
 * stops a held key from skipping a whole dialogue tree. The hook that attaches it to the window lives in useDialogueKeys.ts.
 *
 * KEYS (they follow the project's existing "interact" group — E, Enter, Space — so nothing new has to be learned):
 *   E · Space · Enter       next line            (while a conversation is open the walking controls are paused, so these
 *                                                  keys are free; they are the SAME keys that opened the conversation)
 *   1 – 9                   pick that reply      (explicit: never picks by accident)
 *   ↑ ↓  (or W S)           move the highlight over the replies
 *   E · Space · Enter       confirm the highlighted reply (does nothing while no reply is highlighted)
 *   Esc                     close ("say nothing")
 */
export type DialogueIntent =
  | { t: 'advance' }
  | { t: 'choose'; index: number }
  | { t: 'move'; delta: -1 | 1 }
  | { t: 'confirm' }
  | { t: 'close' }
  | { t: 'ignore' };

export const ADVANCE_CODES: readonly string[] = ['KeyE', 'Enter', 'NumpadEnter', 'Space'];
const CONFIRM_CODES: readonly string[] = ['KeyE', 'Enter', 'NumpadEnter', 'Space'];
/** Every code the conversation captures (so the page, the sit-down handler and native buttons never also react to them). */
export const CAPTURED_CODES: readonly string[] = [...ADVANCE_CODES, 'Escape', 'ArrowUp', 'ArrowDown', 'KeyW', 'KeyS', ...Array.from({ length: 9 }, (_, i) => `Digit${i + 1}`), ...Array.from({ length: 9 }, (_, i) => `Numpad${i + 1}`)];

export interface DialogueKeyContext {
  /** The reply buttons are on screen. */
  choicesShown: boolean;
  choiceCount: number;
  /** Which reply is highlighted by the keyboard (−1 = none). */
  highlighted: number;
}

export function dialogueKeyIntent(code: string, c: DialogueKeyContext): DialogueIntent {
  if (code === 'Escape') return { t: 'close' };
  if (c.choicesShown) {
    const digit = /^(?:Digit|Numpad)([1-9])$/.exec(code);
    if (digit) { const index = Number(digit[1]) - 1; return index < c.choiceCount ? { t: 'choose', index } : { t: 'ignore' }; }
    if (code === 'ArrowUp' || code === 'KeyW') return { t: 'move', delta: -1 };
    if (code === 'ArrowDown' || code === 'KeyS') return { t: 'move', delta: 1 };
    if (CONFIRM_CODES.includes(code)) return c.highlighted >= 0 && c.highlighted < c.choiceCount ? { t: 'confirm' } : { t: 'ignore' };
    return { t: 'ignore' };
  }
  if (ADVANCE_CODES.includes(code)) return { t: 'advance' };
  return { t: 'ignore' };
}

/** The next highlight after pressing ↑/↓ (wraps; the first press from "none" lands on the first/last reply). */
export function moveHighlight(current: number, delta: -1 | 1, count: number): number {
  if (count <= 0) return -1;
  if (current < 0) return delta > 0 ? 0 : count - 1;
  return (current + delta + count) % count;
}

/** Keys are ignored when the player is typing, or another interface (a modal) owns the keyboard. */
export function keyboardIsFree(target: EventTarget | null, doc: { querySelector(sel: string): unknown } | null): boolean {
  const t = target as { isContentEditable?: boolean; tagName?: string } | null;
  if (t && (t.isContentEditable || t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) return false;
  if (doc && doc.querySelector('[role="dialog"][aria-modal="true"], dialog[open]')) return false;
  return true;
}

export const KEY_GAP_MS = 140;
export interface DialogueKeyGuard {
  /** True if this key press may act. Repeats (a held key) never act; presses closer together than KEY_GAP_MS don't either. */
  allow(nowMs: number, repeat: boolean): boolean;
  reset(): void;
}
export function createDialogueKeyGuard(gap = KEY_GAP_MS): DialogueKeyGuard {
  let last = -Infinity;
  return {
    allow(now, repeat) {
      if (repeat) return false;
      if (now - last < gap) return false;
      last = now;
      return true;
    },
    reset() { last = -Infinity; },
  };
}
