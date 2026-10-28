/**
 * Whiskerwick economy (Milestone 7) — pure and unit tested.
 *
 * Paw tokens are a relaxed currency: you earn them by selling things you find anyway (fish,
 * shells, mushrooms…), by playing at the arcade (small, daily-capped amounts) and from a few
 * one-time gifts. You spend them on snacks, flowers, plushies, the claw machine and the vending
 * machine. Nothing in normal home progression requires tokens, and nothing can make them negative.
 *
 * Every mutation returns either a new save or a reason, never a half-applied state.
 * One-time grants are keyed (`claims`) so a retried or duplicated action can't pay out twice.
 */
import { MAX_TOKENS, addItem, takeItem, ITEM_NAMES, type ItemId, type WorldSave } from '../worldSave.ts';

export type ShopId = 'bakery' | 'florist' | 'toyshop' | 'market' | 'cafe' | 'icecream' | 'bistro' | 'antiques' | 'bookshop' | 'boutique';

export interface ShopItem {
  item: ItemId;
  price: number;
}

export interface ShopDef {
  id: ShopId;
  name: string;
  keeper: string;
  blurb: string;
  sells: readonly ShopItem[];
  /** What the shop buys from you (item → tokens). */
  buys?: Partial<Record<ItemId, number>>;
}

/** Sell prices at the Corner Market. Quest items are never in the bag, so they can't be sold. */
export const SELL_PRICES: Partial<Record<ItemId, number>> = {
  'fish-sardine': 2, 'fish-minnow': 1, 'fish-goldfish': 4, 'fish-koi': 5, 'fish-moonfish': 6, 'fish-raincarp': 4, 'fish-snowtrout': 5,
  'fish-herring': 3, 'fish-lanternfish': 6, shell: 2, 'sea-glass': 3, 'glow-mushroom': 3, 'pine-cone': 1, 'frost-crystal': 4, apple: 1, 'old-boot': 1,
};

export const SHOPS: readonly ShopDef[] = [
  {
    id: 'bakery', name: 'Crumbs & Whiskers Bakery', keeper: 'Rosie', blurb: 'Warm ovens, warmer smiles. Snacks for picnics and long walks.',
    sells: [{ item: 'snack-cookies', price: 2 }, { item: 'snack-milk', price: 1 }, { item: 'snack-onigiri', price: 3 }, { item: 'flour', price: 1 }, { item: 'honey', price: 2 }],
  },
  {
    id: 'florist', name: 'Petal & Paw Florist', keeper: 'Fern', blurb: 'Bouquets for your home and your favourite people.',
    sells: [{ item: 'bouquet', price: 3 }, { item: 'apple', price: 1 }],
  },
  {
    id: 'toyshop', name: 'Tumble Toys', keeper: 'Ozzie', blurb: 'Plushies and squeaky things. Plushies can be displayed at home.',
    sells: [{ item: 'plush-tangerine', price: 8 }, { item: 'plush-midnight', price: 8 }, { item: 'plush-fish', price: 6 }, { item: 'toy-mouse', price: 2 }],
  },
  {
    id: 'market', name: 'Corner Market', keeper: 'Mr. Pemberton', blurb: 'Buys what you find, sells what you need.',
    sells: [{ item: 'snack-milk', price: 1 }, { item: 'apple', price: 1 }],
    buys: SELL_PRICES,
  },
  {
    id: 'cafe', name: 'The Purring Cup', keeper: 'Rosie', blurb: 'Tea, milk and a window seat that is always warm.',
    sells: [{ item: 'snack-milk', price: 1 }, { item: 'snack-cookies', price: 2 }, { item: 'berry-tea', price: 3 }],
  },
  // ---- Milestone 8 ----
  { id: 'icecream', name: 'Scoops on the Boardwalk', keeper: 'Pip’s cousin Pop', blurb: 'One scoop, two scoops, a whole paw of scoops.', sells: [{ item: 'ice-cream', price: 2 }] },
  { id: 'bistro', name: 'Le Petit Moustache', keeper: 'Chef Marcel', blurb: 'Candlelit suppers for two. Bon appétit!', sells: [{ item: 'bistro-plate', price: 5 }, { item: 'apple-tart', price: 4 }] },
  { id: 'antiques', name: 'Tick & Trinket Antiques', keeper: 'Mr. Velvet', blurb: 'Old things with stories still in them.', sells: [{ item: 'shell', price: 3 }, { item: 'sea-glass', price: 4 }], buys: { 'old-boot': 2, 'moon-pearl': 9, 'star-shard': 8, 'frost-crystal': 5 } },
  { id: 'bookshop', name: 'Dog-Eared Books', keeper: 'Wren', blurb: 'Second-hand stories and seed catalogues.', sells: [{ item: 'toy-mouse', price: 2 }] },
  { id: 'boutique', name: 'Ribbon & Bell Boutique', keeper: 'Madame Plume', blurb: 'Bows, bells and the occasional crown. (Outfits are in your wardrobe at home.)', sells: [{ item: 'bouquet', price: 3 }] },
];

export function shopById(id: string): ShopDef | undefined {
  return SHOPS.find((s) => s.id === id);
}

export type EconomyResult = { ok: true; save: WorldSave; text: string } | { ok: false; reason: 'tokens' | 'stock' | 'none' | 'claimed' | 'cap'; text: string };

const withTokens = (s: WorldSave, n: number): WorldSave => ({ ...s, tokens: Math.max(0, Math.min(MAX_TOKENS, Math.floor(s.tokens + n))) });

export function buy(save: WorldSave, shop: ShopId, item: ItemId): EconomyResult {
  const def = shopById(shop);
  const entry = def?.sells.find((x) => x.item === item);
  if (!def || !entry) return { ok: false, reason: 'stock', text: 'That isn’t sold here.' };
  if (save.tokens < entry.price) return { ok: false, reason: 'tokens', text: `You need ${entry.price} paw tokens (you have ${save.tokens}).` };
  return { ok: true, save: addItem(withTokens(save, -entry.price), item, 1), text: `Bought ${ITEM_NAMES[item]} for ${entry.price} tokens.` };
}

export function sell(save: WorldSave, shop: ShopId, item: ItemId): EconomyResult {
  const price = shopById(shop)?.buys?.[item];
  if (!price) return { ok: false, reason: 'stock', text: 'They don’t buy that here.' };
  const taken = takeItem(save, item, 1);
  if (!taken) return { ok: false, reason: 'none', text: 'You don’t have one.' };
  return { ok: true, save: withTokens(taken, price), text: `Sold ${ITEM_NAMES[item]} for ${price} tokens.` };
}

/** Pay tokens for a machine (claw, vending). */
export function spend(save: WorldSave, cost: number, what: string): EconomyResult {
  if (save.tokens < cost) return { ok: false, reason: 'tokens', text: `${what} needs ${cost} paw token${cost === 1 ? '' : 's'}.` };
  return { ok: true, save: withTokens(save, -cost), text: '' };
}

/** A one-time token gift (idempotent by claim id). */
export function grantOnce(save: WorldSave, claim: string, tokens: number): EconomyResult {
  if (save.claims.includes(claim)) return { ok: false, reason: 'claimed', text: 'Already received.' };
  return { ok: true, save: { ...withTokens(save, tokens), claims: [...save.claims, claim] }, text: `+${tokens} paw tokens!` };
}

/** Arcade earnings: small and capped per day so the arcade is fun, not a job. */
export const ARCADE_DAILY_CAP = 15;
export function earnArcade(save: WorldSave, amount: number, day: string): { save: WorldSave; earned: number } {
  const key = `arcade-tokens:${day}`;
  const already = save.dailyCounts[key] ?? 0;
  const earned = Math.max(0, Math.min(Math.floor(amount), ARCADE_DAILY_CAP - already));
  if (!earned) return { save, earned: 0 };
  return { save: { ...withTokens(save, earned), dailyCounts: { ...save.dailyCounts, [key]: already + earned } }, earned };
}

/** Milestone 8: buy one piece of furniture (it goes to your home storage). Atomic and never negative. */
export function buyFurniture(save: WorldSave, id: string, price: number, name: string): EconomyResult {
  if (save.tokens < price) return { ok: false, reason: 'tokens', text: `${name} costs ${price} paw tokens (you have ${save.tokens}).` };
  const furniture = { ...(save.furniture ?? {}) };
  furniture[id] = (furniture[id] ?? 0) + 1;
  return { ok: true, save: { ...withTokens(save, -price), furniture }, text: `${name} will be waiting in your home storage.` };
}

export function setRecord(save: WorldSave, key: string, value: number): { save: WorldSave; isNew: boolean } {
  const prev = save.records[key] ?? 0;
  if (value <= prev) return { save, isNew: false };
  return { save: { ...save, records: { ...save.records, [key]: Math.floor(value) } }, isNew: true };
}

export function bumpRecord(save: WorldSave, key: string, by = 1): WorldSave {
  return { ...save, records: { ...save.records, [key]: (save.records[key] ?? 0) + by } };
}
