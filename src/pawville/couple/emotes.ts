/**
 * Emote catalogue (shared by the town, photo mode, the emote menu and multiplayer).
 * Solo emotes play instantly; shared ones need the partner's consent through the activity
 * coordinator (couple/activitySession.ts). Character-exclusive emotes are validated against the
 * canonical appearance id (coat), never against a nickname.
 *
 * The animation for each emote lives in render/emoteAnim.ts (one timeline per id).
 */
import type { CoatId } from '../appearance.ts';
import type { EmoteId } from '../net/presenceProtocol.ts';

export type EmoteGroup = 'greet' | 'feel' | 'rest' | 'together' | 'signature';

export interface EmoteDef {
  id: EmoteId;
  label: string;
  /** Short tooltip / description shown in the emote menu. */
  tip: string;
  /** Pixel-ish glyph used in the menu icon and as a fallback indicator. */
  icon: string;
  group: EmoteGroup;
  shared: boolean;
  /** Total duration of the animation (ms). */
  ms: number;
  /** Base pose while the emote plays (the timeline can refine it). */
  pose: 'stand' | 'sit' | 'loaf';
  /** Partner must be within this many pixels for shared emotes. */
  range?: number;
  /** Only this character may perform it. */
  exclusive?: CoatId;
}

export const EMOTES: readonly EmoteDef[] = [
  { id: 'wave', label: 'Wave', tip: 'Raise a paw and say hi.', icon: '〜', group: 'greet', shared: false, ms: 1800, pose: 'stand' },
  { id: 'heart', label: 'Heart', tip: 'A warm little heart floats up.', icon: '♥', group: 'feel', shared: false, ms: 2000, pose: 'sit' },
  { id: 'dance', label: 'Happy dance', tip: 'Wiggle side to side with a bouncy tail.', icon: '♪', group: 'feel', shared: false, ms: 2600, pose: 'stand' },
  { id: 'celebrate', label: 'Celebrate', tip: 'Both paws up — hooray!', icon: '★', group: 'feel', shared: false, ms: 2200, pose: 'stand' },
  { id: 'grumble', label: 'Playful huff', tip: 'Puff your cheeks in mock annoyance.', icon: 'huff', group: 'feel', shared: false, ms: 1800, pose: 'sit' },
  { id: 'sorry', label: 'Sorry…', tip: 'Ears down, a small apology.', icon: '…', group: 'feel', shared: false, ms: 2200, pose: 'sit' },
  { id: 'purr', label: 'Happy purr', tip: 'Eyes closed, a contented rumble.', icon: '≋', group: 'feel', shared: false, ms: 2400, pose: 'sit' },
  { id: 'surprised', label: 'Surprised', tip: 'A little hop and wide eyes.', icon: '!', group: 'feel', shared: false, ms: 1400, pose: 'stand' },
  { id: 'bounce', label: 'Playful bounce', tip: 'Hop, hop, hop!', icon: '⤒', group: 'feel', shared: false, ms: 2000, pose: 'stand' },
  { id: 'sleepy', label: 'Sleepy loaf', tip: 'Curl into a loaf and doze off.', icon: 'z', group: 'rest', shared: false, ms: 6000, pose: 'loaf' },
  { id: 'high-five', label: 'High-five', tip: 'Paws meet in the air (partner must agree).', icon: '✋', group: 'together', shared: true, ms: 1600, pose: 'stand', range: 40 },
  { id: 'paw-bump', label: 'Paw bump', tip: 'A gentle bump of paws (partner must agree).', icon: '✊', group: 'together', shared: true, ms: 1600, pose: 'stand', range: 40 },
  { id: 'nose-boop', label: 'Nose boop', tip: 'Lean in for a boop (partner must agree).', icon: '•', group: 'together', shared: true, ms: 1800, pose: 'stand', range: 32 },
  { id: 'hug', label: 'Hug', tip: 'A cuddle with your partner (partner must agree).', icon: '♥♥', group: 'together', shared: true, ms: 3000, pose: 'sit', range: 32 },
  { id: 'sit-together', label: 'Sit together', tip: 'Sit side by side for a while (partner must agree).', icon: '⌒', group: 'together', shared: true, ms: 6000, pose: 'sit', range: 36 },
  {
    id: 'mini-starpaw-serenade', label: 'Starpaw Serenade', tip: 'A little wave with a little magic.', icon: '✦', group: 'signature', shared: false, ms: 3800, pose: 'stand', exclusive: 'mini',
  },
  // ---- Milestone 6 signature emotes (each exclusive to ONE canonical character id) ----
  { id: 'magic-long-stretch', label: 'Long Stretch', tip: 'Front paws forward, back arched — the longest stretch in Pawville.', icon: '⌒', group: 'signature', shared: false, ms: 4200, pose: 'stand', exclusive: 'magic' },
  { id: 'chutki-belly-nap', label: 'Upside-Down Nap', tip: 'Roll over, tummy up, and doze off.', icon: 'z', group: 'signature', shared: false, ms: 7000, pose: 'loaf', exclusive: 'chutki' },
  { id: 'puchu-loud-purr', label: 'Loud Purr', tip: 'A purr you can hear across the plaza (respects your sound settings).', icon: '≋', group: 'signature', shared: false, ms: 4500, pose: 'sit', exclusive: 'puchu' },
  { id: 'tangerine-curious-tilt', label: 'Curious Tilt', tip: 'Head tilt, paw taps, tail swish — what is THAT?', icon: '?', group: 'signature', shared: false, ms: 2800, pose: 'stand', exclusive: 'tangerine' },
  { id: 'midnight-pounce', label: 'Playful Pounce', tip: 'Crouch, wiggle, pounce… then a calm slow blink.', icon: '!', group: 'signature', shared: false, ms: 2600, pose: 'stand', exclusive: 'midnight' },
  { id: 'racon-fence-dance', label: 'Fence Dance', tip: 'Racon stands up, crosses his paws over and over and sways side to side.', icon: '♪', group: 'signature', shared: false, ms: 5200, pose: 'stand', exclusive: 'racon' },
];

/** The signature emote of a canonical character (or undefined). */
export function signatureFor(coat: CoatId): EmoteDef | undefined {
  return EMOTES.find((e) => e.exclusive === coat);
}

export function emoteDef(id: string): EmoteDef | undefined {
  return EMOTES.find((e) => e.id === id);
}

/** May a cat with this canonical appearance perform this emote? (Nicknames are irrelevant.) */
export function canPerform(id: string, coat: CoatId): boolean {
  const d = emoteDef(id);
  return !!d && (!d.exclusive || d.exclusive === coat);
}

/** Emotes offered to a cat (exclusive ones only for their owner). */
export function emotesFor(coat: CoatId): EmoteDef[] {
  return EMOTES.filter((e) => !e.exclusive || e.exclusive === coat);
}

/** If someone without the right character asks for an exclusive emote, they get the ordinary wave. */
export function resolveEmote(id: EmoteId, coat: CoatId): EmoteId {
  return canPerform(id, coat) ? id : 'wave';
}

export function emoteActive(startedAt: number | null, id: EmoteId | null, now: number): boolean {
  if (!id || startedAt === null) return false;
  const d = emoteDef(id);
  return !!d && now - startedAt < d.ms;
}

/**
 * Local emote rate limit: at most one start every `minGapMs`, and at most `burst` starts in
 * `windowMs`. Used both before sending and when accepting remote emote starts.
 */
export function createEmoteLimiter(minGapMs = 500, burst = 6, windowMs = 10_000) {
  const starts: number[] = [];
  return (now: number): boolean => {
    while (starts.length && now - starts[0] > windowMs) starts.shift();
    if (starts.length && now - starts[starts.length - 1] < minGapMs) return false;
    if (starts.length >= burst) return false;
    starts.push(now);
    return true;
  };
}

/** Favourites / quick row (stored with the appearance-independent UI prefs). */
export const DEFAULT_QUICK: readonly EmoteId[] = ['wave', 'heart', 'dance', 'purr'];

/** Quick-emote favourites (UI preference only; stored locally, never sent anywhere). */
export function sanitizeQuick(raw: unknown): EmoteId[] {
  if (!Array.isArray(raw)) return [...DEFAULT_QUICK];
  const out: EmoteId[] = [];
  for (const x of raw) if (typeof x === 'string' && emoteDef(x) && !emoteDef(x)!.shared && !out.includes(x as EmoteId)) out.push(x as EmoteId);
  return out.slice(0, 6);
}
