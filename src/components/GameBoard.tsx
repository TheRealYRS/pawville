import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { retrigger } from '../game/animations';
import type { Accessory, CatMood, MatchState, Seat } from '../game/types';
import { GameCell } from './GameCell';

interface GameBoardProps {
  match: MatchState;
  /** Which seat the local player is placing (null when nobody can move). */
  activeSeat: Seat | null;
  canPlay: boolean;
  pendingCell: number | null;
  accessories: Record<Seat, Accessory>;
  onSelect: (cell: number) => void;
  /** Change `nonce` to shake `cell` (invalid move feedback). */
  shake: { cell: number; nonce: number } | null;
}

export function GameBoard({ match, activeSeat, canPlay, pendingCell, accessories, onSelect, shake }: GameBoardProps) {
  const cellRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const boardRef = useRef<HTMLDivElement>(null);
  const [focusIndex, setFocusIndex] = useState(4);

  // Cells already filled when the board first rendered (e.g. after a refresh) don't replay the entrance.
  const initial = useRef<Set<string> | null>(null);
  if (initial.current === null) {
    initial.current = new Set(match.board.flatMap((v, i) => (v ? [`${match.round}:${i}`] : [])));
  }

  useEffect(() => {
    if (!shake) return;
    retrigger(cellRefs.current[shake.cell] ?? boardRef.current, 'shake');
  }, [shake]);

  const onKeyNav = (index: number, e: KeyboardEvent<HTMLButtonElement>) => {
    const row = Math.floor(index / 3);
    const col = index % 3;
    let next = index;
    if (e.key === 'ArrowRight') next = row * 3 + ((col + 1) % 3);
    else if (e.key === 'ArrowLeft') next = row * 3 + ((col + 2) % 3);
    else if (e.key === 'ArrowDown') next = ((row + 1) % 3) * 3 + col;
    else if (e.key === 'ArrowUp') next = ((row + 2) % 3) * 3 + col;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = 8;
    else return;
    e.preventDefault();
    setFocusIndex(next);
    cellRefs.current[next]?.focus();
  };

  const finished = match.status === 'finished';
  const winSet = new Set(match.winningLine ?? []);
  const moodFor = (seat: Seat, i: number): CatMood => {
    if (!finished) return 'idle';
    if (match.winner === 'D') return 'surprised';
    if (winSet.has(i)) return 'victorious';
    return seat === match.winner ? 'happy' : 'sad';
  };

  return (
    <div
      ref={boardRef}
      className={`board ${finished ? 'board--finished' : ''} ${canPlay ? 'board--my-turn' : ''} ${activeSeat ? `board--turn-${activeSeat}` : ''}`}
      role="grid"
      aria-label="Game board, 3 by 3"
    >
      {[0, 1, 2].map((r) => (
        <div role="row" className="board__row" key={r}>
          {[0, 1, 2].map((c) => {
            const i = r * 3 + c;
            const value = match.board[i];
            const pendingSeat = pendingCell === i && !value ? activeSeat : null;
            const shownSeat = value ?? pendingSeat;
            return (
              <GameCell
                key={`${match.round}-${i}`}
                ref={(el) => { cellRefs.current[i] = el; }}
                index={i}
                value={value}
                pendingSeat={pendingSeat}
                accessory={shownSeat ? accessories[shownSeat] : 'none'}
                mood={shownSeat ? moodFor(shownSeat, i) : 'idle'}
                winning={winSet.has(i)}
                dimmed={finished && match.winner !== 'D' && !winSet.has(i)}
                lastMove={match.lastMoveCell === i && !finished}
                animate={pendingSeat !== null || (!!value && !initial.current!.has(`${match.round}:${i}`))}
                canPlay={canPlay}
                focusable={focusIndex === i}
                hoverSeat={canPlay && !value && pendingCell === null ? activeSeat : null}
                onSelect={onSelect}
                onKeyNav={onKeyNav}
                onFocusCell={setFocusIndex}
              />
            );
          })}
        </div>
      ))}
    </div>
  );
}
