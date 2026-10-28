import type { CatMood, ReactionKind, Seat } from '../game/types';
import { CatCharacter } from './CatCharacter';
import { PawPrint } from './PawPrint';

const MOOD: Record<ReactionKind, CatMood> = {
  mischief: 'playful', love: 'happy', laugh: 'victorious', shock: 'surprised', wave: 'playful', sad: 'sad',
};

/** Illustrated, cat-themed reaction icon built from the same character art. */
export function ReactionIcon({ kind, seat, size = 34 }: { kind: ReactionKind; seat: Seat; size?: number }) {
  if (kind === 'wave') {
    return (
      <span className={`reaction-icon reaction-icon--wave reaction-icon--${seat}`} style={{ width: size, height: size }}>
        <PawPrint size={Math.round(size * 0.72)} />
      </span>
    );
  }
  return (
    <span className={`reaction-icon reaction-icon--${kind}`} style={{ width: size, height: size }}>
      <CatCharacter cat={seat} pose="head" mood={MOOD[kind]} size={size} still />
      {kind === 'love' && <span className="reaction-icon__badge reaction-icon__badge--heart">♥</span>}
      {kind === 'laugh' && <span className="reaction-icon__badge">ha</span>}
      {kind === 'shock' && <span className="reaction-icon__badge reaction-icon__badge--bang">!</span>}
    </span>
  );
}

export const REACTION_MOOD = MOOD;
