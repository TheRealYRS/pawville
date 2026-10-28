import { useEffect, useRef, type ReactNode } from 'react';
import { otherSeat } from '../game/gameRules';
import { resultCopy } from '../game/messages';
import type { Accessory, Seat, Winner } from '../game/types';
import { CatCharacter } from './CatCharacter';
import { Confetti } from './Confetti';

interface VictoryOverlayProps {
  open: boolean;
  winner: Winner;
  round: number;
  mySeat: Seat | null;
  accessories: Record<Seat, Accessory>;
  minimized: boolean;
  onToggleMinimize: () => void;
  note?: ReactNode;
  children: ReactNode;
}

export function VictoryOverlay({ open, winner, round, mySeat, accessories, minimized, onToggleMinimize, note, children }: VictoryOverlayProps) {
  const actionsRef = useRef<HTMLDivElement>(null);
  const copy = resultCopy(winner, round, mySeat);

  useEffect(() => {
    if (open && !minimized) actionsRef.current?.querySelector<HTMLButtonElement>('button:not([disabled])')?.focus();
  }, [open, minimized, round]);

  if (!open || !winner) return null;

  if (minimized) {
    return (
      <div className="result-bar" role="region" aria-label="Game result">
        <span className="result-bar__title">{copy.title}</span>
        <button type="button" className="btn btn--primary btn--sm" onClick={onToggleMinimize}>
          <span className="btn__label">Show result</span>
        </button>
      </div>
    );
  }

  const draw = winner === 'D';
  const loser = draw ? null : otherSeat(winner);
  const iWon = mySeat !== null && winner === mySeat;

  return (
    <div className="result-backdrop">
      {!draw && <Confetti />}
      <div className={`result-card ${draw ? 'result-card--draw' : `result-card--${winner}`}`} role="dialog" aria-modal="false" aria-labelledby="result-title" aria-describedby="result-sub">
        <div className="result-card__cats" aria-hidden="true">
          {draw ? (
            <>
              <span className="confused"><CatCharacter cat="T" mood="thinking" accessory={accessories.T} size={104} /><i>?</i></span>
              <span className="confused confused--b"><CatCharacter cat="M" mood="surprised" accessory={accessories.M} size={104} flip /><i>?</i></span>
            </>
          ) : (
            <>
              <span className="result-card__winner"><CatCharacter cat={winner} mood="victorious" accessory={accessories[winner]} size={128} /></span>
              <span className="result-card__loser"><CatCharacter cat={loser!} mood="sad" accessory={accessories[loser!]} size={78} /></span>
            </>
          )}
        </div>
        {copy.badge && <span className={`chip chip--result ${iWon ? 'chip--win' : ''}`}>{copy.badge}</span>}
        <h2 id="result-title" className="result-card__title">{copy.title}</h2>
        <p id="result-sub" className="result-card__sub">{copy.subtitle}</p>
        {note && <div className="result-card__note" role="status" aria-live="polite">{note}</div>}
        <div className="result-card__actions" ref={actionsRef}>{children}</div>
        <button type="button" className="link-btn" onClick={onToggleMinimize}>View the board</button>
      </div>
    </div>
  );
}
