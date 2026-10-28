import { CAT_NAMES, cellLabel, otherSeat } from '../game/gameRules';
import type { MatchState, Seat } from '../game/types';
import { CatCharacter } from './CatCharacter';

/** Compact, synchronized move list (seat derived from the round's starting cat). */
export function MoveHistory({ match }: { match: MatchState }) {
  if (match.history.length === 0) return null;
  const seatAt = (i: number): Seat => (i % 2 === 0 ? match.startingSeat : otherSeat(match.startingSeat));
  return (
    <details className="move-history">
      <summary>Moves this round ({match.history.length})</summary>
      <ol>
        {match.history.map((cell, i) => (
          <li key={`${match.round}-${i}`}>
            <CatCharacter cat={seatAt(i)} pose="head" size={20} still />
            <span>{CAT_NAMES[seatAt(i)]} → {cellLabel(cell)}</span>
          </li>
        ))}
      </ol>
    </details>
  );
}
