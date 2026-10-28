import type { Accessory, CatMood } from '../../game/types';
import { COAT_INFO } from '../appearance.ts';

/**
 * Vector portrait of Racon the raccoon (Milestone 6) — used wherever the Paw vs Paw vector cat
 * would be shown (wardrobe preview, HUD chip, accessory picker). Same viewBoxes and size API as
 * CatCharacter, so layouts don't change. Original art; no external assets.
 */
export function RaccoonPortrait({ mood = 'idle', pose = 'full', size = 120, flip = false, className = '', title, accessory = 'none' }: {
  mood?: CatMood; pose?: 'full' | 'head'; size?: number | string; flip?: boolean; className?: string; title?: string; accessory?: Accessory;
}) {
  const p = COAT_INFO.racon.svg;
  // The shared palette type allows null for optional colours (e.g. stripe, rim); SVG wants string | undefined.
  const stripe = p.stripe ?? '#3A3542';
  const happy = mood === 'happy' || mood === 'victorious';
  const viewBox = pose === 'head' ? '13 -6 94 98' : '0 -8 120 138';
  const eye = (cx: number) => happy
    ? <path d={`M${cx - 5} 54 Q${cx} 47 ${cx + 5} 54`} fill="none" stroke={p.muzzle} strokeWidth={3} strokeLinecap="round" />
    : (<g><circle cx={cx} cy={52} r={5.4} fill={p.eye} /><circle cx={cx} cy={52.5} r={3} fill={p.pupil} /><circle cx={cx - 1.8} cy={50} r={1.6} fill="#fff" /></g>);
  return (
    <svg className={`cat cat--racoon cat--${mood} cat--${pose} ${className}`} viewBox={viewBox} width={size} height={size}
      style={flip ? { transform: 'scaleX(-1)' } : undefined} role={title ? 'img' : undefined} aria-label={title} aria-hidden={title ? undefined : true}>
      {pose === 'full' && (
        <g>
          {/* ringed tail */}
          <g transform="rotate(-28 92 104)">
            {[0, 1, 2, 3, 4, 5].map((i) => <ellipse key={i} cx={92} cy={118 - i * 9} rx={10 - i * 0.6} ry={6} fill={i % 2 ? p.furLight : stripe} stroke={p.outline} strokeWidth={1.2} />)}
          </g>
          <ellipse cx={60} cy={104} rx={30} ry={24} fill={p.fur} stroke={p.outline} strokeWidth={2} />
          <ellipse cx={60} cy={108} rx={17} ry={16} fill={p.belly} />
          <ellipse cx={44} cy={124} rx={9} ry={5} fill={stripe} />
          <ellipse cx={76} cy={124} rx={9} ry={5} fill={stripe} />
        </g>
      )}
      {/* ears */}
      <ellipse cx={34} cy={30} rx={11} ry={12} fill={p.fur} stroke={p.outline} strokeWidth={2} />
      <ellipse cx={86} cy={30} rx={11} ry={12} fill={p.fur} stroke={p.outline} strokeWidth={2} />
      <ellipse cx={34} cy={31} rx={6} ry={7} fill={p.innerEar} />
      <ellipse cx={86} cy={31} rx={6} ry={7} fill={p.innerEar} />
      {/* head */}
      <path d="M60 22 C88 22 102 40 102 58 C102 76 84 88 60 88 C36 88 18 76 18 58 C18 40 32 22 60 22 Z" fill={p.fur} stroke={p.outline} strokeWidth={2} />
      {/* white brows + cheeks */}
      <path d="M30 44 C38 36 50 38 54 44 C46 46 38 48 30 44 Z M90 44 C82 36 70 38 66 44 C74 46 82 48 90 44 Z" fill={p.muzzle} />
      <path d="M24 64 C30 80 46 86 60 86 C74 86 90 80 96 64 C84 70 72 66 60 66 C48 66 36 70 24 64 Z" fill={p.muzzle} />
      {/* the mask */}
      <path d="M22 54 C26 44 42 44 52 50 C56 52 64 52 68 50 C78 44 94 44 98 54 C96 62 84 64 74 60 C68 58 64 60 60 60 C56 60 52 58 46 60 C36 64 24 62 22 54 Z" fill={stripe} />
      <path d="M58 26 L62 26 L61 46 L59 46 Z" fill={p.furDark} />
      {eye(43)}{eye(77)}
      <ellipse cx={60} cy={68} rx={5} ry={3.6} fill={p.nose} />
      <path d={happy ? 'M52 74 Q60 82 68 74' : 'M54 75 Q60 79 66 75'} fill="none" stroke={p.outline} strokeWidth={2} strokeLinecap="round" />
      {accessory === 'crown' && <path d="M46 24 L50 12 L56 20 L60 8 L64 20 L70 12 L74 24 Z" fill="#FFCB4A" stroke="#B5831E" strokeWidth={1.2} />}
      {accessory === 'bow' && <path d="M78 22 L90 16 L90 30 Z M78 22 L66 16 L66 30 Z" fill="#FF6FA1" />}
      {accessory === 'wizard' && <path d="M40 26 L60 -4 L80 26 Z" fill="#6B4FBF" stroke="#3E2B7A" strokeWidth={1.2} />}
      {accessory === 'bell' && <circle cx={60} cy={92} r={5} fill="#FFCB4A" stroke="#B5831E" strokeWidth={1.2} />}
    </svg>
  );
}
