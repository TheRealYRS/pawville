import { memo, useMemo, type CSSProperties } from 'react';
import { PawPrint } from './PawPrint';

const COLORS = ['#FF8A35', '#FFC94A', '#A89BC9', '#FFF3E6', '#FF6FA1'];

function ConfettiImpl({ count = 26 }: { count?: number }) {
  const pieces = useMemo(
    () => Array.from({ length: count }, (_, i) => ({
      key: i,
      paw: i % 4 === 0,
      style: {
        '--x': `${Math.round(Math.random() * 100)}%`,
        '--dx': `${Math.round(Math.random() * 120 - 60)}px`,
        '--rot': `${Math.round(Math.random() * 720 - 360)}deg`,
        '--d': `${(Math.random() * 1.2 + 1.6).toFixed(2)}s`,
        '--delay': `${(Math.random() * 0.4).toFixed(2)}s`,
        color: COLORS[i % COLORS.length],
      } as CSSProperties,
    })),
    [count],
  );
  return (
    <div className="confetti" aria-hidden="true">
      {pieces.map((p) => (
        <span key={p.key} className={`confetti__piece ${p.paw ? 'confetti__piece--paw' : ''}`} style={p.style}>
          {p.paw ? <PawPrint size={16} /> : null}
        </span>
      ))}
    </div>
  );
}

export const Confetti = memo(ConfettiImpl);
