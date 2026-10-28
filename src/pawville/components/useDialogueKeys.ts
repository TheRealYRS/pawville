import { useEffect, useRef } from 'react';
import { CAPTURED_CODES, createDialogueKeyGuard, keyboardIsFree, type DialogueKeyGuard } from './dialogueKeys.ts';

/**
 * While a conversation is open, captures its keys on the window (capture phase) so that:
 *   - the walking controls, the "stand up" handler and any focused button never ALSO react to the same key press,
 *   - a held key (auto-repeat) cannot skip through the dialogue,
 *   - typing in a text field, or a modal that owns the keyboard, is left completely alone.
 * Mouse and touch are unaffected. The listeners are removed the moment the conversation closes or the component unmounts.
 */
export function useDialogueKeys(active: boolean, onKey: (code: string) => void): void {
  const handler = useRef(onKey);
  handler.current = onKey;
  const guard = useRef<DialogueKeyGuard>(createDialogueKeyGuard());
  useEffect(() => {
    if (!active) return undefined;
    guard.current.reset();
    const captured = new Set(CAPTURED_CODES);
    const down = (e: KeyboardEvent) => {
      if (!captured.has(e.code) || e.metaKey || e.ctrlKey || e.altKey) return;
      if (!keyboardIsFree(e.target, document)) return;
      e.preventDefault(); // also stops a focused button from "clicking" on Enter/Space
      e.stopPropagation();
      // Moving the highlight may repeat (hold ↓ to scroll) and is never debounced; advancing/confirming/picking is.
      const nav = e.code === 'ArrowUp' || e.code === 'ArrowDown' || e.code === 'KeyW' || e.code === 'KeyS';
      if (!nav && !guard.current.allow(performance.now(), e.repeat)) return;
      handler.current(e.code);
    };
    const up = (e: KeyboardEvent) => { if (captured.has(e.code) && keyboardIsFree(e.target, document)) { e.preventDefault(); e.stopPropagation(); } }; // Space "clicks" a button on key-up
    window.addEventListener('keydown', down, true);
    window.addEventListener('keyup', up, true);
    return () => { window.removeEventListener('keydown', down, true); window.removeEventListener('keyup', up, true); };
  }, [active]);
}
