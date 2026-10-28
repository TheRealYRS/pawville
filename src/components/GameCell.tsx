import { forwardRef, type KeyboardEvent } from 'react';
import { CAT_NAMES, cellLabel } from '../game/gameRules';
import type { Accessory, CatMood, CellValue } from '../game/types';
import { CatCharacter } from './CatCharacter';
import { PawPrint } from './PawPrint';

interface GameCellProps {
  index: number;
  value: CellValue;
  pendingSeat: 'T' | 'M' | null;
  accessory: Accessory;
  mood: CatMood;
  winning: boolean;
  dimmed: boolean;
  lastMove: boolean;
  animate: boolean;
  canPlay: boolean;
  focusable: boolean;
  hoverSeat: 'T' | 'M' | null;
  onSelect: (index: number) => void;
  onKeyNav: (index: number, e: KeyboardEvent<HTMLButtonElement>) => void;
  onFocusCell: (index: number) => void;
}

export const GameCell = forwardRef<HTMLButtonElement, GameCellProps>(function GameCell(
  { index, value, pendingSeat, accessory, mood, winning, dimmed, lastMove, animate, canPlay, focusable, hoverSeat, onSelect, onKeyNav, onFocusCell },
  ref,
) {
  const shown = value ?? pendingSeat;
  const label = `${cellLabel(index)}: ${value ? CAT_NAMES[value] : pendingSeat ? `placing ${CAT_NAMES[pendingSeat]}` : 'empty'}${winning ? ', part of the winning line' : ''}`;
  const classes = [
    'cell',
    shown ? `cell--filled cell--${shown}` : 'cell--empty',
    winning && 'cell--winning',
    dimmed && 'cell--dimmed',
    lastMove && 'cell--last',
    canPlay && !shown && 'cell--playable',
    pendingSeat && !value && 'cell--pending',
  ].filter(Boolean).join(' ');

  return (
    <button
      ref={ref}
      type="button"
      role="gridcell"
      className={classes}
      aria-label={label}
      aria-disabled={!canPlay || !!shown}
      tabIndex={focusable ? 0 : -1}
      onClick={() => onSelect(index)}
      onKeyDown={(e) => onKeyNav(index, e)}
      onFocus={() => onFocusCell(index)}
    >
      {shown ? (
        <span className={`token ${animate ? 'token--enter' : ''}`}>
          <CatCharacter cat={shown} pose="head" mood={mood} accessory={accessory} size="100%" still={!winning} />
          {animate && (
            <span className="paw-burst" aria-hidden="true">
              {[0, 1, 2, 3].map((i) => <PawPrint key={i} size={14} className={`paw-burst__p paw-burst__p--${i}`} />)}
            </span>
          )}
        </span>
      ) : hoverSeat ? (
        <span className={`cell__ghost cell__ghost--${hoverSeat}`} aria-hidden="true">
          <PawPrint size={26} />
        </span>
      ) : null}
    </button>
  );
});
