import type { Accessory, CatMood, Seat } from '../game/types';
import { CAT_NAMES } from '../game/gameRules';
import { REACTION_EMOJI, REACTION_LABELS } from '../game/messages';
import type { FloatingReaction } from '../hooks/useOnlineRoom';
import { CatCharacter } from './CatCharacter';
import { ReactionIcon } from './ReactionIcon';

export type Connection = 'online' | 'away' | 'left' | 'reconnecting' | 'unknown' | 'waiting' | 'local' | 'computer';

const CONNECTION_TEXT: Record<Connection, string> = {
  online: 'Online',
  away: 'Away',
  left: 'Left the room',
  reconnecting: 'Reconnecting…',
  unknown: 'In the room',
  waiting: 'Not joined yet',
  local: 'Local',
  computer: 'CPU',
};

interface PlayerCardProps {
  seat: Seat;
  nickname: string | null;
  accessory: Accessory;
  isYou: boolean;
  isActive: boolean;
  mood: CatMood;
  look?: { x: number; y: number };
  connection: Connection;
  wins: number;
  reactions: FloatingReaction[];
}

export function PlayerCard({ seat, nickname, accessory, isYou, isActive, mood, look, connection, wins, reactions }: PlayerCardProps) {
  const name = CAT_NAMES[seat];
  return (
    <section
      className={`player-card player-card--${seat} ${isActive ? 'is-active' : ''} ${isYou ? 'is-you' : ''}`}
      aria-label={`${name}${isYou ? ' (you)' : ''}${isActive ? ', current turn' : ''}`}
    >
      <div className="player-card__art">
        <CatCharacter cat={seat} mood={mood} accessory={accessory} look={look} size="100%" />
        {mood === 'thinking' && isActive && <span className="thought-dots" aria-hidden="true"><i /><i /><i /></span>}
        <div className="reaction-floaters" aria-live="polite">
          {reactions.map((r) => (
            <span key={r.key} className="reaction-float">
              <ReactionIcon kind={r.kind} seat={r.seat} size={36} />
              <span className="sr-only">{name} reacted: {REACTION_LABELS[r.kind]} {REACTION_EMOJI[r.kind]}</span>
            </span>
          ))}
        </div>
      </div>
      <div className="player-card__info">
        <div className="player-card__name-row">
          <span className="player-card__cat">{name}</span>
          {isYou && <span className="chip chip--you">You</span>}
        </div>
        {nickname && nickname !== name && <span className="player-card__nick">{nickname}</span>}
        <span className={`conn conn--${connection}`}>
          <span className="conn__dot" aria-hidden="true" />
          {CONNECTION_TEXT[connection]}
        </span>
      </div>
      <div className="player-card__footer">
        <span className="player-card__wins" aria-label={`${wins} ${wins === 1 ? 'win' : 'wins'}`}>
          <strong>{wins}</strong> {wins === 1 ? 'win' : 'wins'}
        </span>
        {isActive && <span className="chip chip--turn">{isYou ? 'Your turn' : 'Turn'}</span>}
      </div>
    </section>
  );
}
