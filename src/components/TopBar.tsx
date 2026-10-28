import type { ReactNode } from 'react';
import { Logo } from './Logo';
import { SoundToggle } from './SoundToggle';

export function TopBar({ onBack, badge, extra }: { onBack: () => void; badge: ReactNode; extra?: ReactNode }) {
  return (
    <header className="topbar">
      <button type="button" className="icon-btn" onClick={onBack} aria-label="Back to lobby">
        <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </button>
      <div className="topbar__center">
        <Logo compact />
        <span className="mode-badge">{badge}</span>
      </div>
      <div className="topbar__right">
        {extra}
        <SoundToggle />
      </div>
    </header>
  );
}
