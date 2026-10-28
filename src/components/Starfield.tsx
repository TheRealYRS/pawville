import { memo, useMemo, type CSSProperties } from 'react';
import { PawPrint } from './PawPrint';

/** A restrained ambient background: a few twinkling stars and slowly drifting paw prints. */
function StarfieldImpl({ density = 42, paws = 6 }: { density?: number; paws?: number }) {
  const stars = useMemo(
    () => Array.from({ length: density }, (_, i) => ({
      key: i,
      style: {
        left: `${Math.random() * 100}%`,
        top: `${Math.random() * 100}%`,
        '--s': `${(Math.random() * 1.8 + 0.8).toFixed(1)}px`,
        '--d': `${(Math.random() * 4 + 3).toFixed(1)}s`,
        '--delay': `${(Math.random() * -6).toFixed(1)}s`,
      } as CSSProperties,
    })),
    [density],
  );
  const pawList = useMemo(
    () => Array.from({ length: paws }, (_, i) => ({
      key: i,
      style: {
        left: `${(i / paws) * 100 + Math.random() * 10}%`,
        '--d': `${(Math.random() * 14 + 22).toFixed(1)}s`,
        '--delay': `${(Math.random() * -30).toFixed(1)}s`,
        '--r': `${Math.round(Math.random() * 60 - 30)}deg`,
      } as CSSProperties,
      size: Math.round(14 + Math.random() * 12),
    })),
    [paws],
  );
  return (
    <div className="starfield" aria-hidden="true">
      <div className="starfield__glow starfield__glow--orange" />
      <div className="starfield__glow starfield__glow--lavender" />
      {stars.map((s) => <span key={s.key} className="star" style={s.style} />)}
      {pawList.map((p) => (
        <span key={p.key} className="floating-paw" style={p.style}>
          <PawPrint size={p.size} />
        </span>
      ))}
    </div>
  );
}

export const Starfield = memo(StarfieldImpl);
