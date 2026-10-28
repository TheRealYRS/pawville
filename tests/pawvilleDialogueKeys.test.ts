/**
 * Gate E — conversation controls. The pure rules (which key means what, the repeat/debounce guard, "who owns the keyboard")
 * are tested here; tests/browser/dialogue_keys.py drives the real game in Chromium.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ADVANCE_CODES, CAPTURED_CODES, KEY_GAP_MS, createDialogueKeyGuard, dialogueKeyIntent, keyboardIsFree, moveHighlight } from '../src/pawville/components/dialogueKeys.ts';
import { KEY_BINDINGS } from '../src/pawville/world/movement.ts';

const plain = { choicesShown: false, choiceCount: 0, highlighted: -1 };
const asks = (n: number, h = -1) => ({ choicesShown: true, choiceCount: n, highlighted: h });

test('keys: E, Space and Enter advance an ordinary conversation; unrelated keys do nothing', () => {
  for (const c of ['KeyE', 'Space', 'Enter', 'NumpadEnter']) assert.deepEqual(dialogueKeyIntent(c, plain), { t: 'advance' }, c);
  for (const c of ['KeyQ', 'KeyJ', 'KeyM', 'ShiftLeft', 'Tab', 'Digit1', 'ArrowUp', 'KeyW', 'ArrowRight']) assert.deepEqual(dialogueKeyIntent(c, plain), { t: 'ignore' }, `${c} does nothing while there are no replies`);
  assert.deepEqual(dialogueKeyIntent('Escape', plain), { t: 'close' });
});

test('keys: the advance keys are exactly the project\'s existing interact keys — nothing new conflicts with walking, emotes or menus', () => {
  for (const k of KEY_BINDINGS.interact) assert.ok(ADVANCE_CODES.includes(k), `${k} (interact) also advances`);
  const movement = new Set<string>([...KEY_BINDINGS.up, ...KEY_BINDINGS.down, ...KEY_BINDINGS.left, ...KEY_BINDINGS.right, ...KEY_BINDINGS.run]);
  for (const k of ADVANCE_CODES) assert.ok(!movement.has(k), `${k} is not a movement key`);
  // J (journal) and M (map) are never captured, so the HUD shortcuts keep working around a conversation
  for (const k of ['KeyJ', 'KeyM', 'KeyP']) assert.ok(!CAPTURED_CODES.includes(k));
});

test('keys: with replies on screen nothing is picked by accident — pick by number, or highlight then confirm', () => {
  assert.deepEqual(dialogueKeyIntent('KeyE', asks(3)), { t: 'ignore' }, 'E alone never picks a reply');
  assert.deepEqual(dialogueKeyIntent('Enter', asks(3)), { t: 'ignore' });
  assert.deepEqual(dialogueKeyIntent('Space', asks(3)), { t: 'ignore' });
  assert.deepEqual(dialogueKeyIntent('Digit2', asks(3)), { t: 'choose', index: 1 });
  assert.deepEqual(dialogueKeyIntent('Numpad3', asks(3)), { t: 'choose', index: 2 });
  assert.deepEqual(dialogueKeyIntent('Digit4', asks(3)), { t: 'ignore' }, 'there is no 4th reply');
  assert.deepEqual(dialogueKeyIntent('ArrowDown', asks(3)), { t: 'move', delta: 1 });
  assert.deepEqual(dialogueKeyIntent('KeyW', asks(3)), { t: 'move', delta: -1 });
  assert.deepEqual(dialogueKeyIntent('Enter', asks(3, 1)), { t: 'confirm' });
  assert.deepEqual(dialogueKeyIntent('KeyE', asks(3, 0)), { t: 'confirm' });
  assert.deepEqual(dialogueKeyIntent('Space', asks(2, 5)), { t: 'ignore' }, 'a stale highlight out of range confirms nothing');
  assert.deepEqual(dialogueKeyIntent('Escape', asks(3, 1)), { t: 'close' });
  assert.deepEqual(dialogueKeyIntent('ArrowRight', asks(3, 1)), { t: 'ignore' }, 'arrow keys other than ↑↓ do nothing');
});

test('keys: the highlight wraps and starts at the first/last reply', () => {
  assert.equal(moveHighlight(-1, 1, 3), 0); assert.equal(moveHighlight(-1, -1, 3), 2);
  assert.equal(moveHighlight(2, 1, 3), 0); assert.equal(moveHighlight(0, -1, 3), 2); assert.equal(moveHighlight(1, 1, 3), 2);
  assert.equal(moveHighlight(0, 1, 0), -1);
});

test('keys: holding a key can not skip the dialogue — repeats are ignored and quick double-presses are debounced', () => {
  const g = createDialogueKeyGuard();
  assert.ok(g.allow(1000, false), 'first press acts');
  for (let t = 1030; t < 3000; t += 30) assert.ok(!g.allow(t, true), 'auto-repeat never acts');
  assert.ok(!g.allow(1000 + KEY_GAP_MS - 1, false), 'a second press within the gap is ignored');
  assert.ok(g.allow(1000 + KEY_GAP_MS, false), 'a deliberate second press acts');
  g.reset(); assert.ok(g.allow(1, false), 'a new conversation starts fresh');
  // 3 seconds of a held key = exactly ONE advance, however many repeat events arrive
  const h = createDialogueKeyGuard(); let advanced = 0;
  for (let t = 0; t < 3000; t += 33) if (h.allow(t, t > 0)) advanced++;
  assert.equal(advanced, 1);
});

test('keys: typing in a field, or a modal that owns the keyboard, is left alone', () => {
  const none = { querySelector: () => null };
  assert.ok(keyboardIsFree({ tagName: 'DIV' } as never, none));
  for (const tagName of ['INPUT', 'TEXTAREA', 'SELECT']) assert.ok(!keyboardIsFree({ tagName } as never, none), tagName);
  assert.ok(!keyboardIsFree({ tagName: 'DIV', isContentEditable: true } as never, none));
  assert.ok(!keyboardIsFree({ tagName: 'DIV' } as never, { querySelector: () => ({}) }), 'an open aria-modal dialog owns the keyboard');
  assert.ok(keyboardIsFree(null, null));
});
