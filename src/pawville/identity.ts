/**
 * Player identity in Pawville.
 *   - nickname + original accessory: the Paw vs Paw preferences (lib/preferences) — one source.
 *   - role (Tangerine 'T' / Midnight 'M'): from your couple if you have one; otherwise your choice.
 *   - appearance (coat + Pawville extras): appearance.ts — independent of role and identity.
 *   - presence id (player INSTANCE id): one per page load, held in module memory.
 *
 * Milestone 5 (multiplayer repair):
 *   - The presence id used to live in sessionStorage. Browsers COPY sessionStorage when a tab is
 *     duplicated (and some restore it into new tabs), so two tabs could share one presence id:
 *     each tab then discarded the other's movement as "its own echo" and both claimed the same
 *     presence key. It is now created once per page load (never per render, remount or
 *     reconnect) so every tab is exactly one cat. Policy: each tab is its own controllable cat.
 *   - The authenticated identity (auth.uid from the anonymous session) is what pair membership,
 *     invitations and Paw vs Paw seats are tied to; the presence id is only a per-tab instance id
 *     inside the public, cosmetic town channel.
 *   - Unpaired players used to look IDENTICAL (everyone defaulted to Tangerine, named
 *     "Tangerine"), which made two devices look like they were swapping control. A player who
 *     never chose a look now wears their role's default, and an un-named player gets a short
 *     per-instance tag ("Tangerine ·3f") so two cats can always be told apart.
 */
import type { Accessory } from '../game/types';
import { loadPreferences } from '../lib/preferences';
import { appearanceStore, defaultCoatFor, type CoatId, type ExtraId } from './appearance.ts';
import type { Vec2 } from './world/geometry.ts';

export type TownCat = 'T' | 'M';

export interface TownIdentity {
  id: string;
  cat: TownCat;
  name: string;
  accessory: Accessory;
  coat: CoatId;
  extra: ExtraId;
}

const ROLE_KEY = 'pawville:cat';
const RETURN_KEY = 'pawville:return-point';

function safeGet(storage: Storage | undefined, key: string): string | null {
  try {
    return storage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function safeSet(storage: Storage | undefined, key: string, value: string | null): void {
  try {
    if (value === null) storage?.removeItem(key);
    else storage?.setItem(key, value);
  } catch {
    /* storage disabled */
  }
}

export { defaultName, presenceId, resetInstanceIdForTests } from './instanceId.ts';
import { defaultName, presenceId } from './instanceId.ts';

function hasSavedAppearance(): boolean {
  return safeGet(window.localStorage, 'pawville:appearance') !== null || safeGet(window.localStorage, 'pawville:cat') !== null;
}

export function catName(cat: TownCat): string {
  return cat === 'T' ? 'Tangerine' : 'Midnight';
}

export function loadTownIdentity(roleOverride?: TownCat): TownIdentity {
  const prefs = loadPreferences();
  const cat: TownCat = roleOverride ?? (safeGet(window.localStorage, ROLE_KEY) === 'M' ? 'M' : 'T');
  const look = appearanceStore().load();
  const id = presenceId();
  const coat = hasSavedAppearance() ? look.coat ?? defaultCoatFor(cat) : defaultCoatFor(cat);
  return { id, cat, name: prefs.nickname || defaultName(cat, id), accessory: prefs.accessory, coat, extra: look.extra };
}

export function saveTownCat(cat: TownCat): void {
  safeSet(window.localStorage, ROLE_KEY, cat);
}

export function saveReturnPoint(p: Vec2): void {
  safeSet(window.sessionStorage, RETURN_KEY, JSON.stringify({ x: Math.round(p.x), y: Math.round(p.y) }));
}

export function peekReturnPoint(): Vec2 | null {
  const raw = safeGet(window.sessionStorage, RETURN_KEY);
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as { x?: unknown; y?: unknown };
    return typeof v.x === 'number' && typeof v.y === 'number' ? { x: v.x, y: v.y } : null;
  } catch {
    return null;
  }
}

export function clearReturnPoint(): void {
  safeSet(window.sessionStorage, RETURN_KEY, null);
}
