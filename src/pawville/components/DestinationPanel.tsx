import { Button } from '../../components/Button';
import { CatCharacter } from '../../components/CatCharacter';
import { Modal } from '../../components/Modal';
import { loadPreferences } from '../../lib/preferences';
import { isSupabaseConfigured } from '../../lib/supabaseClient';
import { GAMES, PATHS, challengeForDate, destinationInfo, gamesAt, weeklyEvent, type GameEntry } from '../destinations.ts';
import type { TownIdentity } from '../identity';
import type { PresenceStatus } from '../net/townPresence.ts';
import { PHASE_LABEL, WEATHER_LABEL, clockLabel, type Environment } from '../world/environment.ts';
import type { DestinationId } from '../world/townMap.ts';
import { GameMark } from './GameMark';

interface DestinationPanelProps {
  id: DestinationId | null;
  identity: TownIdentity;
  presence: { status: PresenceStatus; others: number };
  env: Environment;
  onClose: () => void;
  onOpen: (route: string) => void;
}

export function presenceSummary(status: PresenceStatus, others: number): string {
  switch (status) {
    case 'disabled': return 'Solo town — online presence is not configured on this deployment.';
    case 'connecting': return 'Connecting to the plaza…';
    case 'reconnecting': return 'Reconnecting to the plaza…';
    case 'error': return 'Plaza offline — you are exploring solo.';
    case 'online': return others === 0 ? 'You are the only cat in town right now.' : `${others} other ${others === 1 ? 'cat is' : 'cats are'} in town right now.`;
  }
}

function GameCard({ game, onOpen }: { game: GameEntry; onOpen: (route: string) => void }) {
  return (
    <article className={`pv-game-card pv-game-card--${game.id}`}>
      <header className="pv-game-card__head">
        <GameMark game={game.id} />
        <h3>{game.title}</h3>
        <span className="pv-chip pv-chip--live">Playable</span>
      </header>
      <p className="pv-game-card__tagline">{game.tagline}</p>
      <p>{game.description}</p>
      <p className="pv-note">{game.modes.join(' · ')} — <em>Together:</em> {game.together}</p>
      <div className="pv-game-card__actions"><Button variant="primary" onClick={() => onOpen(game.route)}>Play {game.title}</Button></div>
    </article>
  );
}

function ArcadeContent({ identity, onOpen }: { identity: TownIdentity; onOpen: (route: string) => void }) {
  const prefs = loadPreferences();
  return (
    <div className="pv-panel">
      <div className="pv-panel__art" aria-hidden="true">
        <CatCharacter cat="T" mood="playful" accessory={identity.cat === 'T' ? identity.accessory : 'none'} size={92} />
        <span className="pv-panel__vs">VS</span>
        <CatCharacter cat="M" mood="happy" accessory={identity.cat === 'M' ? identity.accessory : 'none'} size={92} flip />
      </div>
      <article className="pv-game-card pv-game-card--featured">
        <header className="pv-game-card__head"><h3>Paw vs Paw</h3><span className="pv-chip pv-chip--live">Playable</span></header>
        <p className="pv-game-card__tagline">{GAMES[0].tagline}</p>
        <p>{GAMES[0].description}</p>
        <div className="pv-game-card__actions"><Button variant="primary" size="lg" onClick={() => onOpen(PATHS.arcade)}>Open Paw vs Paw</Button></div>
        <div className="pv-game-card__quick">
          <Button variant="ghost" size="sm" onClick={() => onOpen('/play/computer')}>vs Computer</Button>
          <Button variant="ghost" size="sm" onClick={() => onOpen('/play/local')}>Pass &amp; Play</Button>
          {prefs.lastRoomId && isSupabaseConfigured && <Button variant="midnight" size="sm" onClick={() => onOpen(`/room/${prefs.lastRoomId}`)}>Rejoin your match</Button>}
        </div>
      </article>
      {gamesAt('arcade').filter((g) => g.id !== 'paw-vs-paw').map((g) => <GameCard key={g.id} game={g} onOpen={onOpen} />)}
    </div>
  );
}

function EventBoardContent({ presence, env, onOpen }: { presence: DestinationPanelProps['presence']; env: Environment; onOpen: (route: string) => void }) {
  const challenge = challengeForDate(new Date());
  const week = weeklyEvent(new Date());
  return (
    <div className="pv-panel pv-board">
      <section className="pv-board__card pv-board__card--today">
        <h3>Today&apos;s challenge</h3>
        <p className="pv-board__title">{challenge.title}</p>
        <p>{challenge.detail}</p>
        <div className="pv-game-card__actions"><Button variant="primary" onClick={() => onOpen(challenge.route)}>Go</Button></div>
        <p className="pv-note">Just for fun — there are no streaks and nothing is lost if you skip a day.</p>
      </section>
      <section className="pv-board__card">
        <h3>This week: {week.title}</h3>
        <p>{week.detail}</p>
      </section>
      <section className="pv-board__card">
        <h3>Weather report</h3>
        <p>{WEATHER_LABEL[env.weather]} · {PHASE_LABEL[env.phase]} · {clockLabel(env.hour)}{env.localOnly ? ' (your local override)' : ''}</p>
        <p className="pv-note">Everyone in Pawville shares the same live weather.</p>
      </section>
      <section className="pv-board__card">
        <h3>Around town</h3>
        <p><span className={`pv-dot pv-dot--${presence.status}`} aria-hidden="true" /> {presenceSummary(presence.status, presence.others)}</p>
      </section>
      <section className="pv-board__card">
        <h3>Games</h3>
        <ul className="pv-roadmap">
          {GAMES.map((g) => (
            <li key={g.id}>
              <button type="button" className="pv-roadmap__link" onClick={() => onOpen(g.route)}>{g.title}</button>
              <span className="pv-roadmap__where">{destinationInfo(g.destination).name}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

export function DestinationPanel({ id, identity, presence, env, onClose, onOpen }: DestinationPanelProps) {
  if (!id) return null;
  const info = destinationInfo(id);
  return (
    <Modal open title={info.name} onClose={onClose} className={`pv-modal pv-modal--${info.accent}`}>
      <p className="pv-panel__blurb">{info.blurb}</p>
      {id === 'arcade' && <ArcadeContent identity={identity} onOpen={onOpen} />}
      {id === 'event-board' && <EventBoardContent presence={presence} env={env} onOpen={onOpen} />}
      {id === 'home' && (
        <div className="pv-panel">
          <div className="pv-game-card__actions">
            <Button variant="primary" size="lg" onClick={() => onOpen(PATHS.home)}>Go inside</Button>
            <Button variant="secondary" onClick={() => onOpen(PATHS.scrapbook)}>Open the scrapbook</Button>
          </div>
        </div>
      )}
      {id !== 'arcade' && id !== 'event-board' && id !== 'home' && <div className="pv-panel">{gamesAt(id).map((g) => <GameCard key={g.id} game={g} onOpen={onOpen} />)}</div>}
      <div className="modal__actions"><Button variant="ghost" onClick={onClose}>Back outside</Button></div>
    </Modal>
  );
}
