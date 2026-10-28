import { useEffect, useRef, type ReactNode } from 'react';
import { Button } from '../../components/Button';
import { PATHS } from '../destinations.ts';
import { goTo } from '../navigation';

interface ResultPanelProps {
  open: boolean;
  heading: string;
  sub?: string;
  art?: ReactNode;
  stats: { label: string; value: ReactNode; highlight?: boolean }[];
  newBest?: boolean;
  bestLabel?: string;
  mood?: 'lively' | 'warm' | 'calm';
  primaryLabel: string;
  onPrimary: () => void;
  secondary?: ReactNode;
}

/** Shared result card. Rendered INSIDE the game screen, so it can never outlive the screen that owns it. */
export function ResultPanel({ open, heading, sub, art, stats, newBest, bestLabel, mood = 'warm', primaryLabel, onPrimary, secondary }: ResultPanelProps) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (open) ref.current?.querySelector<HTMLButtonElement>('.btn--primary')?.focus();
  }, [open]);
  if (!open) return null;
  return (
    <div className={`pv-result-scrim pv-result--${mood}`}>
      <div ref={ref} className="pv-result" role="dialog" aria-modal="false" aria-labelledby="pv-result-heading">
        {mood !== 'calm' && <PawShower count={mood === 'lively' ? 14 : 9} />}
        {art && <div className="pv-result__art">{art}</div>}
        <h2 id="pv-result-heading" className="pv-result__heading">{heading}</h2>
        {sub && <p className="pv-result__sub">{sub}</p>}
        {newBest && <p className="pv-result__best">★ New personal best{bestLabel ? ` — ${bestLabel}` : ''}</p>}
        {!newBest && bestLabel && <p className="pv-result__prev">Personal best: {bestLabel}</p>}
        <dl className="pv-result__stats">
          {stats.map((s) => (
            <div key={s.label} className={`pv-result__stat ${s.highlight ? 'is-highlight' : ''}`}>
              <dt>{s.label}</dt>
              <dd>{s.value}</dd>
            </div>
          ))}
        </dl>
        <div className="pv-result__actions">
          <Button variant="primary" size="lg" onClick={onPrimary}>{primaryLabel}</Button>
          <div className="result-card__row">
            {secondary}
            <Button variant="ghost" size="sm" onClick={() => goTo(PATHS.town)}>Back to Pawville</Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function PawShower({ count = 10 }: { count?: number }) {
  return (
    <div className="pv-pawshower" aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <span key={i} className="pv-pawshower__paw" style={{ left: `${(i * 97) % 100}%`, animationDelay: `${(i % 5) * 0.12}s` }}>
          <svg viewBox="0 0 24 24" width="16" height="16"><ellipse cx="12" cy="15" rx="5" ry="4.2" fill="currentColor" /><circle cx="6.5" cy="9" r="2.1" fill="currentColor" /><circle cx="10" cy="5.6" r="2.1" fill="currentColor" /><circle cx="14" cy="5.6" r="2.1" fill="currentColor" /><circle cx="17.5" cy="9" r="2.1" fill="currentColor" /></svg>
        </span>
      ))}
    </div>
  );
}

/** 3-2-1 countdown badge. Purely visual — the game owns the timing. */
export function CountdownBadge({ value }: { value: number | null }) {
  if (value === null) return null;
  return (
    <div className="pv-countdown" role="status" aria-live="assertive">
      <span key={value} className="pv-countdown__num">{value > 0 ? value : 'Go!'}</span>
    </div>
  );
}
