import { useState } from 'react';
import { REACTION_EMOJI, REACTION_LABELS } from '../game/messages';
import { REACTIONS, type ReactionKind, type Seat } from '../game/types';
import { sfx } from '../lib/soundService';
import { ReactionIcon } from './ReactionIcon';

interface ReactionBarProps {
  seat: Seat;
  onReact: (kind: ReactionKind) => void;
  disabled?: boolean;
}

export function ReactionBar({ seat, onReact, disabled = false }: ReactionBarProps) {
  const [cooling, setCooling] = useState(false);
  return (
    <div className="reaction-bar" role="group" aria-label="Send a reaction to your opponent">
      {REACTIONS.map((k) => (
        <button
          key={k}
          type="button"
          className="reaction-btn"
          disabled={disabled || cooling}
          aria-label={`React: ${REACTION_LABELS[k]} ${REACTION_EMOJI[k]}`}
          title={REACTION_LABELS[k]}
          onClick={() => {
            sfx.reaction();
            onReact(k);
            setCooling(true);
            window.setTimeout(() => setCooling(false), 1300);
          }}
        >
          <ReactionIcon kind={k} seat={seat} size={30} />
        </button>
      ))}
    </div>
  );
}
