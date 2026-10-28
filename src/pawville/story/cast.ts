/** Who can speak in a story scene: display name and portrait (cat looks match the existing NPC definitions). */
import type { CoatId, ExtraId } from '../appearance.ts';

export interface Speaker { name: string; coat?: CoatId; extra?: ExtraId; lumi?: true }

export const CAST: Record<string, Speaker> = {
  narr: { name: '' },
  lumi: { name: 'Lumi', lumi: true },
  biscuit: { name: 'Biscuit', coat: 'mochi', extra: 'scarf' },
  velvet: { name: 'Mr. Velvet', coat: 'midnight', extra: 'glasses' },
  crumpet: { name: 'Crumpet', coat: 'tangerine', extra: 'starcharm' },
  marlow: { name: 'Captain Marlow', coat: 'cocoa', extra: 'captainhat' },
  kelp: { name: 'Kelp', coat: 'mochi', extra: 'none' },
  tide: { name: 'Tide', coat: 'pebble', extra: 'glasses' },
  dewey: { name: 'Dewey', coat: 'cocoa', extra: 'glasses' },
  pemberton: { name: 'Mr. Pemberton', coat: 'cocoa', extra: 'glasses' },
  fern: { name: 'Fern', coat: 'mint', extra: 'flower' },
  moss: { name: 'Moss', coat: 'magic', extra: 'scarf' },
  pepper: { name: 'Pepper', coat: 'midnight', extra: 'starclip' },
  wren: { name: 'Wren', coat: 'blossom', extra: 'glasses' },
  sky: { name: 'Sky', coat: 'cloud', extra: 'starclip' },
  thistle: { name: 'Thistle', coat: 'mint', extra: 'flower' },
  starling: { name: 'Starling', coat: 'midnight', extra: 'starclip' },
  snowdrop: { name: 'Snowdrop', coat: 'puchu', extra: 'starclip' },
  latte: { name: 'Latte', coat: 'blossom', extra: 'scarf' },
  rosie: { name: 'Rosie', coat: 'blossom', extra: 'flower' },
  clementine: { name: 'Clementine', coat: 'mint', extra: 'glasses' },
  ozzie: { name: 'Ozzie', coat: 'pebble', extra: 'starclip' },
  mabel: { name: 'Mabel', coat: 'cloud', extra: 'glasses' },
  sol: { name: 'Sol', coat: 'tangerine', extra: 'scarf' },
  folio: { name: 'Folio', coat: 'mochi', extra: 'none' },
  geode: { name: 'Geode', coat: 'racon', extra: 'none' },
};

export const speakerName = (who: string | undefined, fallback: string): string => (who && CAST[who]?.name) || fallback;
