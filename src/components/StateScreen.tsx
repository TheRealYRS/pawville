import { useEffect, useState, type ReactNode } from 'react';
import type { CatMood, Seat } from '../game/types';
import { CatCharacter } from './CatCharacter';
import { Starfield } from './Starfield';

interface StateScreenProps {
  cat?: Seat;
  mood?: CatMood;
  title: string;
  message?: ReactNode;
  loading?: boolean;
  /** Shown after `slowAfterMs` while loading, so a hung request never becomes a permanent spinner. */
  slowActions?: ReactNode;
  slowAfterMs?: number;
  actions?: ReactNode;
}

export function StateScreen({ cat = 'T', mood = 'idle', title, message, loading = false, slowActions, slowAfterMs = 10000, actions }: StateScreenProps) {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (!loading) return;
    const t = window.setTimeout(() => setSlow(true), slowAfterMs);
    return () => window.clearTimeout(t);
  }, [loading, slowAfterMs]);

  return (
    <main className="state-screen">
      <Starfield density={24} paws={3} />
      <div className="state-screen__card" role={loading ? 'status' : 'alert'} aria-live="polite">
        <div className={`state-screen__cat ${loading ? 'is-loading' : ''}`} aria-hidden="true">
          <CatCharacter cat={cat} mood={mood} size="100%" />
        </div>
        <h1 className="state-screen__title">{title}</h1>
        {message && <p className="state-screen__msg">{message}</p>}
        {loading && <div className="loader-dots" aria-hidden="true"><i /><i /><i /></div>}
        {loading && slow && (
          <>
            <p className="state-screen__msg">This is taking longer than usual. The server may be waking up or unreachable.</p>
            <div className="state-screen__actions">{slowActions}</div>
          </>
        )}
        {actions && <div className="state-screen__actions">{actions}</div>}
      </div>
    </main>
  );
}
