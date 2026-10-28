import { useState, type ReactNode } from 'react';
import { Button } from '../../components/Button';
import { Modal } from '../../components/Modal';
import { SoundToggle } from '../../components/SoundToggle';
import type { GameId } from '../destinations.ts';
import { BackToPawville } from './BackToPawville';
import { GameMark } from './GameMark';

export type Venue = 'arena' | 'harbor' | 'memory' | 'booth' | 'garden' | 'ring' | 'home';

interface GameShellProps {
  game?: GameId;
  venue: Venue;
  title: string;
  subtitle: string;
  place: string;
  help?: ReactNode;
  stats?: ReactNode;
  tools?: ReactNode;
  children: ReactNode;
  onBeforeLeave?: () => void;
}

/** Shared frame for every Pawville activity: header (Back to Pawville, mark, title, help, sound) and a venue backdrop. */
export function GameShell({ game, venue, title, subtitle, place, help, stats, tools, children, onBeforeLeave }: GameShellProps) {
  const [helpOpen, setHelpOpen] = useState(false);
  return (
    <main className={`pv-game pv-venue pv-venue--${venue}`}>
      <div className="pv-venue__backdrop" aria-hidden="true" />
      <header className="pv-game__header">
        <BackToPawville onBeforeLeave={onBeforeLeave} />
        <div className="pv-game__titleblock">
          {game && <GameMark game={game} size={34} />}
          <div>
            <p className="pv-game__place">{place}</p>
            <h1 className="pv-game__title">{title}</h1>
          </div>
        </div>
        <div className="pv-game__tools">
          {tools}
          {help && (
            <button type="button" className="icon-btn" onClick={() => setHelpOpen(true)} aria-label={`How to play ${title}`}>
              <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="2" /><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1 .8-1 1.5v.4M12 17h.01" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
            </button>
          )}
          <SoundToggle />
        </div>
      </header>
      <p className="pv-game__subtitle">{subtitle}</p>
      {stats && <div className="pv-game__stats">{stats}</div>}
      <div className="pv-game__body">{children}</div>
      {help && (
        <Modal open={helpOpen} title={`How to play ${title}`} onClose={() => setHelpOpen(false)} className="pv-modal">
          <div className="pv-help">{help}</div>
          <div className="modal__actions"><Button variant="primary" onClick={() => setHelpOpen(false)}>Got it</Button></div>
        </Modal>
      )}
    </main>
  );
}

export function Stat({ label, value, tone }: { label: string; value: ReactNode; tone?: 'good' | 'bad' | 'gold' }) {
  return (
    <div className={`pv-stat ${tone ? `pv-stat--${tone}` : ''}`}>
      <span className="pv-stat__label">{label}</span>
      <span className="pv-stat__value">{value}</span>
    </div>
  );
}

export interface Choice<T extends string> {
  id: T;
  label: string;
}

/** Uses the existing Paw vs Paw `.segmented` control styles. */
export function Segmented<T extends string>({ label, value, options, onChange, disabled }: { label: string; value: T; options: readonly Choice<T>[]; onChange: (v: T) => void; disabled?: boolean }) {
  return (
    <div className="segmented pv-segmented" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={o.id} type="button" role="radio" aria-checked={value === o.id} disabled={disabled}
          className={`segmented__opt ${value === o.id ? 'is-selected' : ''}`} onClick={() => onChange(o.id)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}
