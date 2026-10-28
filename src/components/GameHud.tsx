import type { ReactNode } from 'react';
import type { Score } from '../game/types';

/** Two player cards with a versus badge between them. */
export function GameHud({ left, right, score, round }: { left: ReactNode; right: ReactNode; score: Score; round: number }) {
  return (
    <div className="hud">
      {left}
      <div className="versus" aria-label={`Round ${round}. ${score.draws} draws so far.`}>
        <span className="versus__badge" aria-hidden="true">VS</span>
        <span className="versus__round" aria-hidden="true">Round {round}</span>
        {score.draws > 0 && <span className="versus__draws" aria-hidden="true">{score.draws} draw{score.draws === 1 ? '' : 's'}</span>}
      </div>
      {right}
    </div>
  );
}
