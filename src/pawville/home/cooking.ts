/**
 * Cooking (Milestone 8) — pure and unit tested.
 *
 * Every recipe in the book has a defined, working result. Cooking is all-or-nothing: either every
 * ingredient is taken and the dish is added in one save update, or nothing changes. Recipes you have
 * cooked once are remembered (the recipe book). Nothing spoils, nothing is timed out.
 */
import { addItem, takeItem, ITEM_NAMES, type ItemId, type WorldSave } from '../worldSave.ts';

export const FISH_ITEMS: readonly ItemId[] = ['fish-sardine', 'fish-minnow', 'fish-goldfish', 'fish-koi', 'fish-moonfish', 'fish-raincarp', 'fish-snowtrout', 'fish-herring', 'fish-lanternfish'];

export type Need = { item: ItemId; n: number } | { anyFish: true; n: number };
export interface Recipe { id: string; name: string; makes: ItemId; needs: readonly Need[]; blurb: string; ms: number }

export const RECIPES: readonly Recipe[] = [
  { id: 'fish-pie', name: 'Fish pie', makes: 'fish-pie', needs: [{ item: 'flour', n: 1 }, { anyFish: true, n: 1 }], blurb: 'Golden crust, flaky fish. A sailor’s favourite.', ms: 1800 },
  { id: 'apple-tart', name: 'Apple tart', makes: 'apple-tart', needs: [{ item: 'flour', n: 1 }, { item: 'apple', n: 2 }], blurb: 'Sweet, warm and shared best.', ms: 1800 },
  { id: 'berry-tea', name: 'Berry tea', makes: 'berry-tea', needs: [{ item: 'berries', n: 2 }, { item: 'snack-milk', n: 1 }], blurb: 'Pink, fragrant and soothing.', ms: 1200 },
  { id: 'herb-soup', name: 'Herb soup', makes: 'herb-soup', needs: [{ item: 'herbs', n: 2 }, { item: 'glow-mushroom', n: 1 }], blurb: 'Grandma-approved. Faintly glows.', ms: 1600 },
  { id: 'paw-pancakes', name: 'Paw pancakes', makes: 'paw-pancakes', needs: [{ item: 'flour', n: 1 }, { item: 'snack-milk', n: 1 }, { item: 'honey', n: 1 }], blurb: 'Stacked high, pawprint-shaped.', ms: 1600 },
  // Milestone 10: grown in your own garden
  { id: 'garden-salad', name: 'Garden salad', makes: 'garden-salad', needs: [{ item: 'carrot', n: 1 }, { item: 'herbs', n: 1 }, { item: 'berries', n: 1 }], blurb: 'Everything picked from your own beds.', ms: 1200 },
  { id: 'picnic-basket', name: 'Picnic basket', makes: 'picnic-basket', needs: [{ item: 'snack-cookies', n: 1 }, { item: 'snack-onigiri', n: 1 }, { item: 'berries', n: 1 }], blurb: 'Everything for a picnic for two.', ms: 1400 },
];
export const FOODS: readonly ItemId[] = ['garden-salad', 'fish-pie', 'apple-tart', 'berry-tea', 'herb-soup', 'paw-pancakes', 'picnic-basket', 'snack-cookies', 'snack-onigiri', 'snack-milk', 'ice-cream', 'bistro-plate'];

export function needLabel(n: Need): string {
  return 'anyFish' in n ? `${n.n} × any fish` : `${n.n} × ${ITEM_NAMES[n.item]}`;
}
export function have(save: WorldSave, n: Need): number {
  return 'anyFish' in n ? FISH_ITEMS.reduce((a, f) => a + (save.inventory[f] ?? 0), 0) : save.inventory[n.item] ?? 0;
}
export function canCook(save: WorldSave, r: Recipe): boolean {
  return r.needs.every((n) => have(save, n) >= n.n);
}

export type CookResult = { ok: true; save: WorldSave; first: boolean; text: string } | { ok: false; text: string };

export function cook(save: WorldSave, id: string): CookResult {
  const r = RECIPES.find((x) => x.id === id);
  if (!r) return { ok: false, text: 'No such recipe.' };
  if (!canCook(save, r)) return { ok: false, text: `Missing ingredients for ${r.name}.` };
  let s: WorldSave | null = save;
  for (const n of r.needs) {
    for (let k = 0; k < n.n && s; k++) {
      if ('anyFish' in n) { const f = FISH_ITEMS.find((x) => (s!.inventory[x] ?? 0) > 0); s = f ? takeItem(s, f) : null; }
      else s = takeItem(s, n.item);
    }
  }
  if (!s) return { ok: false, text: 'Something went missing — nothing was used.' };
  const known = save.recipes ?? [];
  const first = !known.includes(r.id);
  return { ok: true, save: { ...addItem(s, r.makes, 1), recipes: first ? [...known, r.id] : known }, first, text: `${r.name} is ready!` };
}

/** Eat (or share) one dish. Returns null if you have none. */
export function eat(save: WorldSave, item: ItemId): WorldSave | null {
  return takeItem(save, item);
}

/** Herb planters: one gentle, free harvest per planter per day. Nothing ever wilts. */
export function harvestHerbs(save: WorldSave, planters: number, day: string): { save: WorldSave; got: number } {
  const key = `herbs:${day}`;
  if (planters < 1 || (save.dailyCounts[key] ?? 0) >= planters) return { save, got: 0 };
  return { save: { ...addItem(save, 'herbs', 2), dailyCounts: { ...save.dailyCounts, [key]: (save.dailyCounts[key] ?? 0) + 1 } }, got: 2 };
}
