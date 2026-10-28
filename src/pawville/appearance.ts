/**
 * Cat appearance — separate from player identity and from the Tangerine/Midnight ROLE.
 * Changing coat or cosmetics never changes who you are, your pair, or your progress.
 *
 *   coat      : one of 8 palettes (Tangerine and Midnight are the signature originals)
 *   accessory : the ORIGINAL Paw vs Paw accessory (crown, bow, wizard, bell) — shared with
 *               online Paw vs Paw, whose server whitelists exactly these values
 *   extra     : Pawville-only cosmetics (glasses, scarf, flower, leaf crown, star clip);
 *               they never travel to Paw vs Paw rooms, so the original SQL stays valid.
 */
import type { Accessory } from '../game/types';
import { createStore, isObj, oneOf, type KeyValueStorage } from './persistence.ts';

export type PaletteCoatId = 'tangerine' | 'midnight' | 'mochi' | 'pebble' | 'cocoa' | 'cloud' | 'blossom' | 'mint';
/** Milestone 4 named characters that are not plain palette coats (their markings are part of the identity). */
export type NamedCoatId = 'puchu' | 'chutki' | 'mini' | 'magic' | 'racon';
export type CoatId = PaletteCoatId | NamedCoatId;
/** The 8 palette coats offered in the "Coat" picker (unchanged since Milestone 3). */
export const COATS: readonly PaletteCoatId[] = ['tangerine', 'midnight', 'mochi', 'pebble', 'cocoa', 'cloud', 'blossom', 'mint'];
/** The named characters added in Milestone 4. */
export const NAMED_COATS: readonly NamedCoatId[] = ['puchu', 'chutki', 'mini', 'magic', 'racon'];
/** Every appearance id a client may send or store. Unknown ids always fall back to a default. */
export const ALL_COATS: readonly CoatId[] = [...COATS, ...NAMED_COATS];

export type ExtraId = 'none' | 'glasses' | 'scarf' | 'flower' | 'leafcrown' | 'starclip' | 'captainhat' | 'starcharm';
export const EXTRAS: readonly ExtraId[] = ['none', 'glasses', 'scarf', 'flower', 'leafcrown', 'starclip', 'captainhat', 'starcharm'];

export const ORIGINAL_ACCESSORIES: readonly Accessory[] = ['none', 'crown', 'bow', 'wizard', 'bell'];

export interface CoatInfo {
  id: CoatId;
  name: string;
  /** Eye/pupil style and stripe pattern follow the signature cat this coat is based on. */
  base: 'T' | 'M';
  /** SVG palette (same fields as components/CatCharacter.tsx). */
  svg: {
    fur: string; furLight: string; furDark: string; stripe: string | null; muzzle: string; belly: string; innerEar: string;
    nose: string; eye: string; pupil: string; outline: string; whisker: string; mouth: string; rim: string | null; happyEye: string;
  };
  /** Pixel palette (same keys as render/catSprites.ts). */
  pixel: { o: string; f: string; l: string; d: string; s: string; i: string; e: string; k: string; w: string; m: string; n: string; b: string };
  /** Optional markings drawn on top of the base cat (named characters). Shared by every renderer. */
  marks?: Markings;
  /**
   * Milestone 6: the species. Every renderer checks this instead of assuming all characters are
   * cats (Racon is a raccoon with his own sprite maps, mask, ringed tail and upright dance pose).
   * Missing = 'cat', so every older coat keeps rendering exactly as before.
   */
  species?: 'cat' | 'raccoon';
}

/** Species of an appearance id (unknown ids are cats, so nothing can render as a missing sprite). */
export function speciesOf(coat: CoatId): 'cat' | 'raccoon' {
  return COAT_INFO[coat]?.species ?? 'cat';
}

/**
 * Markings, in sprite-map coordinates ([col, row] in the 16-wide FRONT/BACK/SIDE maps of
 * render/catSprites.ts, before mirroring) and in CatCharacter SVG coordinates.
 */
export interface Markings {
  /** Colour of the dots / patches. */
  color: string;
  front: readonly (readonly [number, number])[];
  back: readonly (readonly [number, number])[];
  side: readonly (readonly [number, number])[];
  /** Extra white chest/belly pixels (front view, [col,row]). */
  bellyFront?: readonly (readonly [number, number])[];
  /** Tail decoration: 'tip' = coloured tail tip, 'dot' = one dot halfway up the tail. */
  tail?: 'tip' | 'dot';
  /** SVG (CatCharacter) dots: [cx, cy, r] on the head (viewBox 0..120). */
  svgHead: readonly (readonly [number, number, number])[];
  /** SVG dots on the body (full pose only). */
  svgBody: readonly (readonly [number, number, number])[];
  /** Optional SVG forehead path (e.g. Chutki's little heart). */
  svgForehead?: string;
  /** Show a white chest blaze in the SVG (Magic). */
  svgChest?: string;
}

export const COAT_INFO: Record<CoatId, CoatInfo> = {
  tangerine: {
    id: 'tangerine', name: 'Tangerine', base: 'T',
    svg: { fur: '#FF8A35', furLight: '#FFB066', furDark: '#E26E1E', stripe: '#C2531A', muzzle: '#FFE9CF', belly: '#FFE2C2', innerEar: '#FFB3A7', nose: '#FF7E9A', eye: '#86E08F', pupil: '#1B1208', outline: '#5A2A0E', whisker: '#FFF6EA', mouth: '#5A2A0E', rim: null, happyEye: '#5A2A0E' },
    pixel: { o: '#5A2A0E', f: '#FF8A35', l: '#FFB066', d: '#E26E1E', s: '#C2531A', i: '#FFB3A7', e: '#86E08F', k: '#1B1208', w: '#FFFFFF', m: '#FFE9CF', n: '#FF7E9A', b: '#FFE2C2' },
  },
  midnight: {
    id: 'midnight', name: 'Midnight', base: 'M',
    svg: { fur: '#252031', furLight: '#463C5A', furDark: '#15121C', stripe: null, muzzle: '#342D42', belly: '#352D44', innerEar: '#7B5277', nose: '#F49AB2', eye: '#FFC23D', pupil: '#120E18', outline: '#08070C', whisker: '#D7CEEE', mouth: '#D7CEEE', rim: '#A89BC9', happyEye: '#FFC23D' },
    pixel: { o: '#6F5FA0', f: '#252031', l: '#463C5A', d: '#15121C', s: '#2B2539', i: '#7B5277', e: '#FFC23D', k: '#120E18', w: '#FFFFFF', m: '#342D42', n: '#F49AB2', b: '#352D44' },
  },
  mochi: {
    id: 'mochi', name: 'Mochi', base: 'T',
    svg: { fur: '#FFF6EA', furLight: '#FFFFFF', furDark: '#E9DCCF', stripe: null, muzzle: '#FFFFFF', belly: '#FFFFFF', innerEar: '#FFC2CC', nose: '#FF8FA3', eye: '#7EC8F2', pupil: '#1B1208', outline: '#8A7A6B', whisker: '#B9AEC6', mouth: '#8A7A6B', rim: null, happyEye: '#8A7A6B' },
    pixel: { o: '#8A7A6B', f: '#FFF6EA', l: '#FFFFFF', d: '#E9DCCF', s: '#E9DCCF', i: '#FFC2CC', e: '#7EC8F2', k: '#1B1208', w: '#FFFFFF', m: '#FFFFFF', n: '#FF8FA3', b: '#FFFFFF' },
  },
  pebble: {
    id: 'pebble', name: 'Pebble', base: 'T',
    svg: { fur: '#9A93A8', furLight: '#BDB7C9', furDark: '#7A7389', stripe: '#6C6578', muzzle: '#E3DEEC', belly: '#D9D3E3', innerEar: '#E2A9BC', nose: '#F49AB2', eye: '#A6E07E', pupil: '#120E18', outline: '#3E3A48', whisker: '#F2EEF8', mouth: '#3E3A48', rim: null, happyEye: '#3E3A48' },
    pixel: { o: '#3E3A48', f: '#9A93A8', l: '#BDB7C9', d: '#7A7389', s: '#6C6578', i: '#E2A9BC', e: '#A6E07E', k: '#120E18', w: '#FFFFFF', m: '#E3DEEC', n: '#F49AB2', b: '#D9D3E3' },
  },
  cocoa: {
    id: 'cocoa', name: 'Cocoa', base: 'T',
    svg: { fur: '#8A5A3B', furLight: '#A8754F', furDark: '#6B4329', stripe: '#5A3622', muzzle: '#E9CBA8', belly: '#DDBB96', innerEar: '#E8A79A', nose: '#E07A8A', eye: '#FFC94A', pupil: '#1B1208', outline: '#3A2416', whisker: '#FFF3E6', mouth: '#3A2416', rim: null, happyEye: '#3A2416' },
    pixel: { o: '#3A2416', f: '#8A5A3B', l: '#A8754F', d: '#6B4329', s: '#5A3622', i: '#E8A79A', e: '#FFC94A', k: '#1B1208', w: '#FFFFFF', m: '#E9CBA8', n: '#E07A8A', b: '#DDBB96' },
  },
  cloud: {
    id: 'cloud', name: 'Cloud', base: 'M',
    svg: { fur: '#AFC3DA', furLight: '#D4E2F1', furDark: '#8DA3BD', stripe: null, muzzle: '#E8F0FA', belly: '#E1EAF5', innerEar: '#E7B6C8', nose: '#F49AB2', eye: '#FFC23D', pupil: '#1B2433', outline: '#45546A', whisker: '#FFFFFF', mouth: '#45546A', rim: null, happyEye: '#45546A' },
    pixel: { o: '#45546A', f: '#AFC3DA', l: '#D4E2F1', d: '#8DA3BD', s: '#8DA3BD', i: '#E7B6C8', e: '#FFC23D', k: '#1B2433', w: '#FFFFFF', m: '#E8F0FA', n: '#F49AB2', b: '#E1EAF5' },
  },
  blossom: {
    id: 'blossom', name: 'Blossom', base: 'T',
    svg: { fur: '#F2B6C8', furLight: '#FBD3DF', furDark: '#DE93AA', stripe: '#D27E98', muzzle: '#FFF0F4', belly: '#FFE6EE', innerEar: '#FF8FB1', nose: '#E0607E', eye: '#86E08F', pupil: '#2A1220', outline: '#7A3A52', whisker: '#FFFFFF', mouth: '#7A3A52', rim: null, happyEye: '#7A3A52' },
    pixel: { o: '#7A3A52', f: '#F2B6C8', l: '#FBD3DF', d: '#DE93AA', s: '#D27E98', i: '#FF8FB1', e: '#86E08F', k: '#2A1220', w: '#FFFFFF', m: '#FFF0F4', n: '#E0607E', b: '#FFE6EE' },
  },
  mint: {
    id: 'mint', name: 'Mint', base: 'M',
    svg: { fur: '#A9D8C2', furLight: '#CDEBDD', furDark: '#86BFA5', stripe: null, muzzle: '#EAF7F0', belly: '#E0F2E9', innerEar: '#F2B3C2', nose: '#F49AB2', eye: '#C79BFF', pupil: '#16211C', outline: '#2F5A49', whisker: '#FFFFFF', mouth: '#2F5A49', rim: null, happyEye: '#2F5A49' },
    pixel: { o: '#2F5A49', f: '#A9D8C2', l: '#CDEBDD', d: '#86BFA5', s: '#86BFA5', i: '#F2B3C2', e: '#C79BFF', k: '#16211C', w: '#FFFFFF', m: '#EAF7F0', n: '#F49AB2', b: '#E0F2E9' },
  },
  // ---- Milestone 4 named characters ----
  puchu: {
    id: 'puchu', name: 'Puchu', base: 'T',
    svg: { fur: '#FFF8F0', furLight: '#FFFFFF', furDark: '#EADFD3', stripe: null, muzzle: '#FFFFFF', belly: '#FFFFFF', innerEar: '#FFB8C2', nose: '#FF8FA3', eye: '#D9A441', pupil: '#2A1608', outline: '#7A6556', whisker: '#B9AEC6', mouth: '#7A6556', rim: null, happyEye: '#7A6556' },
    pixel: { o: '#7A6556', f: '#FFF8F0', l: '#FFFFFF', d: '#EADFD3', s: '#F3E9DE', i: '#FFB8C2', e: '#E0A640', k: '#2A1608', w: '#FFFFFF', m: '#FFFFFF', n: '#FF8FA3', b: '#FFFFFF' },
    marks: {
      color: '#FF9A3D',
      front: [[3, 4], [12, 7], [4, 10], [11, 12], [10, 3]],
      back: [[4, 4], [11, 6], [6, 9], [10, 11], [3, 11], [8, 3]],
      side: [[6, 3], [9, 10], [6, 11], [12, 11], [11, 9]],
      tail: 'dot',
      svgHead: [[41, 40, 2.4], [79, 37, 1.9], [85, 59, 2.1], [35, 62, 1.7]],
      svgBody: [[44, 99, 2.6], [77, 107, 2.1], [70, 91, 1.8], [52, 113, 1.7]],
    },
  },
  chutki: {
    id: 'chutki', name: 'Chutki', base: 'T',
    svg: { fur: '#FFF8F0', furLight: '#FFFFFF', furDark: '#EADFD3', stripe: null, muzzle: '#FFFFFF', belly: '#FFFFFF', innerEar: '#FFB8C2', nose: '#FF8FA3', eye: '#7EC86A', pupil: '#16210F', outline: '#7A6556', whisker: '#B9AEC6', mouth: '#7A6556', rim: null, happyEye: '#7A6556' },
    pixel: { o: '#7A6556', f: '#FFF8F0', l: '#FFFFFF', d: '#EADFD3', s: '#F3E9DE', i: '#FFB8C2', e: '#86D46F', k: '#16210F', w: '#FFFFFF', m: '#FFFFFF', n: '#FF8FA3', b: '#FFFFFF' },
    marks: {
      color: '#FF9A3D',
      // Chutki's signature: a small orange heart on the forehead + an orange tail tip, fewer body dots.
      // Milestone 10: plus her bold orange patches — the left ear and a saddle patch — so she is never mistaken for Puchu.
      front: [[6, 3], [9, 3], [7, 4], [8, 4], [12, 11], [3, 8], [2, 0], [2, 1], [3, 1], [2, 2], [3, 2], [11, 10], [12, 10], [12, 12], [13, 11]],
      back: [[7, 3], [8, 3], [5, 10], [12, 8], [13, 0], [13, 1], [12, 1], [13, 2], [12, 2], [4, 9], [5, 9], [4, 10], [4, 11], [5, 11]],
      side: [[4, 3], [5, 3], [5, 4], [11, 11], [7, 10], [3, 0], [3, 1], [4, 1], [8, 9], [9, 9], [10, 9], [9, 10], [10, 10], [8, 10]],
      tail: 'tip',
      svgHead: [[82, 60, 2], [37, 46, 1.6]],
      svgBody: [[41, 104, 2.3], [79, 96, 1.8]],
      svgForehead: 'M60 41 C54.5 36.5 54 31 57.6 30.6 C59 30.4 59.8 31.6 60 32.6 C60.2 31.6 61 30.4 62.4 30.6 C66 31 65.5 36.5 60 41 Z',
    },
  },
  mini: {
    id: 'mini', name: 'Mini', base: 'M',
    svg: { fur: '#8F949D', furLight: '#B6BBC4', furDark: '#6D727B', stripe: null, muzzle: '#C9CDD4', belly: '#B3B8C0', innerEar: '#E2A9BC', nose: '#F49AB2', eye: '#2EE86A', pupil: '#0E1A12', outline: '#3A3D44', whisker: '#F2F4F7', mouth: '#3A3D44', rim: null, happyEye: '#2EE86A' },
    pixel: { o: '#3A3D44', f: '#8F949D', l: '#B6BBC4', d: '#6D727B', s: '#7C818A', i: '#E2A9BC', e: '#2EE86A', k: '#0E1A12', w: '#E9FFF0', m: '#C9CDD4', n: '#F49AB2', b: '#B3B8C0' },
  },
  magic: {
    id: 'magic', name: 'Magic', base: 'T',
    svg: { fur: '#8B5A36', furLight: '#A8754C', furDark: '#6B4226', stripe: '#5E3A22', muzzle: '#FFF8EE', belly: '#FFFAF2', innerEar: '#E8A79A', nose: '#E07A8A', eye: '#B8732E', pupil: '#24120A', outline: '#3A2214', whisker: '#FFF3E6', mouth: '#3A2214', rim: null, happyEye: '#3A2214' },
    pixel: { o: '#3A2214', f: '#8B5A36', l: '#A8754C', d: '#6B4226', s: '#6E4529', i: '#E8A79A', e: '#C98436', k: '#24120A', w: '#FFF3E0', m: '#FFF8EE', n: '#E07A8A', b: '#FFFAF2' },
    marks: {
      color: '#5E3A22',
      front: [],
      back: [[5, 4], [10, 4], [7, 7], [8, 7]],
      side: [[6, 4], [7, 4]],
      bellyFront: [[6, 9], [7, 9], [8, 9], [9, 9], [5, 10], [10, 10], [5, 11], [10, 11], [5, 12], [10, 12]],
      svgHead: [],
      svgBody: [],
      svgChest: 'M48 84 C52 79 68 79 72 84 C74 96 70 112 60 116 C50 112 46 96 48 84 Z',
    },
  },
  // ---- Milestone 6: Racon, the dancing raccoon (NOT a cat) ----
  racon: {
    id: 'racon', name: 'Racon', base: 'T', species: 'raccoon',
    // svg: used for the vector portrait (components/CatCharacter.tsx draws a raccoon for this species)
    svg: { fur: '#8E8A98', furLight: '#B9B5C2', furDark: '#68646F', stripe: '#3A3542', muzzle: '#F4F1F6', belly: '#CFCBD6', innerEar: '#4A4552', nose: '#1E1A22', eye: '#5A3A24', pupil: '#120E12', outline: '#2A2530', whisker: '#FFFFFF', mouth: '#2A2530', rim: null, happyEye: '#F4F1F6' },
    // pixel: k = the black mask, m = the white face, s = tail rings / dark fur, e = shiny eye
    pixel: { o: '#2A2530', f: '#8E8A98', l: '#B9B5C2', d: '#68646F', s: '#3A3542', i: '#4A4552', e: '#7A4E2E', k: '#211D27', w: '#FFFFFF', m: '#F4F1F6', n: '#1E1A22', b: '#CFCBD6' },
  },
};

/**
 * Canonical character identities (Milestone 4). A character is a named, recognisable cat; its
 * appearance id is also its coat id, so the renderer, wardrobe, home, photos and multiplayer all
 * use ONE definition. Nicknames are separate and never change the character.
 */
export type CharacterId = 'tangerine' | 'midnight' | 'puchu' | 'chutki' | 'mini' | 'magic' | 'racon';
export interface CharacterDef {
  id: CharacterId;
  name: string;
  coat: CoatId;
  baseCoat: string;
  marking: 'tabby stripes' | 'solid with lavender rim' | 'small orange dots' | 'orange heart + dots' | 'soft grey' | 'white tummy' | 'mask + ringed tail';
  /** Milestone 6: species shown in the wardrobe ('cat' unless stated). */
  species?: 'cat' | 'raccoon';
  /** Milestone 6: the character's signature emote (exclusive to this canonical id). */
  signature?: string;
  eyeColorName: string;
  eyeColor: string;
  belly: string | null;
  description: string;
}
export const CHARACTERS: readonly CharacterDef[] = [
  { id: 'tangerine', name: 'Tangerine', coat: 'tangerine', baseCoat: 'Orange tabby', marking: 'tabby stripes', eyeColorName: 'Green', eyeColor: '#86E08F', belly: '#FFE2C2', description: 'The original orange troublemaker. Tilts her head at everything.', signature: 'tangerine-curious-tilt' },
  { id: 'midnight', name: 'Midnight', coat: 'midnight', baseCoat: 'Black', marking: 'solid with lavender rim', eyeColorName: 'Amber', eyeColor: '#FFC23D', belly: null, description: 'Sleek, mysterious, secretly soft. Pounces when nobody is looking.', signature: 'midnight-pounce' },
  { id: 'puchu', name: 'Puchu', coat: 'puchu', baseCoat: 'White', marking: 'small orange dots', eyeColorName: 'Warm honey', eyeColor: '#E0A640', belly: '#FFFFFF', description: 'White with scattered little orange dots — and one on the tail. Famous for a very loud purr.', signature: 'puchu-loud-purr' },
  { id: 'chutki', name: 'Chutki', coat: 'chutki', baseCoat: 'White', marking: 'orange heart + dots', eyeColorName: 'Leaf green', eyeColor: '#86D46F', belly: '#FFFFFF', description: 'Puchu’s look-alike: an orange heart on the forehead and an orange tail tip. Naps belly-up.', signature: 'chutki-belly-nap' },
  { id: 'mini', name: 'Mini', coat: 'mini', baseCoat: 'Grey', marking: 'soft grey', eyeColorName: 'Emerald green', eyeColor: '#2EE86A', belly: '#B3B8C0', description: 'A grey cat with striking emerald eyes. Has a magic wave.', signature: 'mini-starpaw-serenade' },
  { id: 'magic', name: 'Magic', coat: 'magic', baseCoat: 'Warm brown', marking: 'white tummy', eyeColorName: 'Brown', eyeColor: '#C98436', belly: '#FFFAF2', description: 'Cocoa-brown with a bright white tummy and brown eyes. Does the longest stretches in town.', signature: 'magic-long-stretch' },
  { id: 'racon', name: 'Racon', coat: 'racon', baseCoat: 'Silver-grey raccoon', marking: 'mask + ringed tail', eyeColorName: 'Shiny brown', eyeColor: '#7A4E2E', belly: '#CFCBD6', species: 'raccoon', description: 'Not a cat! A raccoon with a bandit mask, a ringed tail and one legendary fence dance.', signature: 'racon-fence-dance' },
];
export const CHARACTER_IDS: readonly CharacterId[] = CHARACTERS.map((c) => c.id);
export function characterFor(coat: CoatId): CharacterDef | undefined {
  return CHARACTERS.find((c) => c.coat === coat);
}
/** Safe lookup for any (possibly network-supplied) id: unknown ids never produce a missing sprite. */
export function normalizeCoat(raw: unknown, fallback: CoatId = 'tangerine'): CoatId {
  return ALL_COATS.includes(raw as CoatId) ? (raw as CoatId) : fallback;
}

export const EXTRA_LABEL: Record<ExtraId, string> = {
  none: 'Nothing extra', glasses: 'Round glasses', scarf: 'Cozy scarf', flower: 'Flower clip', leafcrown: 'Leaf crown', starclip: 'Star clip',
  captainhat: "Captain's hat", starcharm: 'Lumi star charm',
};

/** Extras earned through play (everything else is free from the start). */
export const EXTRA_UNLOCK: Partial<Record<ExtraId, { hint: string }>> = {
  leafcrown: { hint: 'Grow your first flower in the shared garden.' },
  starclip: { hint: 'Make a wish on a shooting star.' },
  captainhat: { hint: 'Help Captain Marlow reopen Pawport Harbor.' },
  starcharm: { hint: 'Finish the adventure “The Lost Star”.' },
};

export interface Appearance {
  coat: CoatId;
  extra: ExtraId;
}

export const defaultCoatFor = (role: 'T' | 'M'): CoatId => (role === 'T' ? 'tangerine' : 'midnight');

export function sanitizeAppearance(raw: unknown, role: 'T' | 'M' = 'T'): Appearance {
  const r = isObj(raw) ? raw : {};
  return { coat: oneOf(r.coat, ALL_COATS, defaultCoatFor(role)), extra: oneOf(r.extra, EXTRAS, 'none') };
}

/** Milestone 2 stored only the walking cat ('T' | 'M') under "pawville:cat". */
export function appearanceStore(storage?: KeyValueStorage | null) {
  return createStore<Appearance>({
    key: 'appearance',
    version: 1,
    defaults: () => ({ coat: 'tangerine', extra: 'none' }),
    sanitize: (raw) => sanitizeAppearance(raw),
    legacy: (s) => {
      const old = s.getItem('pawville:cat');
      return old === 'M' ? { coat: 'midnight', extra: 'none' } : old === 'T' ? { coat: 'tangerine', extra: 'none' } : undefined;
    },
  }, storage);
}
