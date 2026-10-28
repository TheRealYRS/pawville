import { memo, useId, useMemo, type CSSProperties } from 'react';
import type { Accessory, CatMood, Seat } from '../game/types';
import { COAT_INFO, type CoatId } from '../pawville/appearance.ts';
import { RaccoonPortrait } from '../pawville/components/RaccoonPortrait';
/**
 * Original, fully-vector cat characters. No external assets, so they can never fail to load.
 *   Tangerine (T): orange tabby, cream muzzle, green eyes, mischievous.
 *   Midnight  (M): sleek black cat, amber slit eyes, lavender rim light, mysterious.
 * Pawville (Milestone 3): an optional `coat` recolours the same drawing (8 palettes). Without a
 * coat the original Tangerine/Midnight palettes are used exactly as before.
 */
interface Palette {
  fur: string;
  furLight: string;
  furDark: string;
  stripe: string | null;
  muzzle: string;
  belly: string;
  innerEar: string;
  nose: string;
  eye: string;
  pupil: string;
  outline: string;
  whisker: string;
  mouth: string;
  rim: string | null;
  happyEye: string;
}
const PALETTES: Record<Seat, Palette> = {
  T: {
    fur: '#FF8A35', furLight: '#FFB066', furDark: '#E26E1E', stripe: '#C2531A',
    muzzle: '#FFE9CF', belly: '#FFE2C2', innerEar: '#FFB3A7', nose: '#FF7E9A',
    eye: '#86E08F', pupil: '#1B1208', outline: '#5A2A0E', whisker: '#FFF6EA',
    mouth: '#5A2A0E', rim: null, happyEye: '#5A2A0E',
  },
  M: {
    fur: '#252031', furLight: '#463C5A', furDark: '#15121C', stripe: null,
    muzzle: '#342D42', belly: '#352D44', innerEar: '#7B5277', nose: '#F49AB2',
    eye: '#FFC23D', pupil: '#120E18', outline: '#08070C', whisker: '#D7CEEE',
    mouth: '#D7CEEE', rim: '#A89BC9', happyEye: '#FFC23D',
  },
};
export interface CatCharacterProps {
  cat: Seat;
  mood?: CatMood;
  accessory?: Accessory;
  /** 'full' = whole cat (panels, home). 'head' = big readable face (board tokens, small icons). */
  pose?: 'full' | 'head';
  /** -1..1 per axis: where the cat is looking (e.g. toward the last move). */
  look?: { x: number; y: number };
  size?: number | string;
  flip?: boolean;
  className?: string;
  /** Accessible name. Omit for decorative usage (then aria-hidden). */
  title?: string;
  /** Disable idle animations (e.g. many tokens on the board). */
  still?: boolean;
  /** Pawville coat palette. Eye shape still follows `cat` (Midnight-based coats keep slit pupils). */
  coat?: CoatId;
}
// Milestone 6 (additive): Racon is a raccoon, so he gets his own portrait. Every other coat —
// and every Paw vs Paw screen, which never passes a coat — renders exactly as before. The branch is
// a separate component so switching characters never changes the hook order.
function CatCharacterImpl(props: CatCharacterProps) {
  const { coat } = props;
  if (coat && COAT_INFO[coat]?.species === 'raccoon') {
    return <RaccoonPortrait mood={props.mood} pose={props.pose} size={props.size} flip={props.flip} className={props.className} title={props.title} accessory={props.accessory} />;
  }
  return <CatSvgImpl {...props} />;
}

function CatSvgImpl({
  cat, mood = 'idle', accessory = 'none', pose = 'full', look, size = 120, flip = false,
  className = '', title, still = false, coat,
}: CatCharacterProps) {
  const p: Palette = coat && COAT_INFO[coat] ? COAT_INFO[coat].svg : PALETTES[cat];
  const slit = coat && COAT_INFO[coat] ? COAT_INFO[coat].base === 'M' : cat === 'M';
  const darkBody = coat ? coat === 'midnight' : cat === 'M';
  // Named-character markings (Puchu/Chutki dots, Chutki's forehead heart, Magic's white chest).
  const marks = coat && COAT_INFO[coat] ? COAT_INFO[coat].marks : undefined;
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const gradId = `cat-head-${uid}`;
  const bodyGradId = `cat-body-${uid}`;
  // Randomised idle timing so two cats never blink in sync.
  const timing = useMemo(
    () =>
      ({
        '--blink-dur': `${(3.6 + Math.random() * 2.8).toFixed(2)}s`,
        '--blink-delay': `${(Math.random() * 3).toFixed(2)}s`,
        '--twitch-dur': `${(5 + Math.random() * 4).toFixed(2)}s`,
        '--twitch-delay': `${(Math.random() * 4).toFixed(2)}s`,
        '--tail-dur': `${(2.4 + Math.random() * 1.2).toFixed(2)}s`,
        '--breathe-dur': `${(3 + Math.random()).toFixed(2)}s`,
      }) as CSSProperties,
    [],
  );
  const lookX = mood === 'thinking' ? 0.8 : Math.max(-1, Math.min(1, look?.x ?? 0));
  const lookY = mood === 'thinking' ? -0.8 : Math.max(-1, Math.min(1, look?.y ?? 0));
  const headTransform =
    mood === 'thinking' ? 'rotate(-9 60 60)'
    : mood === 'surprised' ? 'translate(0 -2)'
    : mood === 'sad' ? 'translate(0 3) rotate(5 60 60)'
    : mood === 'playful' ? 'rotate(6 60 60)'
    : undefined;
  const leftEar =
    mood === 'sad' ? 'rotate(-30 42 38)'
    : mood === 'surprised' ? 'translate(0 -3) rotate(-4 42 38)'
    : mood === 'happy' || mood === 'victorious' ? 'translate(0 -1.5)'
    : undefined;
  const rightEar =
    mood === 'sad' ? 'rotate(30 78 38)'
    : mood === 'surprised' ? 'translate(0 -3) rotate(4 78 38)'
    : mood === 'happy' || mood === 'victorious' ? 'translate(0 -1.5)'
    : mood === 'thinking' ? 'rotate(10 78 38)'
    : undefined;
  const viewBox = pose === 'head' ? '13 -6 94 98' : '0 -8 120 138';
  const rimStroke = p.rim ? { stroke: p.rim, strokeOpacity: 0.6, strokeWidth: 1.5 } : {};
  // Ears and cheek fluff: rim colour (when the palette has one) replaces the outline colour.
  // Same rendered result as before, without specifying `stroke` twice (TS2783).
  const earStroke = p.rim ?? p.outline;
  const earStrokeOpacity = p.rim ? 0.5 : undefined;
  const cheekStrokeOpacity = p.rim ? 0.4 : undefined;
  const eye = (cx: number, wink: boolean) => {
    if (mood === 'happy' || mood === 'victorious' || wink) {
      return (
        <path
          d={`M${cx - 6} ${54} Q${cx} ${46} ${cx + 6} ${54}`}
          fill="none" stroke={p.happyEye} strokeWidth={3} strokeLinecap="round"
        />
      );
    }
    const surprised = mood === 'surprised';
    const rx = surprised ? 7.4 : 6.2;
    const ry = surprised ? 8.4 : 7.2;
    const px = cx + lookX * 1.8;
    const py = 52 + lookY * 1.6;
    return (
      <g className={still ? undefined : 'cat-blink'}>
        <ellipse cx={cx} cy={52} rx={rx} ry={ry} fill={p.eye} stroke={p.outline} strokeWidth={1.3} />
        {surprised ? (
          <circle cx={px} cy={py} r={2.4} fill={p.pupil} />
        ) : slit ? (
          <ellipse cx={px} cy={py} rx={2} ry={5.6} fill={p.pupil} />
        ) : (
          <ellipse cx={px} cy={py} rx={3.4} ry={4.8} fill={p.pupil} />
        )}
        <circle cx={cx - 2.2} cy={49} r={1.8} fill="#fff" />
        <circle cx={cx + 2} cy={55} r={0.9} fill="#fff" opacity={0.85} />
        {mood === 'sad' && (
          <path d={`M${cx - 7.5} ${43} H${cx + 7.5} V${50} Q${cx} ${53} ${cx - 7.5} ${50} Z`} fill={p.fur} />
        )}
      </g>
    );
  };
  const mouth = (() => {
    switch (mood) {
      case 'victorious':
        return (
          <>
            <path d="M53.5 66 Q60 77 66.5 66 Z" fill="#7A2638" stroke={p.mouth} strokeWidth={1.2} strokeLinejoin="round" />
            <ellipse cx={60} cy={70.5} rx={3} ry={2} fill="#FF8FA3" />
          </>
        );
      case 'surprised':
        return <ellipse cx={60} cy={69} rx={2.6} ry={3.3} fill="#3B1420" stroke={p.mouth} strokeWidth={1} />;
      case 'sad':
        return <path d="M55 70.5 Q60 66.5 65 70.5" fill="none" stroke={p.mouth} strokeWidth={1.6} strokeLinecap="round" />;
      case 'thinking':
        return <path d="M57 68.5 Q60.5 67 64 68.5" fill="none" stroke={p.mouth} strokeWidth={1.6} strokeLinecap="round" />;
      case 'playful':
        return (
          <>
            <ellipse cx={61.5} cy={69.5} rx={2.4} ry={3} fill="#FF8FA3" />
            <path d="M60 63.5 V66 M60 66 Q57.5 69 54.5 67.5 M60 66 Q62.5 69 65.5 67.5" fill="none" stroke={p.mouth} strokeWidth={1.5} strokeLinecap="round" />
          </>
        );
      case 'happy':
        return <path d="M60 63.5 V66 M60 66 Q56.5 70.5 53 67.5 M60 66 Q63.5 70.5 67 67.5" fill="none" stroke={p.mouth} strokeWidth={1.6} strokeLinecap="round" />;
      default:
        return <path d="M60 63.5 V66 M60 66 Q57.5 69 54.5 67.5 M60 66 Q62.5 69 65.5 67.5" fill="none" stroke={p.mouth} strokeWidth={1.5} strokeLinecap="round" />;
    }
  })();
  const blushOpacity = mood === 'happy' || mood === 'victorious' || mood === 'playful' ? 0.55 : 0.25;
  const accessoryEl = (() => {
    switch (accessory) {
      case 'crown':
        return (
          <g className="cat-accessory">
            <path d="M46 28 L48 14 L54.5 21.5 L60 10.5 L65.5 21.5 L72 14 L74 28 Z" fill="#FFCB4A" stroke="#B7791F" strokeWidth={1.3} strokeLinejoin="round" />
            <rect x={46} y={25} width={28} height={4} rx={1.5} fill="#F2B233" stroke="#B7791F" strokeWidth={1} />
            <circle cx={60} cy={19.5} r={2} fill="#FF6FA1" />
            <circle cx={50} cy={22.5} r={1.3} fill="#7ED6F6" />
            <circle cx={70} cy={22.5} r={1.3} fill="#7ED6F6" />
          </g>
        );
      case 'bow':
        return (
          <g className="cat-accessory" transform="rotate(-18 77 27)">
            <path d="M77 27 L66 20 Q63 27 66 34 Z" fill="#FF6FA1" stroke="#C93D74" strokeWidth={1.1} strokeLinejoin="round" />
            <path d="M77 27 L88 20 Q91 27 88 34 Z" fill="#FF6FA1" stroke="#C93D74" strokeWidth={1.1} strokeLinejoin="round" />
            <circle cx={77} cy={27} r={3.4} fill="#E04D85" stroke="#C93D74" strokeWidth={1} />
          </g>
        );
      case 'wizard':
        return (
          <g className="cat-accessory" transform="rotate(-8 60 29)">
            <path d="M43 29 L58 -3 Q60 -6 62 -2 L77 29 Z" fill="#6B4FBF" stroke="#3E2B7A" strokeWidth={1.2} strokeLinejoin="round" />
            <path d="M45.5 24 L74.5 24" stroke="#FFCB4A" strokeWidth={3} />
            <ellipse cx={60} cy={29} rx={24} ry={4.6} fill="#5B3FA8" stroke="#3E2B7A" strokeWidth={1.2} />
            <path d="M55 12 l1.2 2.6 2.8.3-2.1 1.9.6 2.8-2.5-1.4-2.5 1.4.6-2.8-2.1-1.9 2.8-.3z" fill="#FFCB4A" />
            <circle cx={66} cy={17} r={1.3} fill="#FFE9A8" />
          </g>
        );
      case 'bell':
        return (
          <g className="cat-accessory">
            <path d="M40 79 Q60 90 80 79" fill="none" stroke="#E0475C" strokeWidth={4.5} strokeLinecap="round" />
            <circle cx={60} cy={88} r={5} fill="#FFCB4A" stroke="#B7791F" strokeWidth={1.2} />
            <path d="M56 88 H64 M60 88 V92" stroke="#8A5A12" strokeWidth={1.2} strokeLinecap="round" />
          </g>
        );
      default:
        return null;
    }
  })();
  const head = (
    <g transform={headTransform}>
      <g className={still ? undefined : 'cat-head-bob'}>
        {/* ears */}
        <g transform={leftEar}>
          <path d="M29 46 L32 15 Q33 11 36.5 13 L57 31 Z" fill={p.fur} stroke={earStroke} strokeOpacity={earStrokeOpacity} strokeWidth={1.4} strokeLinejoin="round" />
          <path d="M34.5 38 L36.5 20 L50 31.5 Z" fill={p.innerEar} />
        </g>
        <g transform={rightEar}>
          <g className={still ? undefined : 'cat-ear-twitch'}>
            <path d="M91 46 L88 15 Q87 11 83.5 13 L63 31 Z" fill={p.fur} stroke={earStroke} strokeOpacity={earStrokeOpacity} strokeWidth={1.4} strokeLinejoin="round" />
            <path d="M85.5 38 L83.5 20 L70 31.5 Z" fill={p.innerEar} />
          </g>
        </g>
        {/* cheek fluff + head */}
        <path d="M28 56 L21 59 L28.5 62 L23 66 L31 66" fill={p.fur} stroke={earStroke} strokeOpacity={cheekStrokeOpacity} strokeWidth={1.2} strokeLinejoin="round" />
        <path d="M92 56 L99 59 L91.5 62 L97 66 L89 66" fill={p.fur} stroke={earStroke} strokeOpacity={cheekStrokeOpacity} strokeWidth={1.2} strokeLinejoin="round" />
        <ellipse cx={60} cy={54} rx={33} ry={28} fill={`url(#${gradId})`} stroke={p.outline} strokeWidth={1.5} {...rimStroke} />
        {p.stripe && (
          <g stroke={p.stripe} strokeWidth={3.2} strokeLinecap="round" fill="none">
            <path d="M54 28 L55.5 36" />
            <path d="M60 26.5 V36.5" />
            <path d="M66 28 L64.5 36" />
            <path d="M28.5 48 L36 50" />
            <path d="M29 54 L35.5 54.5" />
            <path d="M91.5 48 L84 50" />
            <path d="M91 54 L84.5 54.5" />
          </g>
        )}
        {/* eyes (wink = left eye closed when playful) */}
        {marks && (
          <g className="cat-marks">
            {marks.svgHead.map(([cx, cy, r], i) => <circle key={i} cx={cx} cy={cy} r={r} fill={marks.color} />)}
            {marks.svgForehead && <path d={marks.svgForehead} fill={marks.color} />}
          </g>
        )}
        {eye(46.5, mood === 'playful')}
        {eye(73.5, false)}
        {/* muzzle */}
        <ellipse cx={54.5} cy={64.5} rx={7.5} ry={6} fill={p.muzzle} />
        <ellipse cx={65.5} cy={64.5} rx={7.5} ry={6} fill={p.muzzle} />
        <ellipse cx={39} cy={63} rx={4.5} ry={2.6} fill="#FF8FA3" opacity={blushOpacity} />
        <ellipse cx={81} cy={63} rx={4.5} ry={2.6} fill="#FF8FA3" opacity={blushOpacity} />
        <path d="M56.6 59.4 H63.4 Q64.4 59.4 63.8 60.3 L60.9 63.4 Q60 64.2 59.1 63.4 L56.2 60.3 Q55.6 59.4 56.6 59.4 Z" fill={p.nose} />
        {mouth}
        <g stroke={p.whisker} strokeWidth={1.2} strokeLinecap="round" opacity={0.85}>
          <path d="M45 64 L25 60.5" />
          <path d="M45 67 L25.5 69.5" />
          <path d="M75 64 L95 60.5" />
          <path d="M75 67 L94.5 69.5" />
        </g>
        {mood === 'sad' && <path d="M78 63 q2 3.5 0 5 q-2 -1.5 0 -5 z" fill="#9FD3FF" opacity={0.9} />}
        {accessory !== 'bell' && accessoryEl}
      </g>
    </g>
  );
  return (
    <svg
      className={`cat cat--${cat} cat--${mood} cat--${pose} ${className}`}
      viewBox={viewBox}
      width={size}
      height={size}
      style={{ ...timing, ...(flip ? { transform: 'scaleX(-1)' } : null) }}
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      focusable="false"
    >
      <defs>
        <radialGradient id={gradId} cx="38%" cy="30%" r="80%">
          <stop offset="0%" stopColor={p.furLight} />
          <stop offset="55%" stopColor={p.fur} />
          <stop offset="100%" stopColor={p.furDark} />
        </radialGradient>
        <radialGradient id={bodyGradId} cx="40%" cy="25%" r="85%">
          <stop offset="0%" stopColor={p.furLight} />
          <stop offset="60%" stopColor={p.fur} />
          <stop offset="100%" stopColor={p.furDark} />
        </radialGradient>
      </defs>
      {pose === 'full' && (
        <g className="cat-figure">
          <ellipse cx={60} cy={126} rx={34} ry={4} fill="#000" opacity={0.35} />
          {/* tail */}
          <g className={still ? undefined : 'cat-tail'}>
            <path d="M82 116 C104 118 113 98 105 81 C102 74 96 75 99 82" fill="none" stroke={p.outline} strokeWidth={11} strokeLinecap="round" opacity={darkBody ? 0.9 : 0.55} />
            <path d="M82 116 C104 118 113 98 105 81 C102 74 96 75 99 82" fill="none" stroke={p.fur} strokeWidth={8.5} strokeLinecap="round" />
            {p.stripe && (
              <path d="M82 116 C104 118 113 98 105 81 C102 74 96 75 99 82" fill="none" stroke={p.stripe} strokeWidth={8.5} strokeDasharray="3.5 7" />
            )}
            {marks?.tail === 'tip' && <circle cx={99} cy={81} r={4.4} fill={marks.color} />}
            {marks?.tail === 'dot' && <circle cx={107} cy={96} r={2.6} fill={marks.color} />}
            {p.rim && (
              <path d="M84 113 C102 114 109 98 103 84" fill="none" stroke={p.rim} strokeOpacity={0.45} strokeWidth={1.4} strokeLinecap="round" />
            )}
          </g>
          {/* body */}
          <g className={still ? undefined : 'cat-breathe'}>
            <path d="M33 118 C30 96 40 78 60 78 C80 78 90 96 87 118 Z" fill={`url(#${bodyGradId})`} stroke={p.outline} strokeWidth={1.5} strokeLinejoin="round" {...rimStroke} />
            <ellipse cx={60} cy={104} rx={14} ry={13} fill={p.belly} opacity={darkBody ? 0.9 : 1} />
            {marks?.svgChest && <path d={marks.svgChest} fill={p.belly} />}
            {marks?.svgBody.map(([cx, cy, r], i) => <circle key={i} cx={cx} cy={cy} r={r} fill={marks.color} />)}
            {p.stripe && (
              <g stroke={p.stripe} strokeWidth={3} strokeLinecap="round" fill="none">
                <path d="M36 98 Q42 99 44 105" />
                <path d="M84 98 Q78 99 76 105" />
              </g>
            )}
          </g>
          {/* paws */}
          <ellipse cx={48} cy={119} rx={8.5} ry={5.2} fill={p.fur} stroke={p.outline} strokeWidth={1.3} {...rimStroke} />
          <path d="M45 117 V120 M48.5 117 V120.5" stroke={p.outline} strokeWidth={1} strokeLinecap="round" opacity={0.6} />
          {mood === 'playful' || mood === 'victorious' ? (
            <g className={still ? undefined : 'cat-paw-wave'}>
              <path d="M80 100 Q90 90 92 78" fill="none" stroke={p.outline} strokeWidth={10} strokeLinecap="round" opacity={darkBody ? 0.9 : 0.5} />
              <path d="M80 100 Q90 90 92 78" fill="none" stroke={p.fur} strokeWidth={7.5} strokeLinecap="round" />
              <circle cx={92} cy={76} r={6.5} fill={p.fur} stroke={p.outline} strokeWidth={1.3} {...rimStroke} />
              <circle cx={92} cy={77.5} r={2.3} fill={p.innerEar} />
              <circle cx={88.6} cy={73.6} r={1.2} fill={p.innerEar} />
              <circle cx={92} cy={72.2} r={1.2} fill={p.innerEar} />
              <circle cx={95.4} cy={73.6} r={1.2} fill={p.innerEar} />
            </g>
          ) : (
            <>
              <ellipse cx={72} cy={119} rx={8.5} ry={5.2} fill={p.fur} stroke={p.outline} strokeWidth={1.3} {...rimStroke} />
              <path d="M71.5 117 V120.5 M75 117 V120" stroke={p.outline} strokeWidth={1} strokeLinecap="round" opacity={0.6} />
            </>
          )}
        </g>
      )}
      {head}
      {accessory === 'bell' && accessoryEl}
    </svg>
  );
}
export const CatCharacter = memo(CatCharacterImpl);
